import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(process.cwd(), file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}

loadEnv();

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { extractJson, extractJsonArray } = require("../src/lib/ai-json.ts");
const { AI_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");

let prisma = new PrismaClient();
const SOURCE_BATCHES = ["physics-pdf-bank-ready.json", "physics-pdf-complete-review.json"];
const MODEL_CHAIN = [AI_MODELS.bulkFlash, AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.emergencyFallback];
const MODEL_ALIASES = {
  bulkFlash: AI_MODELS.bulkFlash,
  fallback1: AI_MODELS.fallback1,
  primary: AI_MODELS.primary,
  emergencyFallback: AI_MODELS.emergencyFallback,
};

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

function isTransientDbError(error) {
  const text = String(error?.code ?? "") + " " + String(error?.message ?? error);
  return /P1001|P1017|P1002|Can't reach database|closed the connection|ECONNRESET|ETIMEDOUT|socket/i.test(text);
}

async function withDbRetry(fn) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientDbError(error) || attempt === 4) throw error;
      await prisma.$disconnect().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      prisma = new PrismaClient();
    }
  }
  throw new Error("unreachable db retry state");
}

function optionsOf(row) {
  return Array.isArray(row.optionsJson) ? row.optionsJson.map(clean) : [];
}

function payloadFor(rows) {
  return rows.map((row, index) => ({
    id: `q${index + 1}`,
    dbId: row.id,
    chapter: row.chapter,
    sourceRef: row.sourceRef,
    question: clean(row.question),
    options: optionsOf(row),
    storedAnswerIndex: row.correctIndex,
    storedExplanation: clean(row.explanation),
  }));
}

async function adjudicate(rows, modelChain, timeoutMs, maxTokens) {
  const payload = payloadFor(rows);
  const messages = [
    {
      role: "system",
      content:
        "You are a senior NEET UG Physics examiner and PDF extraction QA. Validate single-correct MCQs for a CBT question bank. Return only raw valid JSON. Do not use markdown fences, prose, or multiline strings.",
    },
    {
      role: "user",
      content: `For each Physics MCQ:
1. Independently solve the question from the stem and options.
2. Check whether the extracted question/options/explanation look corrupted, cross-question mixed, or missing a required diagram/graph.
3. Use the stored explanation as evidence only if it is relevant to the same question.

Return a raw JSON array only. Every string value must be one line with escaped quotes; do not include literal newline characters inside strings. Entries:
{
  "id": "q1",
  "valid": true|false,
  "answerIndex": 0|1|2|3|null,
  "confidence": 0-1,
  "explanationOk": true|false,
  "needsVisual": true|false,
  "extractionCorrupt": true|false,
  "correctedExplanation": "",
  "reason": "maximum 18 words, never the literal word short"
}

Return exactly one array element for every input row. Preserve each "id" exactly.
Mark valid=false if ambiguous, out of NEET Physics, malformed, has no correct option, has multiple correct options, or requires a missing visual.
Do not rubber-stamp the stored key. If the stored key is wrong but the MCQ is otherwise valid, return the corrected answerIndex.
This pass validates existing extracted rows only. Do not generate replacement explanations; always set correctedExplanation to "".

Rows:
${JSON.stringify(payload)}`,
    },
  ];

  let last = { model: modelChain[0] ?? "unknown", raw: "", entries: [] };
  for (const model of modelChain) {
    try {
      const result = await chatWithAI(messages, maxTokens, 0.05, timeoutMs, [model]);
      let entries = extractJsonArray(result.content) ?? [];
      if (!entries.length && rows.length === 1) {
        const single = extractJson(result.content);
        if (single && typeof single === "object" && !Array.isArray(single)) entries = [single];
      }
      last = { model: result.model, raw: result.content, entries };
      if (entries.length >= rows.length) return last;
      console.warn(`[physics-ai-adjudicate] ${result.model} returned incomplete JSON (${entries.length}/${rows.length}); trying next model`);
    } catch (error) {
      console.warn(`[physics-ai-adjudicate] ${model} failed adjudication call -> ${String(error).slice(0, 240)}`);
    }
  }
  return last;
}

function decision(entry) {
  const answerIndex = Number(entry?.answerIndex);
  const confidence = Number(entry?.confidence ?? 0);
  const valid = entry?.valid === true;
  const needsVisual = entry?.needsVisual === true;
  const extractionCorrupt = entry?.extractionCorrupt === true;
  if (needsVisual) return { status: "NEEDS_VISUAL_ASSET", verified: false, score: Math.min(confidence, 0.5), answerIndex, reason: entry?.reason ?? "needs visual" };
  if (!valid || extractionCorrupt || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3 || confidence < 0.86) {
    return { status: "NEEDS_REVIEW", verified: false, score: Math.min(confidence, 0.5), answerIndex: null, reason: entry?.reason ?? "low-confidence or corrupt" };
  }
  return { status: "VERIFIED_STRICT", verified: true, score: Math.max(0.9, Math.min(confidence, 0.99)), answerIndex, reason: entry?.reason ?? "AI adjudicated valid" };
}

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const limit = Math.max(1, Number(args.limit ?? 80));
const batchSize = Math.max(1, Math.min(20, Number(args.batch ?? 15)));
const delayMs = Math.max(0, Number(args.delay ?? 400));
const importBatch = args["import-batch"] ? String(args["import-batch"]) : undefined;
const minCreatedId = args["after-id"] ? String(args["after-id"]) : undefined;
const retryReviewed = Boolean(args["retry-reviewed"]);
const timeoutMs = Math.max(30000, Number(args["timeout-ms"] ?? 90000));
const maxTokens = Math.max(1500, Number(args["max-tokens"] ?? 6000));
const debugRaw = Boolean(args["debug-raw"]);
const modelChain = args.models
  ? String(args.models)
      .split(",")
      .map((model) => MODEL_ALIASES[model.trim()] ?? model.trim())
      .filter(Boolean)
  : MODEL_CHAIN;

try {
  const candidateRows = await withDbRetry(() => prisma.bankQuestion.findMany({
    where: {
      subject: "Physics",
      qualityStatus: "NEEDS_REVIEW",
      importBatch: importBatch ? importBatch : { in: SOURCE_BATCHES },
      isDiagramBased: false,
      isGraphBased: false,
      visualAssetKind: null,
      id: minCreatedId ? { gt: minCreatedId } : undefined,
      OR: retryReviewed
        ? undefined
        : [{ verifierModel: null }, { NOT: { verifierModel: { startsWith: "physics-ai-adjudicate-v1:" } } }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  }));
  const rows = candidateRows.slice(0, limit);

  let verified = 0;
  let review = 0;
  let visual = 0;
  let rekeyed = 0;
  let calls = 0;
  let skipped = 0;
  const examples = [];

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;
    const totalBatches = Math.ceil(rows.length / batchSize);
    console.error(`[physics-ai-adjudicate] batch ${batchNumber}/${totalBatches} rows=${batch.length} models=${modelChain.join(" -> ")}`);
    const result = await adjudicate(batch, modelChain, timeoutMs, maxTokens);
    console.error(`[physics-ai-adjudicate] batch ${batchNumber}/${totalBatches} model=${result.model} entries=${result.entries.length}`);
    if (debugRaw && result.entries.length < batch.length) {
      const raw = clean(result.raw);
      console.error(`[physics-ai-adjudicate] raw ${batchNumber}/${totalBatches} len=${raw.length} head=${raw.slice(0, 500)} tail=${raw.slice(-240)}`);
    }
    calls += 1;
    let decisions = batch.map((row, index) => ({
      row,
      entry: (result.entries ?? []).find((entry) => String(entry.id) === `q${index + 1}`),
      model: result.model,
    }));

    const missing = decisions.filter((item) => !item.entry);
    if (missing.length && batch.length > 1) {
      console.error(`[physics-ai-adjudicate] incomplete batch response; retrying ${missing.length} rows singly`);
      for (const item of missing) {
        calls += 1;
        const single = await adjudicate([item.row], modelChain, timeoutMs, Math.min(maxTokens, 2500));
        const entry = (single.entries ?? []).find((candidate) => String(candidate.id) === "q1");
        if (debugRaw && !entry) {
          const raw = clean(single.raw);
          console.error(`[physics-ai-adjudicate] raw single len=${raw.length} head=${raw.slice(0, 500)} tail=${raw.slice(-240)}`);
        }
        item.entry = entry ? { ...entry, id: `q${batch.indexOf(item.row) + 1}` } : null;
        item.model = single.model;
      }
    }

    for (let index = 0; index < decisions.length; index += 1) {
      const { row, entry, model } = decisions[index];
      if (!entry) {
        skipped += 1;
        if (examples.length < 12) {
          examples.push({
            id: row.id,
            status: "SKIPPED",
            chapter: row.chapter,
            sourceRef: row.sourceRef,
            answer: null,
            confidence: 0,
            reason: "model omitted row",
            question: clean(row.question).slice(0, 160),
          });
        }
        continue;
      }
      let next = decision(entry);
      const correctedExplanation = clean(entry?.correctedExplanation);
      const explanationVerified = entry?.explanationOk === true || (correctedExplanation.length >= 40 && correctedExplanation.length <= 900);
      if (next.status === "VERIFIED_STRICT" && !explanationVerified) {
        next = {
          status: "NEEDS_REVIEW",
          verified: false,
          score: Math.min(next.score, 0.5),
          answerIndex: null,
          reason: "answer solved but explanation was not verified",
        };
      }
      const data = {
        verified: next.verified,
        qualityStatus: next.status,
        qualityScore: next.score,
        verifiedAt: next.verified ? new Date() : null,
        rejectedAt: null,
        verifierModel: `physics-ai-adjudicate-v1:${model}`,
        verifierRuns: entry ?? null,
        rejectReason: next.status === "VERIFIED_STRICT" ? null : next.reason,
      };
      if (next.status === "VERIFIED_STRICT") {
        verified += 1;
        if (next.answerIndex !== row.correctIndex) {
          data.correctIndex = next.answerIndex;
          rekeyed += 1;
        }
        if (correctedExplanation.length >= 40 && correctedExplanation.length <= 900) data.explanation = correctedExplanation;
      } else if (next.status === "NEEDS_VISUAL_ASSET") {
        visual += 1;
      } else {
        review += 1;
      }

      if (apply) await withDbRetry(() => prisma.bankQuestion.update({ where: { id: row.id }, data }));
      if (examples.length < 12) {
        examples.push({
          id: row.id,
          status: next.status,
          chapter: row.chapter,
          sourceRef: row.sourceRef,
          answer: next.answerIndex,
          confidence: next.score,
          reason: next.reason,
          question: clean(row.question).slice(0, 160),
        });
      }
    }

    if (offset + batchSize < rows.length && delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(JSON.stringify({ apply, checked: rows.length, calls, verified, rekeyed, review, visual, skipped, examples }, null, 2));
} finally {
  await prisma.$disconnect();
}
