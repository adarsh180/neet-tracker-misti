import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUTS = [
  "data/physics-pdf-stage/physics-pdf-bank-ready.json",
  "data/botany-pdf-stage/botany-pdf-bank-ready.json",
  "data/zoology-pdf-stage/zoology-pdf-bank-ready.json",
];
const EXCLUSIONS = "data/pdf-admission-audit/academic-exclusions.json";
const UNREADABLE_RE = /[\ufffd\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const LABEL_RE = /(?:^|\s)(?:\(([A-Da-d])\)|([A-Da-d])[.)])\s+/g;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function optionsOf(row) {
  return Array.isArray(row.options)
    ? row.options.map(clean)
    : [row.optionA, row.optionB, row.optionC, row.optionD].map(clean);
}

function comparisonText(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isOptionEcho(rationale, option) {
  const rationaleText = comparisonText(rationale);
  const optionText = comparisonText(option);
  if (!rationaleText || !optionText) return true;
  if (rationaleText === optionText) return true;
  // A copied option followed only by a very short fragment is not a rationale.
  return rationaleText.startsWith(optionText) && rationaleText.length <= optionText.length + 18;
}

function splitSourceRationales(explanation, options) {
  const text = clean(explanation);
  const markers = [];
  for (const match of text.matchAll(LABEL_RE)) {
    const label = (match[1] || match[2] || "").toUpperCase();
    markers.push({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, label });
  }

  for (let start = 0; start <= markers.length - 4; start += 1) {
    const run = markers.slice(start, start + 4);
    if (run.map((marker) => marker.label).join("") !== "ABCD") continue;
    const rationales = run.map((marker, offset) => {
      const end = offset < 3 ? run[offset + 1].index : text.length;
      return clean(text.slice(marker.end, end)).replace(/^[.;:,]\s*/, "");
    });
    if (!rationales.every((rationale) => rationale.length >= 12 && !UNREADABLE_RE.test(rationale))) continue;
    const echoCount = rationales.filter((rationale, index) => isOptionEcho(rationale, options[index])).length;
    if (echoCount <= 1) return rationales;
  }
  return null;
}

async function main() {
  const exclusions = await fs.readFile(path.join(ROOT, EXCLUSIONS), "utf8").then(JSON.parse).catch(() => []);
  const excludedHashes = new Set(exclusions.map((row) => clean(row.contentHash)).filter(Boolean));
  const seen = new Set();
  const candidates = [];
  const report = { sourceRows: 0, duplicateRows: 0, academicExclusions: 0, invalidStructure: 0, unreadable: 0, compoundStatementRowsSkipped: 0, optionEchoRowsRejected: 0, sourceRationalesRecovered: 0, bySubject: {}, byChapter: {} };

  for (const relative of INPUTS) {
    const rows = JSON.parse(await fs.readFile(path.join(ROOT, relative), "utf8"));
    for (const row of rows) {
      report.sourceRows += 1;
      const options = optionsOf(row);
      const identity = clean(row.trendMetaJson?.contentHash || row.stageMeta?.contentHash || `${row.question}|${options.join("|")}`);
      if (excludedHashes.has(identity)) {
        report.academicExclusions += 1;
        continue;
      }
      if (seen.has(identity)) {
        report.duplicateRows += 1;
        continue;
      }
      seen.add(identity);

      const fields = [clean(row.question), clean(row.explanation), ...options];
      if (options.length !== 4 || options.some((option) => !option) || !Number.isInteger(Number(row.correctIndex))) {
        report.invalidStructure += 1;
        continue;
      }
      if (fields.some((field) => UNREADABLE_RE.test(field))) {
        report.unreadable += 1;
        continue;
      }
      if ([...clean(row.question).matchAll(LABEL_RE)].length >= 2) {
        report.compoundStatementRowsSkipped += 1;
        continue;
      }
      const optionExplanations = splitSourceRationales(row.explanation, options);
      if (!optionExplanations) {
        if ([...clean(row.explanation).matchAll(LABEL_RE)].length >= 4) report.optionEchoRowsRejected += 1;
        continue;
      }

      const enriched = {
        ...row,
        options,
        optionA: undefined,
        optionB: undefined,
        optionC: undefined,
        optionD: undefined,
        optionExplanations,
        verified: false,
        provenanceJson: {
          sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
          sourceFile: row.trendMetaJson?.sourceFile ?? row.visualMetaJson?.sourceFile ?? null,
          pageStart: row.trendMetaJson?.pageStart ?? row.visualMetaJson?.pageStart ?? null,
          pageEnd: row.trendMetaJson?.pageEnd ?? row.visualMetaJson?.pageEnd ?? null,
          questionNumber: row.trendMetaJson?.questionNo ?? row.visualMetaJson?.questionNo ?? null,
          solutionOrigin: "SOURCE_TRANSCRIBED",
        },
      };
      candidates.push(enriched);
      report.sourceRationalesRecovered += 1;
      const subject = clean(row.subject);
      const chapter = clean(row.chapter);
      report.bySubject[subject] = (report.bySubject[subject] ?? 0) + 1;
      const chapterKey = `${subject} :: ${chapter}`;
      report.byChapter[chapterKey] = (report.byChapter[chapterKey] ?? 0) + 1;
    }
  }

  const outDir = path.join(ROOT, "data/pdf-admission-audit");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "source-rationale-candidates.json"), `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "source-rationale-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

await main();
