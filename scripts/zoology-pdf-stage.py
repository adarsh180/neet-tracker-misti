#!/usr/bin/env python
"""
Stage Zoology or Botany questions from local PhysicsWallah PDF source packs.

Mirrors scripts/physics-pdf-stage.py, with three differences that the zoology
material forces:
- The PDFs are two-column. We rebuild reading order column-by-column instead of
  trusting raw text-line order (which interleaves the two columns).
- Only the long "Kattar NEET 2026" packs ship full "Text Solution" explanations.
  Per project decision (real-explanation only), a row is bankReady only when a
  genuine explanation is bound. Answer-key-only rows are routed to a parked file.
- Visual (diagram/match/graph) rows are cropped to a PNG so they can be served.

The script never touches the app database. It writes staged JSON/JSONL plus, for
visual rows, cropped page images under public/bank-visuals/zoology.
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


DEFAULT_SOURCES = {
    "Zoology": r"E:\projects\questions-bank\zoology",
    "Botany": r"E:\projects\questions-bank\botany",
}

# Chapter is encoded cleanly in the filename, so filename rules are reliable.
# Order matters: more specific patterns first.
ZOOLOGY_CHAPTER_RULES: list[tuple[str, str, list[str]]] = [
    ("Structural Organisation in Animals", "11", [r"structural organi[sz]ation", r"animal tissues?", r"\bfrog\b", r"cockroach", r"earthworm"]),
    ("Animal Kingdom", "11", [r"animal kingdom", r"classification of animals", r"non[- ]?chordata", r"\bchordata\b"]),
    ("Biomolecules", "11", [r"biomolecule"]),
    ("Digestion and Absorption", "11", [r"digestion", r"absorption", r"alimentary"]),
    ("Breathing and Exchange of Gases", "11", [r"breathing", r"exchange of gases", r"respiratory system"]),
    ("Body Fluids and Circulation", "11", [r"body fluids?", r"circulation", r"circulatory"]),
    ("Excretory Products and their Elimination", "11", [r"excretory", r"excretion", r"osmoregulation"]),
    ("Locomotion and Movement", "11", [r"locomotion", r"movement"]),
    ("Neural Control and Coordination", "11", [r"neural control", r"nervous system"]),
    ("Chemical Coordination and Integration", "11", [r"chemical coordination", r"endocrine", r"\bhormones?\b"]),
    ("Human Reproduction", "12", [r"human reproduction"]),
    ("Reproductive Health", "12", [r"reproductive health"]),
    ("Evolution", "12", [r"evolution", r"\bdarwin"]),
    ("Human Health and Disease", "12", [r"human health", r"\bdiseases?\b", r"immunity"]),
    ("Microbes in Human Welfare", "12", [r"microbes? in human welfare"]),
    ("Biotechnology and its Applications", "12", [r"biotechnology.*application", r"biotechnology and it'?s application"]),
    ("Biotechnology Principles and Processes", "12", [r"biotechnology[ -]*principles", r"biotechnology - principles", r"principles and processes"]),
    ("Strategies for Enhancement in Food Production", "12", [r"animal husbandry", r"food production", r"apiculture", r"fisheries"]),
    ("Ecosystem", "12", [r"\becosystem\b"]),
    ("Organisms and Populations", "12", [r"organisms and populations"]),
    ("Biodiversity and Conservation", "12", [r"biodiversity", r"conservation"]),
]

BOTANY_CHAPTER_RULES: list[tuple[str, str, list[str]]] = [
    ("Anatomy of Flowering Plants", "11", [r"anatomy of flowering"]),
    ("Morphology of Flowering Plants", "11", [r"morphology of flowering"]),
    ("Biological Classification", "11", [r"biological classification"]),
    ("Cell Cycle and Cell Division", "11", [r"cell cycle", r"cell division"]),
    ("Cell: The Unit of Life", "11", [r"cell\s*[-:]?\s*the unit", r"cell the unit"]),
    ("Photosynthesis in Higher Plants", "11", [r"photosynthesis"]),
    ("Respiration in Plants", "11", [r"respiration in plants"]),
    ("Plant Growth and Development", "11", [r"plant growth", r"growth and development"]),
    ("Plant Kingdom", "11", [r"plant kingdom"]),
    ("The Living World", "11", [r"living world"]),
    ("Sexual Reproduction in Flowering Plants", "12", [r"sexual reproduction in flowering"]),
    ("Principles of Inheritance and Variation", "12", [r"principles? of inheritance", r"inheritance and variation"]),
    ("Molecular Basis of Inheritance", "12", [r"molecular basis"]),
    ("Microbes in Human Welfare", "12", [r"microbes? in human welfare"]),
    ("Organisms and Populations", "12", [r"organisms? and populations?"]),
    ("Ecosystem", "12", [r"\becosystem\b"]),
    ("Biodiversity and Conservation", "12", [r"biodiversity", r"conservation"]),
]

VISUAL_RE = re.compile(
    r"\b(?:figure|fig\.?|diagram|shown|given below|labelled?|label the|match (?:list|the|column)|column[- ]?i\b|graph|plot)\b",
    re.I,
)
GRAPH_RE = re.compile(r"\b(?:graph|plot|slope|area under|curve)\b", re.I)
ANSWER_KEY_HEADING_RE = re.compile(r"^\s*(?:answer key|answers?)\s*:?\s*$", re.I)
SOLUTION_HEADING_RE = re.compile(r"^\s*(?:hints?\s*&\s*solutions?|solutions?|detailed solutions?)\s*:?\s*$", re.I)
ANY_ANSWER_HEADING_RE = re.compile(r"^\s*(?:answer key|answers?|hints?\s*&\s*solutions?|solutions?|detailed solutions?)\s*:?\s*$", re.I)
# Cross-subject leakage is selected dynamically for Zoology vs Botany.
Q_STYLE_RE = re.compile(r"^\s*Q\s*\.?\s*(\d{1,4})\b", re.I)
NUM_STYLE_RE = re.compile(r"^\s*(\d{1,4})\s*\.\s*(.*)$")
INLINE_OPTION_RE = re.compile(
    r"(?<![\w/])(?:\(\s*([1-4A-Da-d])\s*\)|([1-4])\)|([A-Da-d])[\.)])\s+"
)
ANSWER_PAIR_RE = re.compile(r"(?<![\w/])(?:Q\s*)?(\d{1,3})\s*(?:[\.)]|\s)\s*\(?\s*([1-4A-Da-d])\s*\)?", re.I)
OPTION_MARKER_COUNT_RE = re.compile(r"(?<![\w/])\(\s*[1-4]\s*\)")
NOISE_TAIL_RE = re.compile(r"\s*(?:master ncert with pw books app|pw web/app.*|library - https?://\S+).*$", re.I)
# PhysicsWallah watermark/footer fragments that the two-column reader interleaves
# into real lines. Stripped globally (anywhere in a line), not just at the tail.
WATERMARK_RE = re.compile(
    r"master\s+ncert(?:\s+with\s+pw\s+books\s+app|\s+neet)?"
    r"|with\s+pw\s+books\s+app"
    r"|(?:i\s*os|android)\s+app(?:\s*\|)?"
    r"|pw\s+(?:web\s*(?:site|/\s*app)?|app)\b"
    r"|library\s*-\s*https?://\S+"
    r"|https?://\S+|smart\.link/\S+",
    re.I,
)


def strip_watermarks(text: str) -> str:
    return re.sub(r"\s{2,}", " ", WATERMARK_RE.sub(" ", text)).strip()


# Running header/footer tokens. A line is dropped only when it both sits in a
# page margin band AND matches one of these, so body text is never affected.
HEADER_FOOTER_RE = re.compile(
    r"\b(?:neet|kattar|master\s+ncert|pw\s+books|pw\s+web|library|smart\.link"
    r"|ma'?am|agarwal|sinha|zoology\s+by|botany\s+by)\b",
    re.I,
)
STOPWORDS = {
    "which", "following", "correct", "incorrect", "given", "below", "statement",
    "statements", "choose", "option", "options", "list", "match", "with", "from",
    "then", "find", "what", "when", "where", "will", "this", "that", "the", "and",
    "for", "are", "is", "has", "have", "its", "their", "value", "select",
}


def clean_text(value: str) -> str:
    text = str(value or "")
    replacements = {
        "﻿": "",
        " ": " ",
        "–": "-",
        "—": "-",
        "−": "-",
        "ﬁ": "fi",
        "ﬂ": "fl",
        "×": " x ",
        "°": " degree",
        "→": " -> ",
        "": "->",
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
    parser = argparse.ArgumentParser(description="Stage local Zoology or Botany PDF questions into JSON files.")
    parser.add_argument("--subject", choices=("Zoology", "Botany"), default="Zoology")
    parser.add_argument("--source", default="", help="Root folder containing the selected subject PDFs.")
    parser.add_argument("--out", default="", help="Output directory for staged data.")
    parser.add_argument("--visual-out", default="", help="Output directory for cropped visual PNGs.")
    parser.add_argument("--limit-files", type=int, default=0, help="Only process the first N PDFs.")
    parser.add_argument("--folder", default="", help="Optional top-level folder filter, e.g. pyq or kattar.")
    parser.add_argument("--min-explanation", type=int, default=35, help="Minimum explanation chars for bankReady.")
    parser.add_argument("--no-visuals", action="store_true", help="Skip rendering cropped visual PNGs.")
    return parser.parse_args()


def infer_chapter(rel_path: Path, subject: str) -> tuple[str, str]:
    text = " ".join(rel_path.parts).lower()
    text = re.sub(r"[_\-]+", " ", text)
    chapter_rules = BOTANY_CHAPTER_RULES if subject == "Botany" else ZOOLOGY_CHAPTER_RULES
    for chapter, class_level, patterns in chapter_rules:
        if any(re.search(pattern, text, re.I) for pattern in patterns):
            return chapter, class_level
    return ("The Living World", "11") if subject == "Botany" else ("Animal Kingdom", "11")


def infer_source(folder: str, file_name: str) -> tuple[str, str]:
    source_ref = f"PW {folder}: {file_name}".strip()[:240]
    if folder.lower() == "pyq" or re.search(r"\bpyq", file_name, re.I):
        return "NEET_PYQ", source_ref
    return "INSTITUTE", source_ref


def infer_difficulty(folder: str) -> str:
    # "kattar" packs are the hardcore application sets; others default moderate.
    return "TOUGH" if folder.lower() == "kattar" else "MODERATE"


def column_split(words: list[tuple], page_width: float) -> float:
    """Find the gutter x for a two-column page; fall back to width/2."""
    mid = page_width / 2
    band = [w for w in words if 0.40 * page_width <= (w[0] + w[2]) / 2 <= 0.60 * page_width]
    # If the central band is sparse relative to the page, it is a real gutter.
    if words and len(band) / max(1, len(words)) < 0.08:
        return mid
    return mid


def build_lines(doc: "fitz.Document", chapter_re: "re.Pattern[str] | None" = None) -> tuple[list[dict[str, Any]], dict[int, tuple[float, float]], dict[str, Any]]:
    """Rebuild reading order column-by-column. Each line carries page/col/bbox.

    Drops running headers/footers (margin band + header tokens) and the page-1
    cover title block (short lines high on page 1 matching header/chapter tokens),
    which otherwise interleave into question text across column/page boundaries.
    """
    lines: list[dict[str, Any]] = []
    page_dims: dict[int, tuple[float, float]] = {}
    stats = {"pages": doc.page_count, "chars": 0, "imagePages": 0, "embeddedImages": 0, "error": ""}
    for page_index in range(doc.page_count):
        page = doc[page_index]
        page_dims[page_index + 1] = (page.rect.width, page.rect.height)
        words = page.get_text("words")
        stats["chars"] += sum(len(w[4]) for w in words)
        images = page.get_images(full=True)
        if images:
            stats["imagePages"] += 1
            stats["embeddedImages"] += len(images)
        if not words:
            continue
        page_height = page.rect.height
        gutter = column_split(words, page.rect.width)
        # Group words into (column, y-band) buckets.
        buckets: dict[tuple[int, int], list[tuple]] = defaultdict(list)
        for w in words:
            x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
            col = 0 if (x0 + x1) / 2 < gutter else 1
            buckets[(col, round(y0 / 3))].append((x0, y0, x1, y1, text))
        for (col, _yk) in sorted(buckets, key=lambda k: (k[0], k[1])):
            group = sorted(buckets[(col, _yk)], key=lambda g: g[0])
            text = strip_watermarks(clean_text(" ".join(g[4] for g in group)))
            if not text:
                continue
            line_y0 = min(g[1] for g in group)
            line_y1 = max(g[3] for g in group)
            in_margin = line_y0 < 55 or line_y1 > page_height - 45
            if in_margin and HEADER_FOOTER_RE.search(text):
                continue
            short = len(text.split()) <= 6
            is_cover = page_index == 0 and line_y0 < 150
            if is_cover and short and (HEADER_FOOTER_RE.search(text) or (chapter_re and chapter_re.search(text))):
                continue
            lines.append({
                "text": text,
                "page": page_index + 1,
                "col": col,
                "x0": min(g[0] for g in group),
                "y0": min(g[1] for g in group),
                "x1": max(g[2] for g in group),
                "y1": max(g[3] for g in group),
            })
    return lines, page_dims, stats


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
        markers, style = q_markers, "Qn"
    else:
        markers, style = num_markers, "numbered"

    seen: set[int] = set()
    primary: list[tuple[int, int]] = []
    for idx, q_no in markers:
        if q_no in seen:
            continue
        seen.add(q_no)
        primary.append((idx, q_no))
    return style, primary


def find_primary_cutoff(lines: list[dict[str, Any]], first_marker_idx: int | None) -> int:
    if first_marker_idx is None:
        return len(lines)
    for idx in range(first_marker_idx + 1, len(lines)):
        text = lines[idx]["text"].strip()
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
    flat = compact(NOISE_TAIL_RE.sub("", raw))
    markers: list[tuple[int, int, int]] = []
    for match in INLINE_OPTION_RE.finditer(flat):
        label = match.group(1) or match.group(2) or match.group(3) or ""
        option_index = option_label_to_index(label)
        if option_index is None:
            continue
        markers.append((match.start(), match.end(), option_index))

    # Compound MCQs can contain an A-D statement list followed by the actual
    # A-D answer choices. The final complete marker run is the answer set; using
    # the first run truncates the stem and binds the statements as options.
    chosen: list[tuple[int, int, int]] = []
    for start in range(0, max(0, len(markers) - 3)):
        run = markers[start: start + 4]
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
    options = [NOISE_TAIL_RE.sub("", opt).strip() for opt in options]
    return question, options


def find_heading(lines: list[dict[str, Any]], pattern: re.Pattern[str]) -> int | None:
    for idx, item in enumerate(lines):
        if pattern.match(item["text"].strip()):
            return idx
    return None


def answer_key_region(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    heading_idx = find_heading(lines, ANSWER_KEY_HEADING_RE)
    if heading_idx is not None:
        return lines[heading_idx:]
    return []


def solution_region(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    heading_idx = find_heading(lines, SOLUTION_HEADING_RE)
    first_solution_idx = next(
        (idx for idx, item in enumerate(lines) if re.match(r"^\s*Q\s*\.?\s*\d{1,3}\b.*Text Solution", item["text"], re.I)),
        None,
    )
    starts = [idx for idx in (heading_idx, first_solution_idx) if idx is not None]
    if starts:
        return lines[min(starts):]
    return []


def parse_answer_map(lines: list[dict[str, Any]]) -> dict[int, int]:
    regions = [answer_key_region(lines), solution_region(lines)]
    found: dict[int, int] = {}
    for region in regions:
        text = " ".join(item["text"] for item in region)
        for match in ANSWER_PAIR_RE.finditer(text):
            q_no = int(match.group(1))
            idx = option_label_to_index(match.group(2))
            if idx is None or q_no in found:
                continue
            found[q_no] = idx
    return found


def parse_explanation_map(lines: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    region = solution_region(lines)
    blocks: dict[int, list[str]] = {}
    leading_answer: dict[int, int] = {}
    current: int | None = None
    for item in region:
        text = item["text"]
        q_style = Q_STYLE_RE.match(text)
        if q_style:
            current = int(q_style.group(1))
            blocks.setdefault(current, [])
            continue
        if re.match(r"^\s*Text Solution\s*:?\s*$", text, re.I):
            continue
        match = re.match(r"^\s*(\d{1,3})\s*[\.)]\s*(?:\(?\s*([1-4A-Da-d])\s*\)?\s*)?(.*)$", text)
        if match:
            q_no = int(match.group(1))
            if 1 <= q_no <= 300:
                current = q_no
                answer_idx = option_label_to_index(match.group(2) or "")
                if answer_idx is not None:
                    leading_answer[q_no] = answer_idx
                blocks.setdefault(q_no, [])
                tail = match.group(3).strip()
                if tail:
                    blocks[q_no].append(tail)
                continue
        if current is not None:
            blocks.setdefault(current, []).append(text)

    explanations: dict[int, dict[str, Any]] = {}
    for q_no, block in blocks.items():
        text = compact(NOISE_TAIL_RE.sub("", " ".join(block)))
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
    return {t for t in re.findall(r"[A-Za-z][A-Za-z]{3,}", text.lower()) if t not in STOPWORDS}


def explanation_relevant(question: str, options: list[str], answer: int | None, explanation: str) -> bool:
    if len(explanation) < 35:
        return False
    q_tokens = content_tokens(question)
    e_tokens = content_tokens(explanation)
    if len(q_tokens & e_tokens) >= 2:
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
        residual = residual[len(q):].strip()
    for option in options:
        option_text = compact(option)
        if option_text:
            residual = residual.replace(option_text, " ")
    residual = re.sub(r"\(?\s*[1-4A-Da-d]\s*\)?", " ", residual)
    residual = compact(residual)
    if len(residual) < 35:
        return False
    return bool(re.search(r"[=+\-x/]|because|hence|therefore|due to|since|so|characteristic|present|absent|found|known|called", residual, re.I))


def suspicious_options(options: list[str]) -> bool:
    if len(options) != 4:
        return True
    if any(not option.strip() for option in options):
        return True
    if any(len(option) > 500 for option in options):
        return True
    if any(len(OPTION_MARKER_COUNT_RE.findall(option)) >= 2 for option in options):
        return True
    return False


def crop_visual(doc: "fitz.Document", row_lines: list[dict[str, Any]], next_line: dict[str, Any] | None,
                page_dims: dict[int, tuple[float, float]], visual_dir: Path, content_hash: str,
                visual_url_prefix: str) -> str | None:
    """Render the column slice that holds a visual question to a PNG; return its URL."""
    if not row_lines:
        return None
    head = row_lines[0]
    page_no = head["page"]
    col = head["col"]
    width, height = page_dims.get(page_no, (612.0, 792.0))
    mid = width / 2
    x_lo, x_hi = (0.0, mid) if col == 0 else (mid, width)
    y_top = max(0.0, min(ln["y0"] for ln in row_lines) - 6)
    if next_line is not None and next_line["page"] == page_no and next_line["col"] == col:
        y_bot = max(y_top + 20, next_line["y0"] - 2)
    else:
        y_bot = height
    rect = fitz.Rect(x_lo + 2, y_top, x_hi - 2, y_bot)
    if rect.is_empty or rect.height < 24:
        return None
    try:
        page = doc[page_no - 1]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect)
        visual_dir.mkdir(parents=True, exist_ok=True)
        out_path = visual_dir / f"{content_hash}.png"
        pix.save(out_path)
    except Exception:
        return None
    return f"{visual_url_prefix}/{content_hash}.png"


def stage_pdf(pdf_path: Path, root: Path, min_explanation: int, visual_dir: Path, render_visuals: bool,
              subject_name: str, visual_url_prefix: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rel = pdf_path.relative_to(root)
    folder = rel.parts[0] if len(rel.parts) > 1 else "."
    chapter, class_level = infer_chapter(rel, subject_name)
    source, source_ref = infer_source(folder, pdf_path.name)
    difficulty = infer_difficulty(folder)

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        return [], {"file": str(rel).replace("\\", "/"), "folder": folder, "error": str(exc)[:240], "stagedRows": 0}

    chapter_tokens = [re.escape(w) for w in re.findall(r"[A-Za-z]{4,}", chapter) if w.lower() not in {"their", "with", "and", "the"}]
    chapter_re = re.compile(r"\b(?:" + "|".join(chapter_tokens) + r")\b", re.I) if chapter_tokens else None
    lines, page_dims, pdf_stats = build_lines(doc, chapter_re)
    style, markers = marker_positions(lines, folder)
    first_marker = markers[0][0] if markers else None
    cutoff = find_primary_cutoff(lines, first_marker)
    answer_map = parse_answer_map(lines)
    explanation_map = parse_explanation_map(lines)

    rows: list[dict[str, Any]] = []
    for pos, (line_idx, q_no) in enumerate(markers):
        if line_idx >= cutoff:
            continue
        next_idx = markers[pos + 1][0] if pos + 1 < len(markers) else cutoff
        if next_idx <= line_idx:
            continue
        block_lines = lines[line_idx:next_idx]
        block = [item["text"] for item in block_lines]
        question, options = parse_question_options(block, q_no)
        if len(question) < 10 and not options:
            continue
        page_start = block_lines[0]["page"]
        page_end = block_lines[-1]["page"]
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
        other_subjects = [name for name in ("Physics", "Chemistry", "Botany", "Zoology") if name != subject_name]
        other_subject_re = re.compile(r"\b(?:" + "|".join(other_subjects) + r")\b", re.I)
        leaked_section = bool(other_subject_re.search(explanation))
        content_hash = stable_hash(question, *options)

        visual_url = None
        if visual and render_visuals and len(options) == 4 and answer is not None:
            next_line = lines[next_idx] if next_idx < len(lines) else None
            visual_url = crop_visual(doc, block_lines, next_line, page_dims, visual_dir, content_hash, visual_url_prefix)

        confidence = 0.0
        confidence += 0.35 if len(question) >= 25 else 0.0
        confidence += 0.25 if len(options) == 4 and all(len(opt) >= 1 for opt in options) else 0.0
        confidence += 0.2 if answer is not None else 0.0
        confidence += 0.15 if len(explanation) >= min_explanation and relevant_explanation else 0.0
        confidence += 0.05 if not visual else 0.0

        has_real_explanation = (
            len(explanation) >= min_explanation
            and relevant_explanation
            and substantive_explanation
            and not leaked_section
        )
        # bankReady (real-explanation only): a genuine bound explanation is mandatory.
        bank_ready = (
            len(options) == 4
            and answer is not None
            and len(question) >= 25
            and not option_suspicion
            and has_real_explanation
            and question_form == "MCQ"
            and not (visual and not visual_url)
        )
        # Parked: real Q + options + answer, but no usable explanation yet.
        parked = (
            not bank_ready
            and len(options) == 4
            and answer is not None
            and len(question) >= 25
            and not option_suspicion
            and not has_real_explanation
        )

        meta = {
            "sourceFile": str(rel).replace("\\", "/"),
            "folder": folder,
            "questionNo": q_no,
            "pageStart": page_start,
            "pageEnd": page_end,
            "markerStyle": style,
            "hasAnswer": answer is not None,
            "hasExplanation": has_real_explanation,
            "needsVisualAsset": visual and not visual_url,
            "sectionLeak": leaked_section,
            "solutionAnswerAgrees": explanation_answer is None or explanation_answer == answer,
            "explanationRelevant": relevant_explanation,
            "explanationSubstantive": substantive_explanation,
            "suspiciousOptions": option_suspicion,
            "parseConfidence": round(confidence, 3),
            "bankReady": bank_ready,
            "parked": parked,
            "awaitingSolution": parked,
            "contentHash": content_hash,
        }
        rows.append({
            "subject": subject_name,
            "classLevel": class_level,
            "chapter": chapter,
            "topic": None,
            "source": source,
            "sourceRef": f"{source_ref} Q{q_no} p{page_start}"[:240],
            "difficulty": difficulty,
            "question": question,
            "options": options,
            "correctIndex": answer,
            "explanation": explanation,
            "verified": False,
            "questionForm": question_form,
            "isDiagramBased": visual,
            "isGraphBased": graph,
            "visualAssetKind": "pdf_page" if visual else None,
            "visualAssetUrl": visual_url,
            "visualMetaJson": {
                "sourceFile": str(rel).replace("\\", "/"),
                "pageStart": page_start,
                "pageEnd": page_end,
                "questionNo": q_no,
                "column": block_lines[0]["col"],
            },
            "stageMeta": meta,
        })

    doc.close()

    stats = {
        **pdf_stats,
        "file": str(rel).replace("\\", "/"),
        "folder": folder,
        "chapter": chapter,
        "classLevel": class_level,
        "markerStyle": style,
        "markers": len(markers),
        "stagedRows": len(rows),
        "bankReadyRows": sum(1 for r in rows if r["stageMeta"]["bankReady"]),
        "parkedRows": sum(1 for r in rows if r["stageMeta"]["parked"]),
        "withAnswer": sum(1 for r in rows if r["stageMeta"]["hasAnswer"]),
        "withExplanation": sum(1 for r in rows if r["stageMeta"]["hasExplanation"]),
        "needsVisualAsset": sum(1 for r in rows if r["stageMeta"]["needsVisualAsset"]),
        "visualCropped": sum(1 for r in rows if r["visualAssetUrl"]),
    }
    return rows, stats


def bank_import_row(row: dict[str, Any]) -> dict[str, Any]:
    visual_url = row.get("visualAssetUrl")
    visual = bool(visual_url) or row["isDiagramBased"] or row["isGraphBased"]
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
        "isDiagramBased": bool(visual_url) and row["isDiagramBased"],
        "isGraphBased": bool(visual_url) and row["isGraphBased"],
        "visualAssetKind": "pdf_page" if visual_url else None,
        "visualAssetUrl": visual_url,
        "visualAssetAlt": (f"Question figure from {row['visualMetaJson']['sourceFile']}, page {row['visualMetaJson']['pageStart']}" if visual_url else None),
        "visualMetaJson": row["visualMetaJson"],
        "sourceQuality": 0.92,
        "trendMetaJson": row["stageMeta"],
    }


def main() -> None:
    args = parse_args()
    subject_slug = args.subject.lower()
    source = Path(args.source or DEFAULT_SOURCES[args.subject])
    out = Path(args.out or f"data/{subject_slug}-pdf-stage")
    visual_dir = Path(args.visual_out or f"public/bank-visuals/{subject_slug}")
    visual_url_prefix = f"/bank-visuals/{subject_slug}"
    out.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        raise SystemExit(f"Source path does not exist: {source}")

    pdfs = sorted(source.rglob("*.pdf"))
    if args.folder:
        pdfs = [pdf for pdf in pdfs if pdf.relative_to(source).parts[:1] and pdf.relative_to(source).parts[0].lower() == args.folder.lower()]
    if args.limit_files:
        pdfs = pdfs[: args.limit_files]

    all_rows: list[dict[str, Any]] = []
    file_stats: list[dict[str, Any]] = []
    invalid_errors: list[dict[str, str]] = []
    for pdf in pdfs:
        rows, stats = stage_pdf(
            pdf, source, args.min_explanation, visual_dir, not args.no_visuals,
            args.subject, visual_url_prefix,
        )
        all_rows.extend(rows)
        file_stats.append(stats)
        if stats.get("error"):
            invalid_errors.append({"file": stats["file"], "error": stats["error"]})

    bank_ready = [bank_import_row(row) for row in all_rows if row["stageMeta"]["bankReady"]]
    parked_rows = [row for row in all_rows if row["stageMeta"]["parked"]]
    review_rows = [row for row in all_rows if not row["stageMeta"]["bankReady"] and not row["stageMeta"]["parked"]]

    by_folder: dict[str, Counter[str]] = defaultdict(Counter)
    by_chapter: dict[str, Counter[str]] = defaultdict(Counter)
    for row in all_rows:
        meta = row["stageMeta"]
        for bucket, key in ((by_folder, meta["folder"]), (by_chapter, row["chapter"])):
            bucket[key]["staged"] += 1
            if meta["bankReady"]:
                bucket[key]["bankReady"] += 1
            if meta["parked"]:
                bucket[key]["parked"] += 1
            if meta["hasAnswer"]:
                bucket[key]["withAnswer"] += 1
            if meta["hasExplanation"]:
                bucket[key]["withExplanation"] += 1

    report = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceRoot": str(source),
        "pdfsScanned": len(pdfs),
        "pages": sum(int(item.get("pages", 0)) for item in file_stats),
        "stagedRows": len(all_rows),
        "bankReadyRows": len(bank_ready),
        "parkedRows": len(parked_rows),
        "reviewRows": len(review_rows),
        "withAnswer": sum(1 for row in all_rows if row["stageMeta"]["hasAnswer"]),
        "withExplanation": sum(1 for row in all_rows if row["stageMeta"]["hasExplanation"]),
        "needsVisualAsset": sum(1 for row in all_rows if row["stageMeta"]["needsVisualAsset"]),
        "visualCropped": sum(1 for row in all_rows if row["visualAssetUrl"]),
        "errors": invalid_errors,
        "byFolder": {key: dict(value) for key, value in sorted(by_folder.items())},
        "byChapter": {key: dict(value) for key, value in sorted(by_chapter.items())},
        "fileStats": file_stats,
    }

    (out / f"{subject_slug}-pdf-questions.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in all_rows), encoding="utf-8")
    (out / f"{subject_slug}-pdf-bank-ready.json").write_text(
        json.dumps(bank_ready, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / f"{subject_slug}-pdf-parked.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in parked_rows), encoding="utf-8")
    (out / f"{subject_slug}-pdf-review.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in review_rows), encoding="utf-8")
    (out / f"{subject_slug}-pdf-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({key: report[key] for key in [
        "pdfsScanned", "pages", "stagedRows", "bankReadyRows", "parkedRows",
        "reviewRows", "withAnswer", "withExplanation", "needsVisualAsset", "visualCropped",
    ]}, indent=2))
    print(f"Report: {out / f'{subject_slug}-pdf-report.json'}")
    print(f"Bank-ready import rows: {out / f'{subject_slug}-pdf-bank-ready.json'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
