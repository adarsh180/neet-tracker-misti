"""Match verified Biology PYQs to exact NCERT passages without inventing links.

The output remains an auditable manifest. Only unusually strong lexical matches
are marked VERIFIED_AUTO; every other suggestion stays out of the reader.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pdfplumber

try:
    import fitz  # PyMuPDF is substantially faster for the one-time positioned-text index.
except ImportError:  # Keep the licensed-source pipeline usable with its original dependency.
    fitz = None


STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "by", "can", "does", "for", "from", "has",
    "have", "in", "is", "it", "its", "of", "on", "or", "that", "the", "their", "these", "this", "to",
    "was", "were", "which", "with", "following", "given", "correct", "incorrect", "statement", "statements",
    "option", "options", "answer", "question", "most", "not", "all", "only", "respect", "regarding",
}


def clean(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = re.sub(r"[\ue000-\uf8ff]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def token_list(value: str) -> list[str]:
    normalized = re.sub(r"[^\w]+", " ", clean(value).casefold(), flags=re.UNICODE)
    return [token for token in normalized.split() if len(token) > 2 and token not in STOP_WORDS and not token.isdigit()]


def paragraph_hash(value: str) -> str:
    return hashlib.sha256(clean(value).casefold().encode("utf-8")).hexdigest()


def page_paragraphs(page: pdfplumber.page.Page, page_number: int) -> list[dict]:
    lines = [
        line for line in page.extract_text_lines(return_chars=False)
        if line["top"] > 42 and line["bottom"] < page.height - 34
    ]
    paragraphs: list[list[dict]] = []
    active: list[dict] = []
    for line in lines:
        text = clean(line["text"])
        if len(text) < 3 or re.fullmatch(r"\d+", text):
            continue
        if active:
            previous = active[-1]
            gap = line["top"] - previous["bottom"]
            indent_delta = abs(line["x0"] - active[0]["x0"])
            if gap > 10 or indent_delta > 44:
                paragraphs.append(active)
                active = []
        active.append({**line, "text": text})
    if active:
        paragraphs.append(active)

    results = []
    for group in paragraphs:
        text = clean(" ".join(line["text"] for line in group))
        if len(text) < 34 or len(token_list(text)) < 5:
            continue
        x0 = min(line["x0"] for line in group)
        top = min(line["top"] for line in group)
        x1 = max(line["x1"] for line in group)
        bottom = max(line["bottom"] for line in group)
        results.append({
            "pageNumber": page_number,
            "text": text,
            "normalizedHash": paragraph_hash(text),
            "bbox": {
                "x": round(x0 / page.width, 6),
                "y": round(top / page.height, 6),
                "width": round((x1 - x0) / page.width, 6),
                "height": round((bottom - top) / page.height, 6),
            },
        })
    return results


def fitz_page_paragraphs(page, page_number: int) -> list[dict]:
    results = []
    width = float(page.rect.width)
    height = float(page.rect.height)
    for block in page.get_text("dict", sort=True).get("blocks", []):
        if block.get("type") != 0:
            continue
        lines = []
        for line in block.get("lines", []):
            text = clean("".join(span.get("text", "") for span in line.get("spans", [])))
            if text and not re.fullmatch(r"\d+", text):
                lines.append(text)
        text = clean(" ".join(lines))
        if len(text) < 34 or len(token_list(text)) < 5:
            continue
        x0, top, x1, bottom = map(float, block["bbox"])
        if top <= 42 or bottom >= height - 34:
            continue
        results.append({
            "pageNumber": page_number,
            "text": text,
            "normalizedHash": paragraph_hash(text),
            "bbox": {
                "x": round(x0 / width, 6),
                "y": round(top / height, 6),
                "width": round((x1 - x0) / width, 6),
                "height": round((bottom - top) / height, 6),
            },
        })
    return results


def weighted_overlap(query_tokens: list[str], passage_tokens: set[str], idf: dict[str, float]) -> float:
    unique_query = set(query_tokens)
    total = sum(idf.get(token, 1.0) for token in unique_query)
    if not total:
        return 0.0
    shared = sum(idf.get(token, 1.0) for token in unique_query if token in passage_tokens)
    return shared / total


def index_document(document: dict, root_value: str) -> list[dict]:
    """Extract positioned passages in a worker so a full book set stays practical."""
    root = Path(root_value)
    pdf_path = root / document["pdfPath"]
    document_passages: list[dict] = []
    if fitz is not None:
        with fitz.open(pdf_path) as pdf:
            indexed_pages = (
                fitz_page_paragraphs(page, page_number)
                for page_number, page in enumerate(pdf, start=1)
            )
            page_passages = [passage for page in indexed_pages for passage in page]
    else:
        with pdfplumber.open(pdf_path) as pdf:
            indexed_pages = (
                page_paragraphs(page, page_number)
                for page_number, page in enumerate(pdf.pages, start=1)
            )
            page_passages = [passage for page in indexed_pages for passage in page]
    for passage in page_passages:
        passage.update({
            "document": {
                "subject": document["subject"],
                "classLevel": document["classLevel"],
                "chapter": document["chapter"],
                "title": document["title"],
                "edition": document["edition"],
                "sourceSha256": document["sourceSha256"],
            },
            "tokens": set(token_list(passage["text"])),
        })
        document_passages.append(passage)
    return document_passages


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    candidate_payload = json.loads(Path(args.candidates).read_text(encoding="utf-8"))

    biology_documents = [
        document for document in manifest["documents"]
        if document["subject"] in {"Botany", "Zoology"}
    ]
    passages: list[dict] = []
    workers = min(4, len(biology_documents))
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(index_document, document, str(root)): document["title"]
            for document in biology_documents
        }
        completed = 0
        for future in as_completed(futures):
            passages.extend(future.result())
            completed += 1
            print(f"Indexed {completed}/{len(biology_documents)}: {futures[future]}", flush=True)

    document_frequency = Counter()
    for passage in passages:
        document_frequency.update(passage["tokens"])
    idf = {
        token: math.log((len(passages) + 1) / (frequency + 1)) + 1
        for token, frequency in document_frequency.items()
    }

    matches = []
    for candidate in candidate_payload["candidates"]:
        options = candidate.get("optionsJson") or []
        indices = candidate.get("correctIndicesJson") or []
        if len(options) != 4 or len(indices) != 1:
            continue
        correct_index = indices[0]
        question_tokens = token_list(candidate["question"])
        answer_tokens = token_list(options[correct_index])
        explanation_tokens = token_list(candidate.get("explanation") or "")
        ranked = []
        for passage in passages:
            question_score = weighted_overlap(question_tokens, passage["tokens"], idf)
            answer_score = weighted_overlap(answer_tokens, passage["tokens"], idf)
            explanation_score = weighted_overlap(explanation_tokens, passage["tokens"], idf)
            shared = len((set(question_tokens) | set(answer_tokens)) & passage["tokens"])
            score = question_score * 0.56 + answer_score * 0.29 + explanation_score * 0.15
            if shared >= 3:
                ranked.append((score, shared, question_score, answer_score, passage))
        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked:
            continue
        best = ranked[0]
        runner_up_score = ranked[1][0] if len(ranked) > 1 else 0
        score, shared, question_score, answer_score, passage = best
        margin = score - runner_up_score
        verified = (
            score >= 0.58 and margin >= 0.08 and shared >= 5 and
            (answer_score >= 0.42 or question_score >= 0.68)
        )
        matches.append({
            "candidateId": candidate["id"],
            "exam": candidate["exam"],
            "examYear": candidate["examYear"],
            "paperCode": candidate["paperCode"],
            "paperQuestionNumber": candidate["paperQuestionNumber"],
            "question": candidate["question"],
            "options": options,
            "correctIndex": correct_index,
            "explanation": candidate["explanation"],
            "optionExplanations": candidate["optionExplanationsJson"],
            "verification": candidate["verificationJson"],
            "evidences": candidate["evidences"],
            "document": passage["document"],
            "passage": {
                "pageNumber": passage["pageNumber"],
                "text": passage["text"],
                "normalizedHash": passage["normalizedHash"],
                "bbox": passage["bbox"],
            },
            "match": {
                "score": round(score, 6),
                "margin": round(margin, 6),
                "sharedKeywords": shared,
                "questionCoverage": round(question_score, 6),
                "answerCoverage": round(answer_score, 6),
                "reviewStatus": "VERIFIED_AUTO" if verified else "NEEDS_REVIEW",
                "method": "NCERT_WEIGHTED_LEXICAL_V1",
            },
        })

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "sourceManifest": str(manifest_path),
        "passagesIndexed": len(passages),
        "candidatesExamined": len(candidate_payload["candidates"]),
        "verifiedMatches": sum(1 for match in matches if match["match"]["reviewStatus"] == "VERIFIED_AUTO"),
        "suggestedMatches": len(matches),
        "matches": matches,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in payload.items() if key != "matches"}, indent=2))


if __name__ == "__main__":
    main()
