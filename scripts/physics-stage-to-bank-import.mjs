import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function optionsOf(row) {
  return Array.isArray(row.options) ? row.options.map(clean) : [];
}

function completeEnough(row) {
  const options = optionsOf(row);
  const meta = row.stageMeta ?? {};
  return (
    row.subject === "Physics" &&
    clean(row.question).length >= 25 &&
    options.length === 4 &&
    options.every((option) => option.length > 0) &&
    Number.isInteger(Number(row.correctIndex)) &&
    Number(row.correctIndex) >= 0 &&
    Number(row.correctIndex) <= 3 &&
    clean(row.explanation).length >= 35 &&
    meta.sectionLeak !== true &&
    meta.solutionAnswerAgrees !== false &&
    meta.suspiciousOptions !== true
  );
}

function toBankRow(row) {
  const options = optionsOf(row);
  const meta = row.stageMeta ?? {};
  const visual = meta.needsVisualAsset === true || row.isDiagramBased === true || row.isGraphBased === true;
  return {
    subject: "Physics",
    classLevel: row.classLevel,
    chapter: row.chapter,
    topic: row.topic ?? null,
    source: row.source,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty ?? "MODERATE",
    question: clean(row.question),
    optionA: options[0],
    optionB: options[1],
    optionC: options[2],
    optionD: options[3],
    correctIndex: Number(row.correctIndex),
    explanation: clean(row.explanation),
    verified: false,
    questionForm: row.questionForm ?? "MCQ",
    isDiagramBased: visual || row.isDiagramBased === true,
    isGraphBased: row.isGraphBased === true,
    visualAssetKind: visual ? "pdf_page" : null,
    visualAssetAlt: visual ? `Question visual from ${meta.sourceFile ?? row.sourceRef}, page ${meta.pageStart ?? "?"}` : null,
    visualMetaJson: row.visualMetaJson ?? meta,
    sourceQuality: visual ? 0.82 : 0.88,
    trendMetaJson: {
      ...meta,
      pdfStageCompleteImport: true,
      route: visual ? "NEEDS_VISUAL_ASSET" : "NEEDS_REVIEW",
    },
  };
}

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(args.source || "data/physics-pdf-stage/physics-pdf-questions.jsonl");
const outDir = path.resolve(args.out || "data/physics-pdf-stage");
fs.mkdirSync(outDir, { recursive: true });

const lines = fs.existsSync(source) ? fs.readFileSync(source, "utf8").split(/\r?\n/).filter(Boolean) : [];
const rows = lines.map((line) => JSON.parse(line));

const review = [];
const visual = [];
const skipped = {
  total: rows.length,
  incomplete: 0,
  answerOnly: 0,
  weakQuestionOrOptions: 0,
  suspiciousOrLeak: 0,
};

for (const row of rows) {
  const options = optionsOf(row);
  const meta = row.stageMeta ?? {};
  if (!completeEnough(row)) {
    skipped.incomplete += 1;
    if (Number.isInteger(Number(row.correctIndex)) && clean(row.explanation).length < 35) skipped.answerOnly += 1;
    if (clean(row.question).length < 25 || options.length !== 4 || options.some((option) => !option)) skipped.weakQuestionOrOptions += 1;
    if (meta.sectionLeak === true || meta.solutionAnswerAgrees === false || meta.suspiciousOptions === true) skipped.suspiciousOrLeak += 1;
    continue;
  }
  const bankRow = toBankRow(row);
  if (bankRow.isDiagramBased || bankRow.isGraphBased || bankRow.visualAssetKind) visual.push(bankRow);
  else review.push(bankRow);
}

const reviewPath = path.join(outDir, "physics-pdf-complete-review.json");
const visualPath = path.join(outDir, "physics-pdf-complete-visual.json");
const summaryPath = path.join(outDir, "physics-stage-to-bank-import-summary.json");

fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
fs.writeFileSync(visualPath, `${JSON.stringify(visual, null, 2)}\n`);
fs.writeFileSync(
  summaryPath,
  `${JSON.stringify(
    {
      source,
      reviewRows: review.length,
      visualRows: visual.length,
      skipped,
      reviewPath,
      visualPath,
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ reviewRows: review.length, visualRows: visual.length, skipped, reviewPath, visualPath, summaryPath }, null, 2));
