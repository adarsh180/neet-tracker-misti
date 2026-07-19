#!/usr/bin/env python
"""
Stage Physics questions from local PDF source packs.

The script is intentionally conservative:
- It writes staged JSON/JSONL files, but does not touch the app database.
- A row is marked bankReady only when question text, 4 options, source key,
  and a real explanation are all bound with reasonable confidence.
- Visual/diagram-like rows stay staged until a visual asset is cropped/linked.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

try:
    import fitz  # PyMuPDF
except Exception as exc:  # pragma: no cover - environment guard
    print(f"PyMuPDF/fitz is required for PDF staging: {exc}", file=sys.stderr)
    sys.exit(1)


DEFAULT_SOURCE = r"E:\projects\questions-bank\phsyics"
DEFAULT_OUT = "data/physics-pdf-stage"

CHAPTER_RULES: list[tuple[str, str, list[str]]] = [
    ("Physics and Measurement", "11", [r"units? and measurements?", r"physics and measurement", r"physical world"]),
    ("Basic maths", "11", [r"\bbasic maths?\b", r"\basic maths?\b", r"calculus", r"mathematical tools?"]),
    ("1D", "11", [r"motion in (?:a )?straight line", r"motion in 1[- ]?d", r"\b1d\b"]),
    ("Kinematics", "11", [r"motion in (?:a )?plane", r"\bvectors?\b", r"projectile"]),
    ("Laws of Motion", "11", [r"laws? of motion", r"\bnlm\b"]),
    ("Work, Energy and Power", "11", [r"work[, ]+energy", r"work energy", r"\bwep\b"]),
    ("Rotational Motion", "11", [r"rotational motion", r"system of particles", r"centre of mass", r"\bc\.?o\.?m\b"]),
    ("Gravitation", "11", [r"gravitation"]),
    ("Properties of Solids and Liquids", "11", [r"mechanical properties of (?:solids|fluids)", r"properties of solids", r"properties of fluids", r"\bfluids?\b"]),
    ("Thermodynamics", "11", [r"thermodynamics"]),
    ("Kinetic Theory of Gases", "11", [r"kinetic theory", r"\bktg\b"]),
    ("Oscillations and Waves", "11", [r"oscillations?", r"simple harmonic", r"\bshm\b", r"wave motion", r"\bwaves?\b"]),
    ("Electrostatics", "12", [r"electric charges and fields?", r"\belectrostatics?\b"]),
    ("Capacitance", "12", [r"electrostatic potential", r"capacitance", r"capacitors?"]),
    ("Current Electricity", "12", [r"current electricity"]),
    ("Magnetic Effects of Current and Magnetism", "12", [r"moving charges", r"magnetism and matter", r"magnetic effects"]),
    ("Electromagnetic Induction and AC", "12", [r"electromagnetic induction", r"alternating current", r"\bemi\b", r"\bac\b"]),
    ("Electromagnetic Waves", "12", [r"electromagnetic waves?"]),
    ("Optics", "12", [r"ray optics", r"wave optics", r"\boptics\b"]),
    ("Dual Nature of Matter and Radiation", "12", [r"dual nature"]),
    ("Atoms and Nuclei", "12", [r"atoms?", r"nuclei", r"nuclear"]),
    ("Electronic Devices", "12", [r"semiconductor", r"electronic devices?"]),
    ("Experimental Skills", "12", [r"experimental skills?", r"practical physics"]),
]

VISUAL_RE = re.compile(
    r"\b(?:figure|fig\.?|diagram|graph|plot|shown|given below|circuit|ray diagram|v[- ]?t|x[- ]?t|p[- ]?v|lens|mirror)\b",
    re.I,
)
GRAPH_RE = re.compile(r"\b(?:graph|plot|v[- ]?t|x[- ]?t|p[- ]?v|slope|area under)\b", re.I)
ANSWER_KEY_HEADING_RE = re.compile(r"^\s*(?:answer key|answers?)\s*$", re.I)
SOLUTION_HEADING_RE = re.compile(r"^\s*(?:hints?\s*&\s*solutions?|solutions?|detailed solutions?)\s*$", re.I)
ANY_ANSWER_HEADING_RE = re.compile(r"^\s*(?:answer key|answers?|hints?\s*&\s*solutions?|solutions?|detailed solutions?)\s*$", re.I)
SECTION_BREAK_RE = re.compile(r"^\s*(?:chemistry|botany|zoology|biology)\s*$", re.I)
Q_STYLE_RE = re.compile(r"^\s*Q\s*\.?\s*(\d{1,4})\b", re.I)
NUM_STYLE_RE = re.compile(r"^\s*(\d{1,4})\s*\.\s*(.*)$")
INLINE_OPTION_RE = re.compile(
    r"(?<![\w/])(?:\(\s*([1-4A-Da-d])\s*\)|([1-4])\)|([A-Da-d])[\.)])\s+"
)
ANSWER_PAIR_RE = re.compile(r"(?<![\w/])(?:Q\s*)?(\d{1,3})\s*(?:[\.)]|\s)\s*\(?\s*([1-4A-Da-d])\s*\)?", re.I)
OPTION_MARKER_COUNT_RE = re.compile(r"(?<![\w/])\(\s*[1-4]\s*\)")
STOPWORDS = {
    "which",
    "following",
    "correct",
    "incorrect",
    "given",
    "below",
    "statement",
    "statements",
    "choose",
    "option",
    "options",
    "list",
    "match",
    "with",
    "from",
    "then",
    "find",
    "what",
    "when",
    "where",
    "will",
    "this",
    "that",
    "the",
    "and",
    "for",
    "are",
    "is",
    "has",
    "have",
    "its",
    "their",
    "value",
}


def clean_text(value: str) -> str:
    text = str(value or "")
    replacements = {
        "\ufeff": "",
        "\u00a0": " ",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\ufb01": "fi",
        "\ufb02": "fl",
        "\u00d7": " x ",
        "\u00b0": " degree",
        "\u2192": " -> ",
        "\uf0ae": "->",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", clean_text(value)).strip()


def stable_hash(*parts: str) -> str:
    raw = " ".join(parts).lower()
    raw = re.sub(r"[^\w]+", " ", raw, flags=re.UNICODE)
    raw = re.sub(r"\s+", " ", raw).strip()
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage local Physics PDF questions into JSON files.")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Root folder containing Physics PDFs.")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Output directory for staged data.")
    parser.add_argument("--limit-files", type=int, default=0, help="Only process the first N PDFs.")
    parser.add_argument("--folder", default="", help="Optional top-level folder filter, e.g. test or pyq.")
    parser.add_argument("--min-explanation", type=int, default=35, help="Minimum explanation chars for bankReady.")
    return parser.parse_args()


def infer_chapter(rel_path: Path) -> tuple[str, str]:
    text = " ".join(rel_path.parts).lower()
    text = re.sub(r"[_\-]+", " ", text)
    if re.search(r"electromagnetic waves?", text, re.I):
        return "Electromagnetic Waves", "12"
    if re.search(r"ray optics|wave optics|optical instruments?|\boptics\b", text, re.I):
        return "Optics", "12"
    for chapter, class_level, patterns in CHAPTER_RULES:
        if any(re.search(pattern, text, re.I) for pattern in patterns):
            return chapter, class_level
    return "Physics and Measurement", "11"


def infer_source(folder: str, file_name: str) -> tuple[str, str]:
    source_ref = f"PW {folder}: {file_name}".strip()[:240]
    if folder.lower() == "pyq" or re.search(r"\bpyq\b", file_name, re.I):
        return "NEET_PYQ", source_ref
    return "INSTITUTE", source_ref


def read_pdf(pdf_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    stats = {
        "pages": 0,
        "chars": 0,
        "imagePages": 0,
        "embeddedImages": 0,
        "error": "",
    }
    try:
        doc = fitz.open(pdf_path)
        stats["pages"] = doc.page_count
        for page_index, page in enumerate(doc, start=1):
            text = page.get_text("text")
            stats["chars"] += len(text)
            images = page.get_images(full=True)
            if images:
                stats["imagePages"] += 1
                stats["embeddedImages"] += len(images)
            for raw_line in text.splitlines():
                line = clean_text(raw_line)
                if line:
                    lines.append({"text": line, "page": page_index})
        doc.close()
    except Exception as exc:
        stats["error"] = str(exc)[:240]
    return lines, stats


def marker_positions(lines: list[dict[str, Any]], folder: str) -> tuple[str, list[tuple[int, int]]]:
    q_markers: list[tuple[int, int]] = []
    num_markers: list[tuple[int, int]] = []
    for idx, item in enumerate(lines):
        text = item["text"]
        q_match = Q_STYLE_RE.match(text)
        if q_match:
            q_no = int(q_match.group(1))
            if 1 <= q_no <= 500:
                q_markers.append((idx, q_no))
            continue
        num_match = NUM_STYLE_RE.match(text)
        if num_match:
            q_no = int(num_match.group(1))
            rest = num_match.group(2).strip()
            if 1 <= q_no <= 500 and not re.match(r"^\(?[1-4A-Da-d]\)?\s*$", rest):
                num_markers.append((idx, q_no))

    if len(q_markers) >= 5:
        markers = q_markers
        style = "Qn"
    else:
        markers = num_markers
        style = "numbered"

    if folder.lower() == "test":
        markers = [(idx, q_no) for idx, q_no in markers if 1 <= q_no <= 45]

    # Keep first occurrence of each question number. Later repeats are usually answer keys/solutions.
    seen: set[int] = set()
    primary: list[tuple[int, int]] = []
    for idx, q_no in markers:
        if q_no in seen:
            continue
        seen.add(q_no)
        primary.append((idx, q_no))
    return style, primary


def find_primary_cutoff(lines: list[dict[str, Any]], folder: str, first_marker_idx: int | None) -> int:
    if first_marker_idx is None:
        return len(lines)
    for idx in range(first_marker_idx + 1, len(lines)):
        text = lines[idx]["text"].strip()
        if folder.lower() == "test" and SECTION_BREAK_RE.match(text):
            return idx
        if ANY_ANSWER_HEADING_RE.match(text):
            return idx
    return len(lines)


def strip_question_marker(text: str, q_no: int) -> str:
    text = re.sub(rf"^\s*Q\s*\.?\s*{q_no}\b\s*[\).:-]?\s*", "", text, flags=re.I)
    text = re.sub(rf"^\s*{q_no}\s*\.\s*", "", text)
    return compact(text)


def option_label_to_index(label: str) -> int | None:
    label = label.strip().upper()
    if label in {"1", "2", "3", "4"}:
        return int(label) - 1
    if label in {"A", "B", "C", "D"}:
        return ord(label) - ord("A")
    return None


def parse_question_options(block_lines: list[str], q_no: int) -> tuple[str, list[str]]:
    raw = "\n".join(block_lines)
    flat = compact(raw)
    markers: list[tuple[int, int, int]] = []
    for match in INLINE_OPTION_RE.finditer(flat):
        label = match.group(1) or match.group(2) or match.group(3) or ""
        option_index = option_label_to_index(label)
        if option_index is None:
            continue
        markers.append((match.start(), match.end(), option_index))

    # Compound MCQs can contain an A-D statement list before the actual A-D
    # answer set. The final complete marker run preserves that list in the stem.
    chosen: list[tuple[int, int, int]] = []
    for start in range(0, max(0, len(markers) - 3)):
        run = markers[start : start + 4]
        if [entry[2] for entry in run] == [0, 1, 2, 3]:
            chosen = run
    if not chosen:
        return strip_question_marker(flat, q_no), []

    question = strip_question_marker(flat[: chosen[0][0]], q_no)
    options: list[str] = []
    for offset, marker in enumerate(chosen):
        option_start = marker[1]
        option_end = chosen[offset + 1][0] if offset + 1 < len(chosen) else len(flat)
        options.append(compact(flat[option_start:option_end]))
    options = [re.sub(r"\s*(?:NEET TEST BY MR SIR|PHYSICS WALLAH).*$", "", opt, flags=re.I).strip() for opt in options]
    return question, options


def bounded_region(lines: list[dict[str, Any]], start_idx: int, folder: str) -> list[dict[str, Any]]:
    end_idx = len(lines)
    if folder.lower() == "test":
        for idx in range(start_idx + 1, len(lines)):
            if SECTION_BREAK_RE.match(lines[idx]["text"].strip()):
                end_idx = idx
                break
    return lines[start_idx:end_idx]


def find_heading(lines: list[dict[str, Any]], pattern: re.Pattern[str]) -> int | None:
    for idx, item in enumerate(lines):
        if pattern.match(item["text"].strip()):
            return idx
    return None


def answer_key_region(lines: list[dict[str, Any]], folder: str) -> list[dict[str, Any]]:
    heading_idx = find_heading(lines, ANSWER_KEY_HEADING_RE)
    if heading_idx is not None:
        return bounded_region(lines, heading_idx, folder)
    return []


def solution_region(lines: list[dict[str, Any]], folder: str) -> list[dict[str, Any]]:
    heading_idx = find_heading(lines, SOLUTION_HEADING_RE)
    first_solution_idx = next(
        (idx for idx, item in enumerate(lines) if re.match(r"^\s*Q\s*\.?\s*\d{1,3}\b.*Text Solution", item["text"], re.I)),
        None,
    )
    starts = [idx for idx in (heading_idx, first_solution_idx) if idx is not None]
    if starts:
        return bounded_region(lines, min(starts), folder)
    # Fallback for PDFs that only have solutions without a heading.
    return lines[int(len(lines) * 0.6) :]


def parse_answer_map(lines: list[dict[str, Any]], folder: str) -> dict[int, int]:
    regions = [answer_key_region(lines, folder), solution_region(lines, folder)]
    found: dict[int, int] = {}
    for region in regions:
        text = " ".join(item["text"] for item in region)
        for match in ANSWER_PAIR_RE.finditer(text):
            q_no = int(match.group(1))
            if folder.lower() == "test" and q_no > 45:
                continue
            idx = option_label_to_index(match.group(2))
            if idx is None or q_no in found:
                continue
            found[q_no] = idx
    return found


def parse_explanation_map(lines: list[dict[str, Any]], folder: str) -> dict[int, dict[str, Any]]:
    region = solution_region(lines, folder)
    blocks: dict[int, list[str]] = {}
    leading_answer: dict[int, int] = {}
    current: int | None = None
    for item in region:
        text = item["text"]
        q_style = Q_STYLE_RE.match(text)
        if q_style:
            q_no = int(q_style.group(1))
            if folder.lower() == "test" and q_no > 45:
                current = None
                continue
            current = q_no
            blocks.setdefault(q_no, [])
            continue
        if re.match(r"^\s*Text Solution\s*:?\s*$", text, re.I):
            continue
        match = re.match(r"^\s*(\d{1,3})\s*[\.)]\s*(?:\(?\s*([1-4A-Da-d])\s*\)?\s*)?(.*)$", text)
        if match:
            q_no = int(match.group(1))
            if folder.lower() == "test" and q_no > 45:
                current = None
                continue
            if 1 <= q_no <= 300:
                current = q_no
                answer_label = match.group(2)
                tail = match.group(3).strip()
                answer_idx = option_label_to_index(answer_label or "")
                if answer_idx is not None:
                    leading_answer[q_no] = answer_idx
                blocks.setdefault(q_no, [])
                if tail:
                    blocks[q_no].append(tail)
                continue
        if current is not None:
            blocks.setdefault(current, []).append(text)

    explanations: dict[int, dict[str, Any]] = {}
    for q_no, block in blocks.items():
        text = compact(" ".join(block))
        # Plain answer-key regions produce tiny strings like "(2) 4. (1)".
        if len(text) < 35:
            continue
        if len(re.findall(r"\b\d{1,3}\s*[\.)]\s*\(?[1-4]\)?", text)) > 6 and len(text) < 180:
            continue
        explanations[q_no] = {"text": text[:2000], "leadingAnswer": leading_answer.get(q_no)}
    return explanations


def classify_form(question: str) -> str:
    q = question.lower()
    if "assertion" in q and "reason" in q:
        return "ASSERTION_REASON"
    if "match list" in q or "match the" in q or "column" in q:
        return "MATCH"
    if "statement i" in q or "given below are two statements" in q:
        return "STATEMENT"
    return "MCQ"


def content_tokens(text: str) -> set[str]:
    tokens = set()
    for token in re.findall(r"[A-Za-z][A-Za-z]{3,}", text.lower()):
        if token not in STOPWORDS:
            tokens.add(token)
    return tokens


def explanation_relevant(question: str, options: list[str], answer: int | None, explanation: str) -> bool:
    if len(explanation) < 35:
        return False
    q_tokens = content_tokens(question)
    e_tokens = content_tokens(explanation)
    if len(q_tokens & e_tokens) >= 3:
        return True
    if answer is not None and 0 <= answer < len(options):
        option_tokens = content_tokens(options[answer])
        if option_tokens and len(option_tokens & e_tokens) >= 1:
            return True
    return False


def explanation_has_substance(question: str, options: list[str], explanation: str) -> bool:
    residual = compact(explanation)
    q = compact(question)
    if q and residual.lower().startswith(q[: min(80, len(q))].lower()):
        residual = residual[len(q) :].strip()
    for option in options:
        option_text = compact(option)
        if option_text:
            residual = residual.replace(option_text, " ")
    residual = re.sub(r"\(?\s*[1-4A-Da-d]\s*\)?", " ", residual)
    residual = compact(residual)
    if len(residual) < 35:
        return False
    return bool(re.search(r"[=+\-x/]|because|hence|therefore|using|given|formula|law|equation|since|so", residual, re.I))


def normalized_compare(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", compact(value).lower())


def explanation_is_option_echo(question: str, options: list[str], explanation: str) -> bool:
    """Reject a repeated question/options block masquerading as a solution."""
    explanation_text = normalized_compare(explanation)
    question_text = normalized_compare(question)
    option_texts = [normalized_compare(option) for option in options]
    question_prefix = question_text[: min(120, len(question_text))]
    fuzzy_prefix = question_text[1 : min(120, len(question_text))]
    if len(question_text) < 20 or (question_prefix not in explanation_text and fuzzy_prefix not in explanation_text):
        return False
    matched_options = sum(1 for option in option_texts if option and option in explanation_text)
    if matched_options < 3:
        return False
    # Source solutions that genuinely restate a problem still contain a worked
    # derivation after it. The PDF sets processed here repeatedly use this exact
    # shape for answer-only pages, so repeating the stem plus >=3 choices is not
    # admissible as a solution without a later manual derivation pass.
    return True


def explanation_shape_mismatch(question: str, explanation: str) -> bool:
    question_has_statements = bool(re.search(r"\bstatement\s*(?:i|ii|1|2)\b", question, re.I))
    explanation_has_statements = bool(re.search(r"\bstatement\s*(?:i|ii|1|2)\b", explanation, re.I))
    return explanation_has_statements and not question_has_statements


def has_extraction_noise(question: str, options: list[str], explanation: str) -> bool:
    values = [question, explanation, *options]
    noise = re.compile(r"Master\s+NCERT|PW\s+Books\s+APP|PHYSICS\s+WALLAH|[âÃïÊË][^\s]?", re.I)
    return any(noise.search(value) for value in values) or any(len(option) > 180 for option in options)


def suspicious_options(options: list[str]) -> bool:
    if len(options) != 4:
        return True
    if any(not option.strip() for option in options):
        return True
    if any(len(option) > 500 for option in options):
        return True
    # A parsed option containing several answer-choice markers usually means the
    # parser grabbed a list/table body instead of the actual four options.
    if any(len(OPTION_MARKER_COUNT_RE.findall(option)) >= 2 for option in options):
        return True
    return False


def stage_pdf(pdf_path: Path, root: Path, min_explanation: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rel = pdf_path.relative_to(root)
    folder = rel.parts[0] if len(rel.parts) > 1 else "."
    chapter, class_level = infer_chapter(rel)
    source, source_ref = infer_source(folder, pdf_path.name)
    lines, pdf_stats = read_pdf(pdf_path)
    style, markers = marker_positions(lines, folder)
    first_marker = markers[0][0] if markers else None
    cutoff = find_primary_cutoff(lines, folder, first_marker)
    answer_map = parse_answer_map(lines, folder)
    explanation_map = parse_explanation_map(lines, folder)

    rows: list[dict[str, Any]] = []
    for pos, (line_idx, q_no) in enumerate(markers):
        if line_idx >= cutoff:
            continue
        next_idx = markers[pos + 1][0] if pos + 1 < len(markers) else cutoff
        if next_idx <= line_idx:
            continue
        block = [item["text"] for item in lines[line_idx:next_idx]]
        question, options = parse_question_options(block, q_no)
        if len(question) < 10 and not options:
            continue
        page_start = lines[line_idx]["page"]
        page_end = lines[min(next_idx - 1, len(lines) - 1)]["page"] if lines else page_start
        full_block = " ".join(block)
        visual = bool(VISUAL_RE.search(full_block))
        graph = bool(GRAPH_RE.search(full_block))
        answer = answer_map.get(q_no)
        explanation_entry = explanation_map.get(q_no, {})
        explanation = str(explanation_entry.get("text", ""))
        explanation_answer = explanation_entry.get("leadingAnswer")
        if isinstance(explanation_answer, int):
            if answer is None:
                answer = explanation_answer
            elif answer != explanation_answer:
                explanation = ""
        question_form = classify_form(question)
        option_suspicion = suspicious_options(options)
        relevant_explanation = explanation_relevant(question, options, answer, explanation)
        substantive_explanation = explanation_has_substance(question, options, explanation)
        option_echo = explanation_is_option_echo(question, options, explanation)
        shape_mismatch = explanation_shape_mismatch(question, explanation)
        extraction_noise = has_extraction_noise(question, options, explanation)
        confidence = 0.0
        confidence += 0.35 if len(question) >= 25 else 0.0
        confidence += 0.25 if len(options) == 4 and all(len(opt) >= 1 for opt in options) else 0.0
        confidence += 0.2 if answer is not None else 0.0
        confidence += 0.15 if len(explanation) >= min_explanation and relevant_explanation else 0.0
        confidence += 0.05 if not visual else 0.0
        leaked_section = bool(re.search(r"\b(?:CHEMISTRY|BOTANY|ZOOLOGY|BIOLOGY)\b", explanation))
        bank_ready = (
            len(options) == 4
            and answer is not None
            and len(explanation) >= min_explanation
            and len(question) >= 25
            and not visual
            and not leaked_section
            and not option_suspicion
            and relevant_explanation
            and substantive_explanation
            and not option_echo
            and not shape_mismatch
            and not extraction_noise
            and question_form == "MCQ"
            and folder.lower() != "test"
        )
        row = {
            "subject": "Physics",
            "classLevel": class_level,
            "chapter": chapter,
            "topic": None,
            "source": source,
            "sourceRef": f"{source_ref} Q{q_no} p{page_start}"[:240],
            "difficulty": "MODERATE",
            "question": question,
            "options": options,
            "correctIndex": answer,
            "explanation": explanation,
            "verified": False,
            "questionForm": question_form,
            "isDiagramBased": visual,
            "isGraphBased": graph,
            "visualAssetKind": "pdf_page" if visual else None,
            "visualMetaJson": {
                "sourceFile": str(rel).replace("\\", "/"),
                "pageStart": page_start,
                "pageEnd": page_end,
                "questionNo": q_no,
            },
            "stageMeta": {
                "sourceFile": str(rel).replace("\\", "/"),
                "folder": folder,
                "questionNo": q_no,
                "pageStart": page_start,
                "pageEnd": page_end,
                "markerStyle": style,
                "hasAnswer": answer is not None,
                "hasExplanation": len(explanation) >= min_explanation,
                "needsVisualAsset": visual,
                "sectionLeak": leaked_section,
                "solutionAnswerAgrees": explanation_answer is None or explanation_answer == answer,
                "explanationRelevant": relevant_explanation,
                "explanationSubstantive": substantive_explanation,
                "explanationOptionEcho": option_echo,
                "explanationShapeMismatch": shape_mismatch,
                "extractionNoise": extraction_noise,
                "suspiciousOptions": option_suspicion,
                "parseConfidence": round(confidence, 3),
                "bankReady": bank_ready,
                "contentHash": stable_hash(question, *options),
            },
        }
        rows.append(row)

    stats = {
        **pdf_stats,
        "file": str(rel).replace("\\", "/"),
        "folder": folder,
        "chapter": chapter,
        "classLevel": class_level,
        "markerStyle": style,
        "markers": len(markers),
        "stagedRows": len(rows),
        "bankReadyRows": sum(1 for row in rows if row["stageMeta"]["bankReady"]),
        "withAnswer": sum(1 for row in rows if row["stageMeta"]["hasAnswer"]),
        "withExplanation": sum(1 for row in rows if row["stageMeta"]["hasExplanation"]),
        "needsVisualAsset": sum(1 for row in rows if row["stageMeta"]["needsVisualAsset"]),
    }
    return rows, stats


def bank_import_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject": row["subject"],
        "classLevel": row["classLevel"],
        "chapter": row["chapter"],
        "topic": row["topic"],
        "source": row["source"],
        "sourceRef": row["sourceRef"],
        "difficulty": row["difficulty"],
        "question": row["question"],
        "optionA": row["options"][0],
        "optionB": row["options"][1],
        "optionC": row["options"][2],
        "optionD": row["options"][3],
        "correctIndex": row["correctIndex"],
        "explanation": row["explanation"],
        "questionForm": row["questionForm"],
        "isDiagramBased": False,
        "isGraphBased": False,
        "sourceQuality": 0.92,
        "trendMetaJson": row["stageMeta"],
    }


def main() -> None:
    args = parse_args()
    source = Path(args.source)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        raise SystemExit(f"Source path does not exist: {source}")

    pdfs = sorted(source.rglob("*.pdf"))
    if args.folder:
        pdfs = [pdf for pdf in pdfs if pdf.relative_to(source).parts and pdf.relative_to(source).parts[0].lower() == args.folder.lower()]
    if args.limit_files:
        pdfs = pdfs[: args.limit_files]

    all_rows: list[dict[str, Any]] = []
    file_stats: list[dict[str, Any]] = []
    invalid_errors: list[dict[str, str]] = []
    for pdf in pdfs:
        rows, stats = stage_pdf(pdf, source, args.min_explanation)
        all_rows.extend(rows)
        file_stats.append(stats)
        if stats.get("error"):
            invalid_errors.append({"file": stats["file"], "error": stats["error"]})

    bank_ready = [bank_import_row(row) for row in all_rows if row["stageMeta"]["bankReady"]]
    review_rows = [row for row in all_rows if not row["stageMeta"]["bankReady"]]

    by_folder: dict[str, Counter[str]] = defaultdict(Counter)
    by_chapter: dict[str, Counter[str]] = defaultdict(Counter)
    for row in all_rows:
        meta = row["stageMeta"]
        folder = meta["folder"]
        chapter = row["chapter"]
        by_folder[folder]["staged"] += 1
        by_chapter[chapter]["staged"] += 1
        if meta["bankReady"]:
            by_folder[folder]["bankReady"] += 1
            by_chapter[chapter]["bankReady"] += 1
        if meta["hasAnswer"]:
            by_folder[folder]["withAnswer"] += 1
            by_chapter[chapter]["withAnswer"] += 1
        if meta["hasExplanation"]:
            by_folder[folder]["withExplanation"] += 1
            by_chapter[chapter]["withExplanation"] += 1
        if meta["needsVisualAsset"]:
            by_folder[folder]["needsVisualAsset"] += 1
            by_chapter[chapter]["needsVisualAsset"] += 1

    report = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceRoot": str(source),
        "pdfsScanned": len(pdfs),
        "pages": sum(int(item.get("pages", 0)) for item in file_stats),
        "stagedRows": len(all_rows),
        "bankReadyRows": len(bank_ready),
        "reviewRows": len(review_rows),
        "withAnswer": sum(1 for row in all_rows if row["stageMeta"]["hasAnswer"]),
        "withExplanation": sum(1 for row in all_rows if row["stageMeta"]["hasExplanation"]),
        "needsVisualAsset": sum(1 for row in all_rows if row["stageMeta"]["needsVisualAsset"]),
        "embeddedImages": sum(int(item.get("embeddedImages", 0)) for item in file_stats),
        "imagePages": sum(int(item.get("imagePages", 0)) for item in file_stats),
        "errors": invalid_errors,
        "byFolder": {key: dict(value) for key, value in sorted(by_folder.items())},
        "byChapter": {key: dict(value) for key, value in sorted(by_chapter.items())},
        "fileStats": file_stats,
    }

    (out / "physics-pdf-questions.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in all_rows),
        encoding="utf-8",
    )
    (out / "physics-pdf-bank-ready.json").write_text(json.dumps(bank_ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "physics-pdf-review.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in review_rows),
        encoding="utf-8",
    )
    (out / "physics-pdf-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({key: report[key] for key in [
        "pdfsScanned",
        "pages",
        "stagedRows",
        "bankReadyRows",
        "reviewRows",
        "withAnswer",
        "withExplanation",
        "needsVisualAsset",
        "embeddedImages",
        "imagePages",
    ]}, indent=2))
    print(f"Report: {out / 'physics-pdf-report.json'}")
    print(f"Bank-ready import rows: {out / 'physics-pdf-bank-ready.json'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
