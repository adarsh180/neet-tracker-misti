import katex from "katex";

import { cleanQuestionText } from "@/lib/text-cleanup";
import type { PracticeQuestion, PracticeResult } from "@/lib/practice-engine";

type ReportReview = {
  questionId: string;
  questionNumber: number;
  outcome: string;
  mistakeTag: string | null;
  customMistakeText: string | null;
  reviewComplete: boolean;
};

type ReportTest = {
  id: string;
  title: string;
  mode: string;
  difficulty: string;
  durationMinutes: number;
  questionCount: number;
  completedAt: Date | null;
  totalActiveSeconds: number | null;
  resultJson: unknown;
  questionsJson: unknown;
  answersJson: unknown;
};

const TAG_LABEL: Record<string, string> = {
  GUESS_WORK: "Guess Work",
  ELIMINATION_WORK: "Elimination Work",
  NOT_STUDIED: "Not Studied",
  SILLY_MISTAKE: "Silly Mistake",
  CUSTOM: "Custom",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function richText(value: unknown) {
  const text = cleanQuestionText(value);
  const parts: string[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\$([^$]+)\$/g)) {
    const index = match.index ?? 0;
    parts.push(escapeHtml(text.slice(cursor, index)));
    try {
      parts.push(katex.renderToString(match[1], { throwOnError: false, output: "html" }));
    } catch {
      parts.push(escapeHtml(match[0]));
    }
    cursor = index + match[0].length;
  }
  parts.push(escapeHtml(text.slice(cursor)));
  return parts.join("").replace(/\n/g, "<br>");
}

function fmtDuration(seconds: number | null | undefined) {
  const value = Math.max(0, Number(seconds ?? 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return `${hours ? `${hours}h ` : ""}${minutes}m ${remainder}s`;
}

function outcomeColor(outcome: string) {
  return outcome === "CORRECT" ? "#15803d" : outcome === "WRONG" ? "#c2413b" : "#64748b";
}

function barChart(rows: Array<{ label: string; value: number; color: string }>) {
  const width = 620;
  const rowHeight = 34;
  const height = Math.max(80, rows.length * rowHeight + 25);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Performance chart">
    ${rows.map((row, index) => {
      const y = 12 + index * rowHeight;
      const barWidth = Math.max(0, Math.min(100, row.value)) * 4.2;
      return `<text x="0" y="${y + 13}" font-size="11" fill="#334155">${escapeHtml(row.label)}</text><rect x="170" y="${y}" width="420" height="18" rx="5" fill="#e2e8f0"/><rect x="170" y="${y}" width="${barWidth}" height="18" rx="5" fill="${row.color}"/><text x="600" y="${y + 13}" text-anchor="end" font-size="11" font-weight="700" fill="#0f172a">${row.value}%</text>`;
    }).join("")}
  </svg>`;
}

export function buildPracticeReportHtml(test: ReportTest, reviews: ReportReview[], origin: string) {
  const result = test.resultJson as PracticeResult;
  const questions = (test.questionsJson as PracticeQuestion[]) ?? [];
  const answers = new Map(((test.answersJson as Array<{ id: string; optionIndex: number | null }>) ?? []).map((answer) => [answer.id, answer.optionIndex]));
  const reviewMap = new Map(reviews.map((review) => [review.questionId, review]));
  const subjectRows = result.subjectScores.map((subject) => {
    const attempted = subject.correct + subject.wrong;
    return { label: subject.subject, value: attempted ? Math.round((subject.correct / attempted) * 100) : 0, color: subject.subject === "Physics" ? "#2563eb" : subject.subject === "Chemistry" ? "#7c3aed" : subject.subject === "Botany" ? "#15803d" : "#db2777" };
  });
  const mistakeCounts = new Map<string, number>();
  reviews.forEach((review) => {
    if (review.mistakeTag) mistakeCounts.set(review.mistakeTag, (mistakeCounts.get(review.mistakeTag) ?? 0) + 1);
  });
  const mistakeRows = [...mistakeCounts.entries()].map(([tag, count]) => ({ label: TAG_LABEL[tag] ?? tag, count }));
  const attempted = result.correct + result.wrong;
  const accuracy = attempted ? Math.round((result.correct / attempted) * 100) : 0;

  const questionHtml = questions.map((question, index) => {
    const selected = answers.get(question.id);
    const outcome = selected === null || selected === undefined ? "SKIPPED" : selected === question.correctIndex ? "CORRECT" : "WRONG";
    const review = reviewMap.get(question.id);
    const options = question.options.map((option, optionIndex) => {
      const isCorrect = optionIndex === question.correctIndex;
      const isSelected = optionIndex === selected;
      const rationale = question.optionExplanations?.[optionIndex];
      return `<div class="option ${isCorrect ? "correct" : ""} ${isSelected && !isCorrect ? "selected-wrong" : ""}"><b>${String.fromCharCode(65 + optionIndex)}</b><div><div>${richText(option)}</div>${rationale ? `<small>${richText(rationale)}</small>` : ""}</div><span>${isCorrect ? "Correct" : ""}${isSelected ? `${isCorrect ? " / " : ""}Misti's choice` : ""}</span></div>`;
    }).join("");
    const visual = question.visualAssetUrl ? `<img class="question-image" src="${escapeHtml(question.visualAssetUrl)}" alt="${escapeHtml(question.visualAssetAlt ?? "Question visual")}">` : "";
    return `<article class="question-card"><div class="question-meta"><strong>Q${index + 1}</strong><span>${escapeHtml(question.subject)}</span><span>${escapeHtml(question.chapter)}</span><span>${escapeHtml(question.difficulty)}</span><em style="color:${outcomeColor(outcome)}">${outcome}</em></div><div class="stem">${richText(question.question)}</div>${visual}<div class="options">${options}</div><div class="explanation"><strong>Complete explanation</strong>${richText(question.explanation)}</div><div class="reflection"><strong>Reflection:</strong> ${review?.mistakeTag ? escapeHtml(TAG_LABEL[review.mistakeTag] ?? review.mistakeTag) : outcome === "CORRECT" ? "Optional - not recorded" : "Pending reflection"}${review?.customMistakeText ? ` - ${escapeHtml(review.customMistakeText)}` : ""}</div></article>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(origin)}"><style>${REPORT_CSS}</style><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css"></head><body>
    <header class="cover"><div><p>NEET DOCTOR - PRACTICE ARENA</p><h1>${escapeHtml(test.title)}</h1><span>${escapeHtml(test.mode)} / ${escapeHtml(test.difficulty)} / ${test.questionCount} questions / ${test.durationMinutes} minutes</span></div><div class="score"><strong>${result.score}</strong><span>/ ${result.maxScore}</span></div></header>
    <section class="metrics"><div><b>${result.percentage}%</b><span>Score</span></div><div><b>${accuracy}%</b><span>Accuracy</span></div><div><b>${result.correct}</b><span>Correct</span></div><div><b>${result.wrong}</b><span>Wrong</span></div><div><b>${result.skipped}</b><span>Skipped</span></div><div><b>${fmtDuration(test.totalActiveSeconds ?? result.timeTakenSeconds)}</b><span>Active time</span></div></section>
    <section class="report-grid"><div class="panel"><h2>Accuracy by subject</h2>${barChart(subjectRows)}</div><div class="panel"><h2>Mistake reflections</h2>${mistakeRows.length ? `<table><tbody>${mistakeRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.count}</td></tr>`).join("")}</tbody></table>` : "<p>No mistake reflections recorded yet.</p>"}<p>${reviews.filter((review) => review.outcome !== "CORRECT" && !review.reviewComplete).length} wrong/skipped reflections remain pending.</p></div></section>
    <div class="section-title"><h2>Full question and answer review</h2><p>Correct answer, Misti's answer, complete solution, option reasoning, and saved reflection.</p></div>${questionHtml}
  </body></html>`;
}

const REPORT_CSS = `
  @page { size: A4; margin: 16mm 13mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #fff; font-size: 12px; line-height: 1.55; }
  .cover { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding: 24px; color: #fff; background: linear-gradient(130deg,#154c79,#1f6da8); border-radius: 14px; }
  .cover p { margin: 0 0 7px; letter-spacing: .12em; font-size: 10px; font-weight: 700; color: #cce9ff; }.cover h1 { margin: 0 0 6px; font-size: 24px; }.cover span { color: #dbeafe; }
  .score { white-space: nowrap; }.score strong { font-size: 42px; }.score span { font-size: 18px; color: #dbeafe; }
  .metrics { display: grid; grid-template-columns: repeat(6,1fr); gap: 8px; margin: 14px 0; }.metrics div { padding: 12px 8px; text-align: center; border: 1px solid #dbe4ee; border-radius: 9px; }.metrics b { display:block; font-size: 18px; color:#164e7a; }.metrics span { color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
  .report-grid { display:grid; grid-template-columns: 1.35fr .65fr; gap:12px; }.panel { border:1px solid #dbe4ee; border-radius:10px; padding:14px; }.panel h2,.section-title h2 { margin:0 0 10px; font-size:15px; color:#164e7a; }.panel table { width:100%; border-collapse:collapse; }.panel td { padding:7px 4px; border-bottom:1px solid #e2e8f0; }.panel td:last-child { text-align:right; font-weight:700; }
  .section-title { margin:22px 0 10px; padding-top:15px; border-top:2px solid #164e7a; page-break-before:always; }.section-title p { margin:0; color:#64748b; }
  .question-card { break-inside: avoid; margin:0 0 12px; padding:14px; border:1px solid #cbd5e1; border-radius:9px; }.question-meta { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; color:#64748b; font-size:10px; text-transform:uppercase; }.question-meta strong { color:#164e7a; font-size:12px; }.question-meta em { margin-left:auto; font-style:normal; font-weight:800; }.stem { font-size:13px; margin-bottom:9px; }.question-image { display:block; max-width:100%; max-height:280px; object-fit:contain; margin:10px auto; }
  .options { display:grid; gap:5px; }.option { display:grid; grid-template-columns:22px minmax(0,1fr) auto; gap:8px; padding:7px 8px; border:1px solid #e2e8f0; border-radius:7px; }.option>b { width:20px;height:20px;border-radius:50%;display:grid;place-items:center;border:1px solid #94a3b8;font-size:10px; }.option>span { font-size:9px;font-weight:700;color:#64748b; }.option.correct { border-color:#86c69a;background:#f0fdf4; }.option.correct>b { background:#15803d;color:#fff;border-color:#15803d; }.option.selected-wrong { border-color:#e6a29e;background:#fff7f6; }.option small { display:block;margin-top:4px;padding-top:4px;border-top:1px dashed #cbd5e1;color:#64748b; }
  .explanation { margin-top:9px; padding:9px; background:#eff6ff; border-left:3px solid #2563eb; }.explanation>strong { display:block;color:#164e7a;margin-bottom:3px; }.reflection { margin-top:7px; padding:7px 9px; background:#f8fafc; color:#475569; }.katex { font-size:1em; }
`;
