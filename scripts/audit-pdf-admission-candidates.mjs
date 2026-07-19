import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROOT = process.cwd();
const SOURCES = [
  "data/physics-pdf-stage/physics-pdf-bank-ready.json",
  "data/botany-pdf-stage/botany-pdf-bank-ready.json",
  "data/zoology-pdf-stage/zoology-pdf-bank-ready.json",
];
const EXCLUSIONS = "data/pdf-admission-audit/academic-exclusions.json";
const THIN_CHAPTERS = new Set([
  "1D",
  "Kinematics",
  "Dual Nature of Matter and Radiation",
  "Experimental Skills",
  "Work, Energy and Power",
  "Rotational Motion",
  "Properties of Solids and Liquids",
  "Thermodynamics",
  "Animal Kingdom",
]);
const UNREADABLE_RE = /[\ufffd\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function optionsOf(row) {
  return Array.isArray(row.options)
    ? row.options.map(clean)
    : [row.optionA, row.optionB, row.optionC, row.optionD].map(clean);
}

function normalizedContent(question, options) {
  return `${question} ${options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function hashOf(row) {
  const options = optionsOf(row);
  return createHash("sha256").update(normalizedContent(clean(row.question), options)).digest("hex");
}

function reasonsFor(row) {
  const reasons = [];
  const question = clean(row.question);
  const options = optionsOf(row);
  const explanation = clean(row.explanation);
  const rationales = Array.isArray(row.optionExplanations) ? row.optionExplanations.map(clean) : [];
  const visual = Boolean(row.isDiagramBased || row.isGraphBased || row.visualAssetKind);

  if (question.length < 25) reasons.push("short_question");
  if (options.length !== 4 || options.some((option) => !option)) reasons.push("invalid_options");
  if (new Set(options.map((option) => option.toLowerCase())).size !== 4) reasons.push("duplicate_options");
  if (!Number.isInteger(Number(row.correctIndex)) || Number(row.correctIndex) < 0 || Number(row.correctIndex) > 3) reasons.push("invalid_answer_key");
  if (explanation.length < 40) reasons.push("short_or_missing_solution");
  if ([question, explanation, ...options, ...rationales].some((value) => UNREADABLE_RE.test(value))) reasons.push("unreadable_encoding");
  if (visual && !row.visualAssetUrl) reasons.push("missing_visual_asset");
  if (rationales.length !== 4 || rationales.some((rationale) => rationale.length < 12)) reasons.push("missing_option_rationales");
  if (!row.sourceRef || !row.trendMetaJson?.sourceFile || !row.trendMetaJson?.pageStart) reasons.push("incomplete_pdf_provenance");
  return reasons;
}

async function main() {
  const exclusions = await fs.readFile(path.join(ROOT, EXCLUSIONS), "utf8").then(JSON.parse).catch(() => []);
  const exclusionByHash = new Map(exclusions.map((row) => [clean(row.contentHash), row]));
  const rationalePath = path.join(ROOT, "data/pdf-admission-audit/source-rationale-candidates.json");
  const rationaleRows = await fs.readFile(rationalePath, "utf8").then(JSON.parse).catch(() => []);
  const rationalesByHash = new Map(rationaleRows.map((row) => [hashOf(row), row.optionExplanations]));
  const rows = [];
  for (const relative of SOURCES) {
    const parsed = JSON.parse(await fs.readFile(path.join(ROOT, relative), "utf8"));
    for (const row of parsed) rows.push({
      ...row,
      optionExplanations: rationalesByHash.get(hashOf(row)) ?? row.optionExplanations,
      candidateFile: relative,
    });
  }

  const unique = new Map();
  let duplicateWithinPdfCandidates = 0;
  for (const row of rows) {
    const hash = hashOf(row);
    if (unique.has(hash)) duplicateWithinPdfCandidates += 1;
    else unique.set(hash, { ...row, contentHash: hash });
  }

  const candidates = [...unique.values()];
  const existingHashes = new Set();
  for (let index = 0; index < candidates.length; index += 500) {
    const found = await prisma.bankQuestion.findMany({
      where: { contentHash: { in: candidates.slice(index, index + 500).map((row) => row.contentHash) } },
      select: { contentHash: true },
    });
    for (const row of found) existingHashes.add(row.contentHash);
  }

  const reasonCounts = {};
  const bySubject = {};
  const byChapter = {};
  let strictNew = 0;
  let structurallyNew = 0;
  let exactDatabaseDuplicates = 0;
  for (const row of candidates) {
    const reasons = reasonsFor(row);
    const sourceHash = clean(row.trendMetaJson?.contentHash || row.stageMeta?.contentHash);
    if (exclusionByHash.has(row.contentHash) || exclusionByHash.has(sourceHash)) reasons.push("academic_exclusion");
    const duplicate = existingHashes.has(row.contentHash);
    if (duplicate) exactDatabaseDuplicates += 1;
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    if (!duplicate && !reasons.some((reason) => reason !== "missing_option_rationales")) structurallyNew += 1;
    if (!duplicate && reasons.length === 0) strictNew += 1;

    const subject = clean(row.subject) || "Unknown";
    const chapter = clean(row.chapter) || "Unknown";
    bySubject[subject] ??= { candidates: 0, exactDuplicates: 0, strictNew: 0 };
    bySubject[subject].candidates += 1;
    if (duplicate) bySubject[subject].exactDuplicates += 1;
    if (!duplicate && reasons.length === 0) bySubject[subject].strictNew += 1;

    const key = `${subject} :: ${chapter}`;
    byChapter[key] ??= { candidates: 0, exactDuplicates: 0, strictNew: 0, thinPriority: THIN_CHAPTERS.has(chapter) };
    byChapter[key].candidates += 1;
    if (duplicate) byChapter[key].exactDuplicates += 1;
    if (!duplicate && reasons.length === 0) byChapter[key].strictNew += 1;
  }

  const liveVerified = await prisma.bankQuestion.count({ where: { verified: true, qualityStatus: "VERIFIED_STRICT" } });
  const report = {
    generatedAt: new Date().toISOString(),
    liveVerified,
    goal: 100000,
    remainingBeforePdfAdmission: Math.max(0, 100000 - liveVerified),
    sourceCandidateRows: rows.length,
    sourceRationaleRows: rationaleRows.length,
    uniquePdfCandidates: candidates.length,
    duplicateWithinPdfCandidates,
    exactDatabaseDuplicates,
    academicExclusions: exclusions.length,
    structurallyNewButMissingRationales: structurallyNew,
    strictNew,
    reasonCounts,
    bySubject,
    byChapter,
  };

  const outDir = path.join(ROOT, "data/pdf-admission-audit");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
