import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    target: "ES2020",
  },
});

const { PrismaClient } = require("@prisma/client");
const { extractJsonArray } = require("../src/lib/ai-json.ts");
const { AI_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");

const prisma = new PrismaClient();

const REPORT_DIR = path.join(process.cwd(), "data", "bank-import", "reports");
const EXCLUDED_STATUSES = new Set(["REJECTED", "NEEDS_VISUAL_ASSET"]);
const SUBJECTS = ["Physics", "Chemistry", "Botany", "Zoology"];
const SOURCE_REF_LEAK_RE = /(original question aligned|not a verbatim|copyright|prompt|instruction|verbatim copyrighted)/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const ARTIFACT_RE = /\b(?:table\/matching item|lengthy case|case\s+\d+\s*-\s*\d+|item\s+\d+\s*-\s*\d+|passage\s+\d+\s*-\s*\d+)\b/i;
const BIO_ARITHMETIC_RE = /^[^?]{0,160}\b\d+\b[^?]*(?:how many|find|calculate|remaining|left)[^?]*\?*$/i;
const OPTION_LETTER_RE_LIST = [
  /\b(?:correct\s+(?:answer|option)\s*(?:is|:)?|answer\s*(?:is|:)?|option\s*)\s*\(?([A-D])\)?\b/gi,
  /\b\(?([A-D])\)?\s*(?:is|seems|appears)\s+(?:the\s+)?correct\b/gi,
  /\b(?:hence|therefore|thus)\s*,?\s*(?:the\s+)?(?:correct\s+)?(?:answer\s+)?(?:is\s+)?(?:option\s*)?\(?([A-D])\)?\b/gi,
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? Number(inner) : inner)));
}

function appendReason(existing, addition) {
  const text = String(existing ?? "").trim();
  if (!text) return addition;
  if (text.includes(addition)) return text;
  return `${text}; ${addition}`.slice(0, 4000);
}

function sanitizeSource(row) {
  const sourceRef = String(row.sourceRef ?? "").trim();
  const updates = {};
  const reasons = [];

  if (SOURCE_REF_LEAK_RE.test(sourceRef)) {
    if (row.source === "NCERT") updates.sourceRef = "NCERT-aligned original";
    else if (row.source === "AI") updates.sourceRef = "Original";
    else updates.sourceRef = `${row.source.replace("_", " ")}-style practice`;
    reasons.push("stripped leaked prompt/copyright wording from sourceRef");
  }

  if (row.source === "NEET_PYQ" && !YEAR_RE.test(sourceRef)) {
    updates.source = "PLATFORM";
    updates.sourceRef = "NEET-style practice (year unverified)";
    updates.verified = false;
    updates.qualityStatus = row.qualityStatus === "VERIFIED_STRICT" ? "NEEDS_REVIEW" : row.qualityStatus;
    reasons.push("relabelled NEET_PYQ without year as unverified practice source");
  }

  if (row.source === "JEE_PYQ" && !YEAR_RE.test(sourceRef)) {
    updates.source = "PLATFORM";
    updates.sourceRef = "JEE Main-style practice (shift/year unverified)";
    updates.verified = false;
    updates.qualityStatus = row.qualityStatus === "VERIFIED_STRICT" ? "NEEDS_REVIEW" : row.qualityStatus;
    reasons.push("relabelled JEE_PYQ without shift/year as unverified practice source");
  }

  if (Object.keys(updates).length) {
    updates.rejectReason = reasons.reduce((reason, entry) => appendReason(reason, entry), row.rejectReason);
  }

  return { updates, reasons };
}

function inferAnswerIndexFromExplanation(explanation) {
  const found = new Set();
  for (const pattern of OPTION_LETTER_RE_LIST) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(explanation)) !== null) {
      if (match[1]) found.add(match[1].toUpperCase().charCodeAt(0) - 65);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

function normalizeStem(question) {
  return String(question ?? "")
    .toLowerCase()
    .replace(/\b(?:table\/matching item|lengthy case|case|item|passage)\s*\d+\s*-\s*\d+\b/g, " ")
    .replace(/(?:^|\s)(?:q|question)\s*\d+[\).:-]?\s*/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function baseQualityReason(row) {
  const reasons = [];
  const explanationLength = String(row.explanation ?? "").trim().length;
  if (explanationLength < 30) reasons.push("thin explanation; needs AI repair");
  if (ARTIFACT_RE.test(row.question)) reasons.push("generator artifact in question stem");
  if (row.subject === "Botany" || row.subject === "Zoology") {
    if (BIO_ARITHMETIC_RE.test(row.question) && !/\b(?:chromosome|gene|dna|rna|codon|population|species|enzyme|cell|organism|allele)\b/i.test(row.question)) {
      reasons.push("biology row is trivial arithmetic, not NEET biology");
    }
  }
  const inferred = inferAnswerIndexFromExplanation(String(row.explanation ?? ""));
  if (inferred !== null && inferred !== row.correctIndex) {
    reasons.push(`stored key contradicts explicit explanation option; key should be ${String.fromCharCode(65 + inferred)}`);
  }
  return { reasons, inferred };
}

function classifyDeterministic(row) {
  const { reasons, inferred } = baseQualityReason(row);
  const updates = {};
  const quarantineReasons = reasons.filter((reason) => reason.includes("generator artifact") || reason.includes("trivial arithmetic"));

  if (inferred !== null && inferred !== row.correctIndex) {
    updates.correctIndex = inferred;
    updates.verified = false;
    updates.qualityStatus = row.qualityStatus === "VERIFIED_STRICT" ? "NEEDS_REVIEW" : row.qualityStatus;
  }

  if (reasons.some((reason) => reason.includes("thin explanation") || reason.includes("contradicts"))) {
    updates.verified = false;
    if (!EXCLUDED_STATUSES.has(row.qualityStatus)) updates.qualityStatus = "NEEDS_REVIEW";
  }

  if (quarantineReasons.length) {
    updates.verified = false;
    updates.qualityStatus = "REJECTED";
    updates.rejectedAt = new Date();
  }

  if (Object.keys(updates).length) {
    updates.rejectReason = reasons.reduce((reason, entry) => appendReason(reason, entry), row.rejectReason);
  }

  return { updates, reasons, wantsQuarantine: quarantineReasons.length > 0 };
}

function preferKeep(a, b) {
  const score = (row) => {
    let value = 0;
    if (row.qualityStatus === "VERIFIED_STRICT") value += 100;
    if (row.verified) value += 25;
    if (!SOURCE_REF_LEAK_RE.test(row.sourceRef)) value += 10;
    if (YEAR_RE.test(row.sourceRef)) value += 4;
    value += Math.min(20, String(row.explanation ?? "").trim().length / 20);
    value -= row.timesWrong * 2;
    value += row.timesCorrect;
    return value;
  };
  return score(b) - score(a);
}

async function getUsableCounts() {
  const rows = await prisma.bankQuestion.groupBy({
    by: ["subject", "chapter"],
    where: { qualityStatus: { notIn: [...EXCLUDED_STATUSES] } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));
}

function canQuarantine(row, chapterState, args) {
  const key = `${row.subject}::${row.chapter}`;
  const state = chapterState.get(key) ?? { total: 0, rejected: 0 };
  const maxReject = Math.floor(state.total * args.maxRejectShare);
  const remaining = state.total - state.rejected - 1;
  if (remaining < args.minUsablePerChapter) return false;
  if (state.rejected >= maxReject) return false;
  state.rejected += 1;
  chapterState.set(key, state);
  return true;
}

async function repairWithAI(rows, dryRun, delayMs) {
  if (!rows.length) return { attempted: 0, repaired: 0, rejected: 0, unresolved: 0, models: [] };
  const models = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.emergencyFallback];
  const payload = rows.map((row, index) => ({
    id: `q${index + 1}`,
    subject: row.subject,
    chapter: row.chapter,
    question: row.question,
    options: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [],
    storedAnswerIndex: row.correctIndex,
    storedExplanation: row.explanation,
    issue: row.rejectReason,
  }));
  const result = await chatWithAI(
    [
      {
        role: "system",
        content:
          "You are a senior NEET examiner repairing a single-correct MCQ bank. Respond only with valid JSON. Never include markdown fences.",
      },
      {
        role: "user",
        content: `For each MCQ, independently solve it and repair only the answer key/explanation. Do not change the question or options.
Return a JSON array:
[{ "id": "q1", "valid": true|false, "answerIndex": 0-3, "explanation": "45-120 words, exam-quality", "confidence": 0-1, "reason": "short" }].

Set valid=false if the question is filler, ambiguous, outside NEET syllabus, has no correct option, has multiple correct options, or needs a missing image/table/graph.

Questions:
${JSON.stringify(payload)}`,
      },
    ],
    6000,
    0.05,
    150000,
    models,
  );
  await sleep(delayMs);
  const repairedRows = extractJsonArray(result.content) ?? [];
  const byId = new Map(repairedRows.map((entry) => [String(entry.id), entry]));
  let repaired = 0;
  let rejected = 0;
  let unresolved = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const entry = byId.get(`q${index + 1}`);
    const answerIndex = Number(entry?.answerIndex);
    const confidence = Number(entry?.confidence ?? 0);
    const explanation = String(entry?.explanation ?? "").trim();
    if (!entry || entry.valid !== true || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3 || confidence < 0.72) {
      rejected += 1;
      if (!dryRun) {
        await prisma.bankQuestion.update({
          where: { id: row.id },
          data: {
            verified: false,
            qualityStatus: "REJECTED",
            rejectedAt: new Date(),
            verifierModel: result.model,
            verifierRuns: { repair: entry ?? null },
            rejectReason: appendReason(row.rejectReason, `AI repair rejected/unresolved: ${entry?.reason ?? "no reliable repair"}`),
          },
        });
      }
      continue;
    }
    if (explanation.length < 30) {
      unresolved += 1;
      if (!dryRun) {
        await prisma.bankQuestion.update({
          where: { id: row.id },
          data: {
            verified: false,
            qualityStatus: "NEEDS_REVIEW",
            verifierModel: result.model,
            verifierRuns: { repair: entry },
            rejectReason: appendReason(row.rejectReason, "AI repair returned explanation too thin"),
          },
        });
      }
      continue;
    }
    repaired += 1;
    if (!dryRun) {
      await prisma.bankQuestion.update({
        where: { id: row.id },
        data: {
          correctIndex: answerIndex,
          explanation,
          verified: false,
          qualityStatus: "UNVERIFIED",
          qualityScore: Math.max(0.6, Math.min(0.8, confidence)),
          verifierModel: result.model,
          verifierRuns: { repair: entry },
          rejectReason: appendReason(row.rejectReason, "AI-repaired key/explanation; pending blind verification"),
        },
      });
    }
  }
  return { attempted: rows.length, repaired, rejected, unresolved, models: [result.model] };
}

async function main() {
  const rawArgs = parseArgs(process.argv.slice(2));
  const dryRun = !rawArgs.apply;
  const args = {
    batchSize: Math.max(100, Math.min(5000, Number(rawArgs.batch ?? 1000))),
    maxRejectShare: Math.max(0.05, Math.min(0.3, Number(rawArgs["max-reject-share"] ?? 0.3))),
    minUsablePerChapter: Math.max(1, Number(rawArgs["min-usable-per-chapter"] ?? 120)),
    aiRepairLimit: Math.max(0, Number(rawArgs["ai-repair-limit"] ?? 0)),
    aiBatchSize: Math.max(1, Math.min(8, Number(rawArgs["ai-batch"] ?? 5))),
    delayMs: Math.max(0, Number(rawArgs.delay ?? 5000)),
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  const before = await prisma.bankQuestion.groupBy({ by: ["qualityStatus"], _count: { _all: true } });
  const usableCounts = await getUsableCounts();
  const chapterState = new Map([...usableCounts.entries()].map(([key, total]) => [key, { total, rejected: 0 }]));
  const report = {
    dryRun,
    args,
    before: jsonSafe(before),
    metadataFixed: 0,
    keyCorrectedFromExplanation: 0,
    markedNeedsReview: 0,
    quarantinedGarbage: 0,
    duplicateCandidates: 0,
    duplicateQuarantined: 0,
    skippedByChapterSafeguard: 0,
    aiRepair: { attempted: 0, repaired: 0, rejected: 0, unresolved: 0, models: [] },
  };

  let cursor = null;
  while (true) {
    const rows = await prisma.bankQuestion.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: args.batchSize,
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      const metadata = sanitizeSource(row);
      const deterministic = classifyDeterministic(row);
      const updates = { ...metadata.updates, ...deterministic.updates };
      const reasons = [...metadata.reasons, ...deterministic.reasons];

      if (deterministic.wantsQuarantine && !canQuarantine(row, chapterState, args)) {
        if (updates.qualityStatus === "REJECTED") {
          updates.qualityStatus = "NEEDS_REVIEW";
          updates.rejectedAt = null;
          report.skippedByChapterSafeguard += 1;
        }
      }

      if (!Object.keys(updates).length) continue;
      if (metadata.reasons.length) report.metadataFixed += 1;
      if (Object.prototype.hasOwnProperty.call(updates, "correctIndex")) report.keyCorrectedFromExplanation += 1;
      if (updates.qualityStatus === "NEEDS_REVIEW") report.markedNeedsReview += 1;
      if (updates.qualityStatus === "REJECTED") report.quarantinedGarbage += 1;

      if (!dryRun) {
        await prisma.bankQuestion.update({ where: { id: row.id }, data: updates });
      }
    }
  }

  const duplicateGroups = new Map();
  cursor = null;
  while (true) {
    const rows = await prisma.bankQuestion.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        qualityStatus: { notIn: [...EXCLUDED_STATUSES] },
      },
      orderBy: { id: "asc" },
      take: args.batchSize,
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      const key = `${row.subject}::${row.chapter}::${normalizeStem(row.question)}`;
      if (key.length < 45) continue;
      const group = duplicateGroups.get(key) ?? [];
      group.push(row);
      duplicateGroups.set(key, group);
    }
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(preferKeep);
    const duplicates = sorted.slice(1);
    report.duplicateCandidates += duplicates.length;
    for (const row of duplicates) {
      if (!canQuarantine(row, chapterState, args)) {
        report.skippedByChapterSafeguard += 1;
        continue;
      }
      report.duplicateQuarantined += 1;
      if (!dryRun) {
        await prisma.bankQuestion.update({
          where: { id: row.id },
          data: {
            verified: false,
            qualityStatus: "REJECTED",
            rejectedAt: new Date(),
            rejectReason: appendReason(row.rejectReason, "near-duplicate stem; stronger sibling kept in serving pool"),
          },
        });
      }
    }
  }

  if (args.aiRepairLimit > 0) {
    const repairRows = await prisma.bankQuestion.findMany({
      where: {
        qualityStatus: "NEEDS_REVIEW",
        rejectReason: {
          contains: "thin explanation",
        },
      },
      orderBy: [{ timesWrong: "desc" }, { createdAt: "asc" }],
      take: args.aiRepairLimit,
    });
    for (let offset = 0; offset < repairRows.length; offset += args.aiBatchSize) {
      const result = await repairWithAI(repairRows.slice(offset, offset + args.aiBatchSize), dryRun, args.delayMs);
      report.aiRepair.attempted += result.attempted;
      report.aiRepair.repaired += result.repaired;
      report.aiRepair.rejected += result.rejected;
      report.aiRepair.unresolved += result.unresolved;
      report.aiRepair.models.push(...result.models);
    }
  }

  const after = await prisma.bankQuestion.groupBy({ by: ["qualityStatus"], _count: { _all: true } });
  const bySubjectStatus = await prisma.bankQuestion.groupBy({ by: ["subject", "qualityStatus"], _count: { _all: true } });
  const chapterMinimums = await prisma.bankQuestion.groupBy({
    by: ["subject", "chapter"],
    where: { qualityStatus: { notIn: [...EXCLUDED_STATUSES] } },
    _count: { _all: true },
    orderBy: { _count: { id: "asc" } },
    take: 12,
  });
  report.after = jsonSafe(after);
  report.bySubjectStatus = jsonSafe(bySubjectStatus);
  report.lowestUsableChapters = jsonSafe(chapterMinimums);

  const reportPath = path.join(REPORT_DIR, `bank-refine-sweep-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(reportPath, JSON.stringify(jsonSafe(report), null, 2));
  console.log(JSON.stringify(jsonSafe({ ...report, reportPath }), null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
