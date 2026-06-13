import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { PrismaClient } = require("@prisma/client");
const { extractJsonArray } = require("../src/lib/ai-json.ts");
const { AI_MODELS, BANK_MODELS, BANK_SECOND_PASS_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(process.cwd(), file);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}

loadEnv();

// Cost-optimal solver chains. The two free Gemma models adjudicate first; the
// paid flash tie-break (chain C) is only invoked when they disagree or when a
// re-key is proposed (high-stakes), so confirmations of already-correct questions
// cost ₹0.
const GEMMA_A = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.bulkFlash, AI_MODELS.emergencyFallback]; // gemma-26b lead
const GEMMA_B = [AI_MODELS.primary, AI_MODELS.fallback1, AI_MODELS.bulkFlash, AI_MODELS.emergencyFallback]; // gemma-31b lead
const FLASH_C = [AI_MODELS.bulkFlash, AI_MODELS.emergencyFallback, AI_MODELS.primary]; // gemini-3.5-flash lead (paid)

let prisma = new PrismaClient();

// bank-perfect: verify → re-key → re-verify, so every processed question ends up
// either VERIFIED_STRICT (key confirmed or corrected) or REJECTED (+ its chapter
// queued for fresh generation). The dominant fix is the re-key path: when two
// INDEPENDENT blind solvers agree on an answer different from the stored key, the
// stored key is wrong and we correct it (the Chemistry Kc/biomolecules errors).

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function payload(rows) {
  return rows.map((row, i) => ({
    id: `q${i + 1}`,
    subject: row.subject,
    question: row.question,
    options: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [],
  }));
}

async function solveBlind(rows, models) {
  const result = await chatWithAI(
    [
      { role: "system", content: "You are a senior NEET UG examiner. Solve each MCQ independently and rigorously. Respond only with a valid JSON array. Never include markdown fences." },
      {
        role: "user",
        content:
          `Blind-solve each single-correct MCQ. Do not assume the supplied option order implies the answer. Return a JSON array:\n` +
          `[{ "id": "q1", "answerIndex": 0-3, "confident": true|false, "ambiguous": true|false }].\n` +
          `Set confident=false / ambiguous=true if more than one option fits, none fits, data is insufficient, or the wording is scientifically wrong.\n\n` +
          JSON.stringify(payload(rows)),
      },
    ],
    3600, 0.05, 150000, models,
  );
  return { model: result.model, solved: extractJsonArray(result.content) ?? [] };
}

async function withRetry(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err?.code === "P1017" || /closed the connection|ECONNRESET|socket/i.test(String(err?.message))) {
        await prisma.$disconnect().catch(() => {});
        await sleep(1500 * (attempt + 1));
        prisma = new PrismaClient();
        continue;
      }
      throw err;
    }
  }
  throw new Error("db op failed after retries");
}

const QUEUE_PATH = "data/bank-audit/regen-queue.json";
function loadQueue() {
  if (!existsSync(QUEUE_PATH)) return {};
  try { return JSON.parse(readFileSync(QUEUE_PATH, "utf8")); } catch { return {}; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Math.max(1, Number(args.limit ?? 200));
  const batchSize = Math.max(1, Math.min(6, Number(args.batch ?? 6)));
  const delayMs = Math.max(0, Number(args.delay ?? 800));
  const maxCalls = Number(args["max-calls"] ?? Infinity);
  const dryRun = Boolean(args["dry-run"]);

  const concurrency = Math.max(1, Math.min(16, Number(args.concurrency ?? 6)));
  const where = {
    qualityStatus: args.retry ? { in: ["UNVERIFIED", "NEEDS_REVIEW"] } : "UNVERIFIED",
    subject: args.subject ? String(args.subject) : undefined,
    chapter: args.chapter ? String(args.chapter) : undefined,
    importBatch: args["import-batch"] ? String(args["import-batch"]) : undefined,
  };

  const rows = await prisma.bankQuestion.findMany({ where, orderBy: [{ createdAt: "asc" }], take: limit });
  console.log(`bank-perfect ${dryRun ? "(dry run) " : ""}— ${rows.length} rows (subject=${args.subject ?? "all"}) · concurrency ${concurrency}\n`);

  let verified = 0, rekeyed = 0, rejected = 0, skipped = 0, calls = 0, processed = 0;
  const regen = loadQueue();
  const conf = (v) => v && v.confident !== false && v.ambiguous !== true && Number.isInteger(Number(v.answerIndex)) && Number(v.answerIndex) >= 0 && Number(v.answerIndex) <= 3;
  const idxOf = (v) => Number(v.answerIndex);

  // Solve with retry so transient API failures don't cause false skips.
  async function solveWithRetry(batch, models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await solveBlind(batch, models);
        calls++;
        if (r.solved.length) return r;
      } catch { /* fall through to retry */ }
      await sleep(1500 * (attempt + 1));
    }
    return { model: "", solved: [] };
  }

  // Build batches, process them with a bounded concurrency pool.
  const batches = [];
  for (let off = 0; off < rows.length; off += batchSize) batches.push(rows.slice(off, off + batchSize));

  async function processBatch(batch) {
    const passA = await solveWithRetry(batch, GEMMA_A);
    await sleep(delayMs);
    const passB = await solveWithRetry(batch, GEMMA_B);
    const ma = new Map(passA.solved.map((e) => [String(e.id), e]));
    const mb = new Map(passB.solved.map((e) => [String(e.id), e]));

    const needFlash = batch.filter((row, i) => {
      const a = ma.get(`q${i + 1}`);
      const b = mb.get(`q${i + 1}`);
      return !(conf(a) && conf(b) && idxOf(a) === idxOf(b) && idxOf(a) === row.correctIndex);
    });
    let mc = new Map();
    let flashModel = "";
    if (needFlash.length) {
      await sleep(delayMs);
      const passC = await solveWithRetry(needFlash, FLASH_C);
      flashModel = passC.model;
      mc = new Map(passC.solved.map((e) => [String(e.id), e]));
    }
    const flashIdById = new Map(needFlash.map((row, j) => [row.id, `q${j + 1}`]));
    const verifierModel = [passA.model, passB.model, flashModel].filter(Boolean).join("; ");

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const votes = {};
      let confidentCount = 0;
      for (const v of [ma.get(`q${i + 1}`), mb.get(`q${i + 1}`), mc.get(flashIdById.get(row.id))]) {
        if (conf(v)) { votes[idxOf(v)] = (votes[idxOf(v)] ?? 0) + 1; confidentCount++; }
      }
      let bestIdx = -1, bestVotes = 0, tie = false;
      for (const [k, n] of Object.entries(votes)) {
        if (n > bestVotes) { bestIdx = Number(k); bestVotes = n; tie = false; }
        else if (n === bestVotes) tie = true;
      }

      processed++;
      // Insufficient evidence (API failures / too few confident solves): leave
      // UNVERIFIED for a later pass — never reject on missing data.
      if (confidentCount < 2) { skipped++; continue; }

      let data;
      if (bestVotes >= 2 && !tie) {
        if (bestIdx === row.correctIndex) {
          verified++;
          data = { verified: true, qualityStatus: "VERIFIED_STRICT", qualityScore: 0.97, verifiedAt: new Date(), rejectReason: null, verifierModel };
        } else {
          rekeyed++;
          data = { correctIndex: bestIdx, verified: true, qualityStatus: "VERIFIED_STRICT", qualityScore: 0.92, verifiedAt: new Date(), rejectReason: `key corrected ${row.correctIndex}->${bestIdx} by ${bestVotes} independent blind solvers`, verifierModel };
        }
      } else {
        rejected++;
        regen[`${row.subject}::${row.chapter}`] = (regen[`${row.subject}::${row.chapter}`] ?? 0) + 1;
        data = { verified: false, qualityStatus: "REJECTED", qualityScore: 0, rejectedAt: new Date(), rejectReason: `genuine solver disagreement (votes=${JSON.stringify(votes)}) — queued for regeneration`, verifierModel };
      }
      if (!dryRun) await withRetry(() => prisma.bankQuestion.update({ where: { id: row.id }, data }));
    }
    process.stdout.write(`\r  processed ${processed}/${rows.length} · verified ${verified} rekeyed ${rekeyed} rejected ${rejected} skipped ${skipped} · ${calls} calls`);
  }

  // bounded concurrency pool
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length && calls < maxCalls) {
      const my = batches[cursor++];
      try { await processBatch(my); } catch (err) { console.warn(`\n  batch failed: ${String(err).slice(0, 80)}`); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (!dryRun) {
    mkdirSync("data/bank-audit", { recursive: true });
    writeFileSync(QUEUE_PATH, JSON.stringify(regen, null, 2));
  }
  console.log(`\n\nDone. verified=${verified} rekeyed=${rekeyed} rejected=${rejected} skipped=${skipped} calls=${calls}`);
  console.log(`Regen queue chapters: ${Object.keys(regen).length} (saved ${QUEUE_PATH})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
