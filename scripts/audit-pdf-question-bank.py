from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


Q_MARKER = re.compile(r"(?mi)^\s*Q\s*\.?\s*(\d{1,3})(?=\D)")
NUMBER_MARKER = re.compile(r"(?mi)^\s*(\d{1,3})\s*[.)]\s+")
SOLUTION_Q = re.compile(r"(?mi)^\s*Q\s*\.?\s*(\d{1,3})\s*(?:Text\s+)?Solution\s*:")
ANSWER_HEADING = re.compile(r"(?i)\bANSWER\s*KEY\b")
SOLUTION_START = re.compile(r"(?mi)^\s*Q\s*\.?\s*1\s*(?:Text\s+)?Solution\s*:")
GENERIC_SOLUTION_HEADING = re.compile(r"(?mi)^\s*(?:HINTS?\s*(?:&|AND)\s*)?SOLUTIONS?\s*:?[ \t]*$")
VISUAL_LANGUAGE = re.compile(r"(?i)\b(?:diagram|graph|figure|shown below|given below|plot|circuit|ray diagram)\b")
YEAR_LANGUAGE = re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)")


# These files were visually checked after the automated pass.  The full papers
# live under the historical "phsyics/test" folder, but contain 45 questions for
# every NEET subject; folder-based attribution would therefore be wrong.
FULL_NEET_TESTS = {
    rf"phsyics\test\Test {number:02d}{suffix}"
    for number, suffix in (
        (5, " Physics by MR Sir..pdf"),
        (6, " Physics by MR Sir..pdf"),
        (7, " Physics by MR Sir..pdf"),
        (8, " Physics by MR Sir..pdf"),
        (9, "  Physics by MR Sir.pdf"),
        (10, " Physics by MR Sir.pdf"),
        (11, ".pdf"),
        (12, "  Physics by MR Sir.pdf"),
        (13, "  Physics by MR Sir.pdf"),
        (14, "  Physics by MR Sir.pdf"),
        (16, " Physics by MR Sir.pdf"),
        (18, " Physics by MR Sir.pdf"),
    )
}

VISUAL_OVERRIDES = {
    r"botany\pyq\Anatomy of Flowering Plants PYQs.pdf": {
        "questionCount": 32,
        "answerStatus": "ANSWER_KEY",
        "reviewNote": "Visually verified questions 1-32 and the 1-32 answer table on page 3.",
    },
    r"phsyics\test\Test 12  Physics by MR Sir.pdf": {
        "questionCount": 180,
        "answerStatus": "DETAILED_SOLUTIONS",
        "reviewNote": "Visually verified four 45-question subject sections, answer tables, and hints/explanations.",
    },
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sequence_count(numbers: list[int]) -> tuple[int, float]:
    valid = sorted({number for number in numbers if 1 <= number <= 500})
    if not valid:
        return 0, 0.0
    values = set(valid)
    contiguous = 0
    while contiguous + 1 in values:
        contiguous += 1
    if contiguous >= 3:
        return contiguous, contiguous / len(valid)
    maximum = max(valid)
    density = len(valid) / maximum
    if 1 not in valid or density < 0.55:
        return len(valid), density
    return maximum, density


def first_boundary(text: str) -> int:
    positions = []
    for pattern in (SOLUTION_START, GENERIC_SOLUTION_HEADING, ANSWER_HEADING):
        match = pattern.search(text)
        if match:
            positions.append(match.start())
    return min(positions) if positions else len(text)


def answer_key_status(text: str, question_count: int, solution_count: int) -> str:
    if question_count and solution_count >= max(1, int(question_count * 0.8)):
        return "DETAILED_SOLUTIONS"
    heading = ANSWER_HEADING.search(text)
    if not heading:
        return "NO_ANSWER_SECTION"
    tail = text[heading.end():]
    explicit = re.findall(r"(?mi)(?:^|\s)(?:Q\s*)?\d{1,3}\s*[.)]?\s*(?:[-:=]\s*)?\(?\s*([A-D1-4])\s*\)?", tail)
    blank = len(re.findall(r"(?mi)^\s*\d{1,3}\s*[.)]\s*\(\s*\)\s*$", tail))
    if blank >= max(3, question_count // 3):
        return "BLANK_ANSWER_KEY"
    if len(explicit) >= max(3, int(question_count * 0.5)):
        return "ANSWER_KEY"
    if question_count and re.search(r"(?s)(?:\d+\s+){5,}.*?(?:[a-d1-4]\s+){5,}", tail, re.I):
        return "COMPACT_ANSWER_KEY"
    return "ANSWER_SECTION_UNPARSED"


def answer_section_question_count(text: str) -> int:
    heading = ANSWER_HEADING.search(text)
    if not heading:
        return 0
    tail = text[heading.end():]
    candidates = []
    candidates.extend(int(value) for value in Q_MARKER.findall(tail))
    candidates.extend(int(value) for value in NUMBER_MARKER.findall(tail))
    best, _ = sequence_count(candidates)
    for line in tail.splitlines()[:40]:
        line_numbers = [int(value) for value in re.findall(r"(?<!\d)\d{1,3}(?!\d)", line)]
        line_count, _ = sequence_count(line_numbers)
        best = max(best, line_count)
    return best


def inspect_pdf(path: Path, root: Path) -> dict:
    relative = path.relative_to(root)
    parts = relative.parts
    subject = parts[0] if parts else "unknown"
    category = parts[1] if len(parts) > 2 else "uncategorized"
    result = {
        "path": str(path),
        "relativePath": str(relative),
        "subject": "physics" if subject.lower() == "phsyics" else subject.lower(),
        "category": category.lower(),
        "fileName": path.name,
        "byteSize": path.stat().st_size,
        "sha256": sha256_file(path),
        "pages": 0,
        "textPages": 0,
        "textCharacters": 0,
        "questionStyle": "UNKNOWN",
        "questionCount": 0,
        "markerDensity": 0.0,
        "answerStatus": "UNREADABLE",
        "solutionHeadingCount": 0,
        "visualLanguageHits": 0,
        "yearHits": 0,
        "isPyqPath": "pyq" in str(relative).lower(),
        "error": None,
    }
    try:
        reader = PdfReader(str(path), strict=False)
        page_text = []
        for page in reader.pages:
            extracted = page.extract_text() or ""
            page_text.append(extracted.replace("\x00", ""))
        text = "\n".join(page_text)
        result["pages"] = len(reader.pages)
        result["textPages"] = sum(1 for value in page_text if len(value.strip()) >= 40)
        result["textCharacters"] = len(text)
        boundary = first_boundary(text)
        question_region = text[:boundary]
        q_numbers = [int(value) for value in Q_MARKER.findall(question_region)]
        numeric_numbers = [int(value) for value in NUMBER_MARKER.findall(question_region)]
        q_count, q_density = sequence_count(q_numbers)
        numeric_count, numeric_density = sequence_count(numeric_numbers)
        if q_count and (q_density >= numeric_density or not numeric_count):
            result["questionStyle"] = "Q_PREFIX"
            result["questionCount"] = q_count
            result["markerDensity"] = round(q_density, 4)
        elif numeric_count:
            result["questionStyle"] = "NUMBER_PREFIX"
            result["questionCount"] = numeric_count
            result["markerDensity"] = round(numeric_density, 4)
        solution_numbers = {int(value) for value in SOLUTION_Q.findall(text)}
        generic_solution = GENERIC_SOLUTION_HEADING.search(text)
        numeric_solution_count = 0
        if generic_solution:
            numeric_solution_count, _ = sequence_count([int(value) for value in NUMBER_MARKER.findall(text[generic_solution.end():])])
        if not result["questionCount"] and numeric_solution_count:
            result["questionStyle"] = "SOLUTION_NUMBER_FALLBACK"
            result["questionCount"] = numeric_solution_count
            result["markerDensity"] = 1.0
        answer_count = answer_section_question_count(text)
        if answer_count > result["questionCount"]:
            result["questionCount"] = answer_count
            result["markerDensity"] = 1.0
            if result["questionStyle"] == "UNKNOWN":
                result["questionStyle"] = "ANSWER_KEY_COUNT_FALLBACK"
        result["solutionHeadingCount"] = max(len(solution_numbers), numeric_solution_count)
        result["answerStatus"] = answer_key_status(text, result["questionCount"], result["solutionHeadingCount"])
        result["visualLanguageHits"] = len(VISUAL_LANGUAGE.findall(question_region))
        result["yearHits"] = len(YEAR_LANGUAGE.findall(question_region))
    except Exception as error:  # keep the full corpus audit running
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def inspect_pdf_job(values: tuple[str, str]) -> dict:
    path, root = values
    return inspect_pdf(Path(path), Path(root))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=r"E:\projects\questions-bank")
    parser.add_argument("--output", default="data/question-bank-pdf-audit")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    files = sorted(root.rglob("*.pdf"))
    rows = []
    with ProcessPoolExecutor(max_workers=4) as executor:
        inspected = executor.map(inspect_pdf_job, [(str(path), str(root)) for path in files])
        for index, row in enumerate(inspected, 1):
            rows.append(row)
            if index % 25 == 0 or index == len(files):
                print(f"inspected {index}/{len(files)}", flush=True)

    hashes = defaultdict(list)
    for row in rows:
        override = VISUAL_OVERRIDES.get(row["relativePath"])
        if override:
            row.update(override)
            row["markerDensity"] = 1.0
        if row["relativePath"] in FULL_NEET_TESTS:
            row["subjectQuestionCounts"] = {
                "physics": 45,
                "chemistry": 45,
                "botany": 45,
                "zoology": 45,
            }
            row.setdefault("reviewNote", "Visually classified as a complete four-subject NEET paper.")
        else:
            row["subjectQuestionCounts"] = {row["subject"]: row["questionCount"]}
        row.setdefault("reviewNote", None)

    for row in rows:
        hashes[row["sha256"]].append(row["relativePath"])
    for row in rows:
        row["exactDuplicateCount"] = len(hashes[row["sha256"]])
        row["exactDuplicate"] = row["exactDuplicateCount"] > 1

    fields = list(rows[0].keys()) if rows else []
    with (output / "files.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with (output / "files.json").open("w", encoding="utf-8") as handle:
        json.dump(rows, handle, ensure_ascii=False, indent=2)

    unique_hashes = set()
    unique_questions = 0
    for row in rows:
        if row["sha256"] in unique_hashes:
            continue
        unique_hashes.add(row["sha256"])
        unique_questions += row["questionCount"]

    by_subject = defaultdict(lambda: {"files": 0, "pages": 0, "questions": 0})
    by_category = defaultdict(lambda: {"files": 0, "pages": 0, "questions": 0})
    for row in rows:
        subject_counts = row["subjectQuestionCounts"]
        subject_total = sum(subject_counts.values()) or 1
        for subject, question_count in subject_counts.items():
            # Pages are apportioned only for summary reporting; question totals
            # are exact after the visual overrides above.
            pages = round(row["pages"] * question_count / subject_total)
            for bucket, key in ((by_subject, subject), (by_category, f'{subject}/{row["category"]}')):
                bucket[key]["files"] += 1
                bucket[key]["pages"] += pages
                bucket[key]["questions"] += question_count

    status_counts = Counter(row["answerStatus"] for row in rows)
    status_question_counts = Counter()
    for row in rows:
        status_question_counts[row["answerStatus"]] += row["questionCount"]
    questionable = [
        row["relativePath"]
        for row in rows
        if (
            (row["questionCount"] == 0 and "solution" not in row["fileName"].lower())
            or (row["questionCount"] > 0 and row["markerDensity"] < 0.8 and row["answerStatus"] not in {"DETAILED_SOLUTIONS", "ANSWER_KEY", "COMPACT_ANSWER_KEY"})
            or (row["textPages"] < row["pages"] * 0.5 and "solution" not in row["fileName"].lower())
            or row["error"]
        )
    ]
    duplicate_groups = [paths for paths in hashes.values() if len(paths) > 1]
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "files": len(rows),
        "bytes": sum(row["byteSize"] for row in rows),
        "pages": sum(row["pages"] for row in rows),
        "rawQuestionEstimate": sum(row["questionCount"] for row in rows),
        "exactFileDeduplicatedQuestionEstimate": unique_questions,
        "exactDuplicateGroups": len(duplicate_groups),
        "exactDuplicateFiles": sum(len(paths) - 1 for paths in duplicate_groups),
        "answerStatus": dict(status_counts),
        "questionsByAnswerStatus": dict(status_question_counts),
        "pyqFiles": sum(1 for row in rows if row["isPyqPath"]),
        "pyqQuestionEstimate": sum(row["questionCount"] for row in rows if row["isPyqPath"]),
        "visualLanguageHits": sum(row["visualLanguageHits"] for row in rows),
        "filesWithVisualLanguage": sum(1 for row in rows if row["visualLanguageHits"]),
        "visualOverrides": VISUAL_OVERRIDES,
        "fullNeetPapers": sorted(FULL_NEET_TESTS),
        "filesNeedingManualOrVisualCountReview": len(questionable),
        "bySubject": dict(sorted(by_subject.items())),
        "bySubjectCategory": dict(sorted(by_category.items())),
        "questionableFiles": questionable,
        "duplicateGroups": duplicate_groups,
        "policy": {
            "countExcludesRepeatedSolutionHeadings": True,
            "blankAnswerKeysAreNotTreatedAsAnswers": True,
            "exactFileDuplicatesAreReportedSeparately": True,
            "fullNeetTestsAreAttributedAs45QuestionsPerSubject": True,
            "countsRemainEstimatesUntilQuestionableFilesAreVisuallyResolved": True,
        },
    }
    with (output / "report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps({key: report[key] for key in ("files", "pages", "rawQuestionEstimate", "exactFileDeduplicatedQuestionEstimate", "exactDuplicateGroups", "exactDuplicateFiles", "answerStatus", "questionsByAnswerStatus", "filesNeedingManualOrVisualCountReview", "bySubject")}, indent=2))


if __name__ == "__main__":
    main()
