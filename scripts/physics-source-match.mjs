import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

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

function readRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  if (/\.jsonl$/i.test(filePath)) return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.questions)) return parsed.questions;
  throw new Error(`Unsupported staged row shape: ${filePath}`);
}

function normalizeContent(question, options) {
  return `${question} ${options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function contentHash(question, options) {
  return createHash("sha256").update(normalizeContent(question, options)).digest("hex");
}

function optionsOf(row) {
  if (Array.isArray(row.options)) return row.options.map(String);
  if (Array.isArray(row.optionsJson)) return row.optionsJson.map(String);
  return [row.optionA, row.optionB, row.optionC, row.optionD].map((value) => String(value ?? ""));
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isUsableStaged(row) {
  const options = optionsOf(row);
  const meta = row.stageMeta ?? row.trendMetaJson ?? {};
  return (
    row.subject === "Physics" &&
    options.length === 4 &&
    options.every((option) => cleanText(option).length > 0) &&
    Number.isInteger(Number(row.correctIndex)) &&
    Number(row.correctIndex) >= 0 &&
    Number(row.correctIndex) <= 3 &&
    cleanText(row.question).length >= 25 &&
    cleanText(row.explanation).length >= 35 &&
    meta.needsVisualAsset !== true &&
    meta.sectionLeak !== true &&
    meta.solutionAnswerAgrees !== false &&
    meta.suspiciousOptions !== true
  );
}

function appendReason(existing, addition) {
  const text = cleanText(existing);
  if (!text) return addition;
  if (text.includes(addition)) return text;
  return `${text}; ${addition}`.slice(0, 4000);
}

function rowExplanationOk(row, staged) {
  const dbExplanation = cleanText(row.explanation);
  const sourceExplanation = cleanText(staged.explanation);
  return dbExplanation.length >= 60 || sourceExplanation.length >= 80;
}

loadEnv();
const args = parseArgs(process.argv.slice(2));
const stagePath = path.resolve(args.stage || "data/physics-pdf-stage/physics-pdf-bank-ready.json");
const apply = Boolean(args.apply);
const limit = Number(args.limit ?? 0);
const prisma = new PrismaClient();

try {
  const stagedRowsRaw = readRows(stagePath);
  const stagedRows = stagedRowsRaw.filter(isUsableStaged);
  const byHash = new Map();
  for (const row of stagedRows) {
    const hash = contentHash(cleanText(row.question), optionsOf(row).map(cleanText));
    const bucket = byHash.get(hash) ?? [];
    bucket.push(row);
    byHash.set(hash, bucket);
  }

  const dbRows = await prisma.bankQuestion.findMany({
    where: { subject: "Physics" },
    select: {
      id: true,
      chapter: true,
      source: true,
      sourceRef: true,
      qualityStatus: true,
      verified: true,
      question: true,
      optionsJson: true,
      correctIndex: true,
      explanation: true,
      isDiagramBased: true,
      isGraphBased: true,
      rejectReason: true,
    },
  });

  const report = {
    stagePath,
    apply,
    stagedRows: stagedRowsRaw.length,
    usableStagedRows: stagedRows.length,
    dbPhysicsRows: dbRows.length,
    exactMatches: 0,
    answerAgrees: 0,
    answerDisagrees: 0,
    stagedConflicts: 0,
    strictEligible: 0,
    promoted: 0,
    markedReview: 0,
    skippedVisual: 0,
    skippedThinExplanation: 0,
    examples: [],
  };

  const promotions = [];
  const reviewUpdates = [];

  for (const row of dbRows) {
    const hash = contentHash(cleanText(row.question), optionsOf(row).map(cleanText));
    const matches = byHash.get(hash) ?? [];
    if (!matches.length) continue;
    report.exactMatches += 1;
    const answers = new Set(matches.map((match) => Number(match.correctIndex)));
    if (answers.size !== 1) {
      report.stagedConflicts += 1;
      reviewUpdates.push({
        id: row.id,
        rejectReason: row.rejectReason,
        reason: "source PDF exact match has conflicting parsed answer keys",
      });
      continue;
    }
    const sourceAnswer = [...answers][0];
    const staged = matches.find((match) => Number(match.correctIndex) === sourceAnswer) ?? matches[0];
    if (sourceAnswer !== row.correctIndex) {
      report.answerDisagrees += 1;
      reviewUpdates.push({
        id: row.id,
        rejectReason: row.rejectReason,
        reason: `source PDF exact match disagrees with stored key ${row.correctIndex}->${sourceAnswer}`,
      });
      continue;
    }
    report.answerAgrees += 1;
    if (row.isDiagramBased || row.isGraphBased) {
      report.skippedVisual += 1;
      continue;
    }
    if (!rowExplanationOk(row, staged)) {
      report.skippedThinExplanation += 1;
      continue;
    }
    if (row.qualityStatus === "REJECTED" || row.qualityStatus === "NEEDS_VISUAL_ASSET") continue;
    report.strictEligible += 1;
    promotions.push({ row, staged });
    if (report.examples.length < 10) {
      report.examples.push({
        id: row.id,
        chapter: row.chapter,
        sourceRef: row.sourceRef,
        pdfRef: staged.sourceRef,
        question: cleanText(row.question).slice(0, 180),
      });
    }
    if (limit && promotions.length >= limit) break;
  }

  if (apply) {
    for (const { row, staged } of promotions) {
      const sourceExplanation = cleanText(staged.explanation);
      const data = {
        verified: true,
        qualityStatus: "VERIFIED_STRICT",
        qualityScore: 0.94,
        verifiedAt: new Date(),
        verifierModel: "physics-source-match-v1",
        rejectReason: null,
      };
      if (cleanText(row.explanation).length < 60 && sourceExplanation.length >= 80) {
        data.explanation = sourceExplanation;
      }
      await prisma.bankQuestion.update({ where: { id: row.id }, data });
      report.promoted += 1;
    }
    for (const update of reviewUpdates) {
      await prisma.bankQuestion.update({
        where: { id: update.id },
        data: {
          verified: false,
          qualityStatus: "NEEDS_REVIEW",
          rejectReason: appendReason(update.rejectReason, update.reason),
        },
      });
      report.markedReview += 1;
    }
  }

  fs.mkdirSync(path.join(process.cwd(), "data", "physics-pdf-stage"), { recursive: true });
  const reportPath = path.join(process.cwd(), "data", "physics-pdf-stage", `physics-source-match-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
} finally {
  await prisma.$disconnect();
}
