"""Conservative extractor for two-column NEET/AIPMT paper PDFs.

The output is staging data, not live-bank data. Questions with graphical content,
ambiguous options, multiple official answers, or malformed extraction are marked
for visual review instead of being silently repaired.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


QUESTION_START = re.compile(r"^\s{0,14}(\d{1,3})\.\s+(.+)?$")
OPTION_MARKER = re.compile(r"(?<!\w)\(([1-4])\)\s*")
VISUAL_SIGNAL = re.compile(
    r"\b(?:figure|diagram|graph|plot|circuit|shown|schematic|image|following structure)\b",
    re.IGNORECASE,
)


def clean_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    symbol_map = str.maketrans({
        "\uf03d": "=", "\uf02b": "+", "\uf02d": "-", "\uf0b4": "×",
        "\uf0b7": "·", "\uf0b1": "±", "\uf0b0": "°", "\uf072": "",
    })
    value = value.translate(symbol_map).replace("\u0000", "")
    value = re.sub(r"[\ue000-\uf8ff]", "", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\s*\n\s*", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def content_hash(question: str, options: list[str]) -> str:
    normalized = clean_text(f"{question}|{'|'.join(options)}").casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def subject_for(number: int) -> str:
    if number <= 45:
        return "Physics"
    if number <= 90:
        return "Chemistry"
    if number <= 135:
        return "Botany"
    return "Zoology"


def page_reading_order(page: pdfplumber.page.Page) -> str:
    top = 24
    bottom = max(top + 1, page.height - 28)
    midpoint = page.width / 2
    left = page.crop((0, top, midpoint, bottom)).extract_text(
        x_tolerance=2, y_tolerance=3, layout=True
    ) or ""
    right = page.crop((midpoint, top, page.width, bottom)).extract_text(
        x_tolerance=2, y_tolerance=3, layout=True
    ) or ""
    return f"{left}\n{right}"


def split_questions(paper_path: Path) -> tuple[dict[int, str], dict[int, list[int]]]:
    chunks: dict[int, list[str]] = {}
    question_pages: dict[int, set[int]] = {}
    expected = 1
    active: int | None = None

    with pdfplumber.open(paper_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            if page_number == 1 and "Important Instructions" in (page.extract_text() or ""):
                continue
            for line in page_reading_order(page).splitlines():
                match = QUESTION_START.match(line)
                number = int(match.group(1)) if match else None
                if number == expected and expected <= 180:
                    active = expected
                    expected += 1
                    chunks[active] = [match.group(2) or ""]
                    question_pages[active] = {page_number}
                    continue
                if active is not None:
                    if re.search(r"NEET \(UG\)|\[Contd|ENGLISH$", line.strip(), re.IGNORECASE):
                        continue
                    chunks[active].append(line)
                    question_pages[active].add(page_number)

    return (
        {number: clean_text("\n".join(lines)) for number, lines in chunks.items()},
        {number: sorted(pages) for number, pages in question_pages.items()},
    )


def parse_question(raw: str) -> tuple[str, list[str], list[str]]:
    reasons: list[str] = []
    markers = list(OPTION_MARKER.finditer(raw))
    ordered: list[re.Match[str]] = []
    next_option = 1
    for marker in markers:
        number = int(marker.group(1))
        if number == next_option:
            ordered.append(marker)
            next_option += 1
            if next_option == 5:
                break

    if len(ordered) != 4:
        return clean_text(raw), [], ["FOUR_OPTIONS_NOT_RELIABLY_EXTRACTED"]

    question = clean_text(raw[: ordered[0].start()])
    options: list[str] = []
    for index, marker in enumerate(ordered):
        end = ordered[index + 1].start() if index < 3 else len(raw)
        options.append(clean_text(raw[marker.end() : end]))

    if len(question) < 12:
        reasons.append("QUESTION_TEXT_TOO_SHORT")
    if any(len(option) == 0 for option in options):
        reasons.append("EMPTY_OPTION")
    if any(len(option) > 800 for option in options):
        reasons.append("OPTION_BOUNDARY_SUSPECT")
    if VISUAL_SIGNAL.search(question):
        reasons.append("VISUAL_CONTENT_REQUIRES_CROP_REVIEW")
    if any("�" in text for text in [question, *options]):
        reasons.append("REPLACEMENT_CHARACTER_PRESENT")
    return question, options, reasons


def parse_solved_question(raw: str) -> tuple[str, list[str], str | None, list[str]]:
    answer_marker = re.search(r"\bAnswer\s*\(([1-4])\)\s*", raw, re.IGNORECASE)
    if not answer_marker:
        question, options, reasons = parse_question(raw)
        reasons.append("COACHING_SOLUTION_ANSWER_MARKER_NOT_FOUND")
        return question, options, None, reasons
    question, options, reasons = parse_question(raw[: answer_marker.start()])
    solution_text = raw[answer_marker.end() :]
    solution_text = re.sub(r"^\s*(?:Sol(?:ution)?\.?\s*)", "", solution_text, flags=re.IGNORECASE)
    explanation = clean_text(solution_text)
    if len(explanation) < 8:
        reasons.append("COACHING_SOLUTION_TEXT_TOO_SHORT")
        explanation = ""
    return question, options, explanation or None, reasons


def official_answers(answer_key_path: Path | None, paper_code: str) -> dict[int, list[int]]:
    if answer_key_path is None:
        return {}
    reader = PdfReader(str(answer_key_path))
    for page in reader.pages:
        text = page.extract_text() or ""
        code = re.search(
            r"(?:Test Booklet|Book)\s*Code\s*:\s*([A-Z0-9-]+)",
            text,
            re.IGNORECASE,
        )
        if not code or code.group(1).upper() != paper_code.upper():
            continue
        answers: dict[int, list[int]] = {}
        multi_answer_codes = {
            "A": [0, 1],
            "C": [0, 3],
            "D": [1, 2],
            "F": [2, 3],
        }
        for number, answer in re.findall(
            r"(?m)^\s*(\d{1,3})\s+([1-4ACDF](?:\s*,\s*[1-4])?)\s*$",
            text,
            re.IGNORECASE,
        ):
            normalized_answer = answer.replace(" ", "").upper()
            parsed = multi_answer_codes.get(normalized_answer)
            if parsed is None:
                parsed = [int(item) - 1 for item in normalized_answer.split(",")]
            answers[int(number)] = parsed
        return answers
    return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paper")
    parser.add_argument("--answer-key")
    parser.add_argument("--solution")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--paper-code", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--paper-url", required=True)
    parser.add_argument("--answer-key-url")
    parser.add_argument("--solution-url")
    parser.add_argument("--output")
    args = parser.parse_args()

    paper_path = Path(args.paper).resolve()
    key_path = Path(args.answer_key).resolve() if args.answer_key else None
    chunks, pages = split_questions(paper_path)
    solution_path = Path(args.solution).resolve() if args.solution else None
    solution_chunks: dict[int, str] = {}
    solution_pages: dict[int, list[int]] = {}
    if solution_path:
        solution_chunks, solution_pages = split_questions(solution_path)
    answers = official_answers(key_path, args.paper_code)
    rows = []
    for number in range(1, 181):
        raw = chunks.get(number, "")
        explanation = None
        solution_raw = solution_chunks.get(number, "")
        if solution_raw:
            solved_question, solved_options, explanation, solution_reasons = parse_solved_question(solution_raw)
            if solved_question and len(solved_options) == 4:
                question, options, reasons = solved_question, solved_options, solution_reasons
                pages[number] = solution_pages.get(number, pages.get(number, []))
            else:
                question, options, reasons = parse_question(raw) if raw else ("", [], ["QUESTION_NOT_EXTRACTED"])
                reasons.extend(solution_reasons)
        else:
            question, options, reasons = parse_question(raw) if raw else ("", [], ["QUESTION_NOT_EXTRACTED"])
        correct_indices = answers.get(number, [])
        if not correct_indices:
            reasons.append("OFFICIAL_ANSWER_NOT_FOUND")
        elif len(correct_indices) != 1:
            reasons.append("OFFICIAL_KEY_HAS_MULTIPLE_ACCEPTED_OPTIONS")
        option_explanations = None
        if explanation and len(options) == 4 and len(correct_indices) == 1:
            correct_index = correct_indices[0]
            correct_label = chr(65 + correct_index)
            option_explanations = [
                f"Correct. {explanation}" if index == correct_index else
                f"This option is not the verified answer. The reviewed solution supports option {correct_label}: {options[correct_index]}."
                for index in range(4)
            ]
        rows.append(
            {
                "paperQuestionNumber": number,
                "subject": subject_for(number),
                "question": question or None,
                "options": options or None,
                "correctIndices": correct_indices or None,
                "explanation": explanation,
                "optionExplanations": option_explanations,
                "normalizedHash": content_hash(question, options) if question and len(options) == 4 else None,
                "pages": pages.get(number, []),
                "extractionStatus": "EXTRACTED" if not reasons else "NEEDS_VISUAL_REVIEW",
                "reviewReasons": sorted(set(reasons)),
            }
        )

    result = {
        "exam": "NEET_UG",
        "examYear": args.year,
        "paperCode": args.paper_code,
        "provider": args.provider,
        "paperUrl": args.paper_url,
        "answerKeyUrl": args.answer_key_url,
        "solutionUrl": args.solution_url,
        "paperSha256": hashlib.sha256(paper_path.read_bytes()).hexdigest(),
        "answerKeySha256": hashlib.sha256(key_path.read_bytes()).hexdigest() if key_path else None,
        "solutionSha256": hashlib.sha256(solution_path.read_bytes()).hexdigest() if solution_path else None,
        "questions": rows,
        "summary": {
            "questionsLocated": len(chunks),
            "fourOptionQuestions": sum(1 for row in rows if row["options"] and len(row["options"]) == 4),
            "officialAnswersLocated": len(answers),
            "cleanlyExtracted": sum(1 for row in rows if row["extractionStatus"] == "EXTRACTED"),
            "needsVisualReview": sum(1 for row in rows if row["extractionStatus"] != "EXTRACTED"),
        },
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        output_path = Path(args.output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
        print(json.dumps({"output": str(output_path), **result["summary"]}, indent=2))
    else:
        print(rendered)


if __name__ == "__main__":
    main()
