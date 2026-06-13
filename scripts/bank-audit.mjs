import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { PrismaClient } = require("@prisma/client");
const { extractJsonArray } = require("../src/lib/ai-json.ts");
const { BANK_MODELS, BANK_SECOND_PASS_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");

const prisma = new PrismaClient();

// ── Deterministic quality heuristics ───────────────────────────────────────
const ARTIFACT = /\b(?:item|table|case|set|sheet)\s*\d{1,3}\s*[-–]\s*\d{1,3}\b|\b0{2}\d\s*[-–]\s*\d{1,3}\b|^Previous-year style|Diagram\/graph description/i;
const norm = (t) => String(t ?? "").toLowerCase().replace(/\$[^$]*\$/g, " ").replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();

function keyConceptPresent(key, exp) {
  if (exp.includes(key)) return true;
  for (const w of key.split(" ")) if (w.length >= 5 && exp.includes(w.slice(0, 5))) return true;
  return false;
}
// High-precision text contradiction (conclusion clause names a non-key option). Lower bound.
function contradictionSuspect(options, ci, explanation, stem) {
  if (/\b(not|except|incorrect|false|wrong|cannot|never|neither)\b/i.test(stem)) return false;
  const exp = norm(explanation);
  if (exp.length < 20) return false;
  const n = options.map(norm);
  const key = n[ci];
  if (!key || key.length < 8) return false;
  if (keyConceptPresent(key, exp)) return false;
  const m = exp.match(/(?:hence|therefore|thus|so that|indicates?|means that|the answer is|correct option is|conclude[ds]?)([^.]*)$/);
  if (!m) return false;
  let hits = 0;
  for (let i = 0; i < n.length; i++) {
    if (i === ci) continue;
    const o = n[i];
    if (o.length < 8) continue;
    if (o.includes(key) || key.includes(o)) continue;
    if (m[1].includes(o)) hits++;
  }
  return hits === 1;
}

function classifyRow(row) {
  const opts = Array.isArray(row.optionsJson) ? row.optionsJson.map((o) => (typeof o === "string" ? o : String(o ?? ""))) : [];
  const flags = [];
  if (opts.length !== 4) flags.push("bad-options");
  else {
    if (opts.some((o) => /^\[object object\]$/i.test(o.trim()) || !o.trim())) flags.push("bad-options");
    if (new Set(opts.map((o) => o.trim().toLowerCase())).size < 4) flags.push("dup-options");
  }
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) flags.push("bad-index");
  if (ARTIFACT.test(row.question)) flags.push("artifact-stem");
  if ((row.explanation ?? "").trim().length < 25) flags.push("thin-explanation");
  if (opts.length === 4 && contradictionSuspect(opts, row.correctIndex, row.explanation, row.question)) flags.push("key-contradiction");
  return flags;
}

// ── AI double-blind accuracy sample ─────────────────────────────────────────
function rowToPayload(row, index) {
  return { id: `q${index + 1}`, subject: row.subject, question: row.question, options: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [] };
}
async function solveBlind(rows, models) {
  const result = await chatWithAI(
    [
      { role: "system", content: "You are a senior NEET UG examiner. Solve independently. Respond only with a valid JSON array. Never include markdown fences." },
      { role: "user", content: `Blind-solve each single-correct MCQ. Return JSON array [{ "id": "q1", "answerIndex": 0-3, "confident": true|false }].\n${JSON.stringify(rows.map(rowToPayload))}` },
    ],
    3200, 0.05, 150000, models,
  );
  return extractJsonArray(result.content) ?? [];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sampleAccuracy(subject, sampleSize) {
  const total = await prisma.bankQuestion.count({ where: { subject, qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET", "NEEDS_REVIEW"] } } });
  if (!total) return { subject, sampled: 0, agree: 0, accuracy: null };
  const rows = await prisma.bankQuestion.findMany({
    where: { subject, qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET", "NEEDS_REVIEW"] } },
    skip: Math.floor(Math.random() * Math.max(1, total - sampleSize)),
    take: sampleSize,
  });
  let agree = 0;
  let scored = 0;
  for (let off = 0; off < rows.length; off += 6) {
    const batch = rows.slice(off, off + 6);
    const a = await solveBlind(batch, BANK_MODELS);
    await sleep(400);
    const b = await solveBlind(batch, BANK_SECOND_PASS_MODELS);
    const am = new Map(a.map((e) => [String(e.id), e]));
    const bm = new Map(b.map((e) => [String(e.id), e]));
    batch.forEach((row, i) => {
      const id = `q${i + 1}`;
      const ae = am.get(id);
      const be = bm.get(id);
      if (!ae || !be) return;
      scored += 1;
      // both solvers agree with each other AND with the stored key
      if (Number(ae.answerIndex) === row.correctIndex && Number(be.answerIndex) === row.correctIndex) agree += 1;
    });
    await sleep(400);
  }
  return { subject, sampled: scored, agree, accuracy: scored ? Math.round((agree / scored) * 1000) / 10 : null };
}

async function main() {
  const args = process.argv.slice(2);
  const sampleSize = Number((args.find((a) => a.startsWith("--sample=")) || "--sample=30").split("=")[1]);

  console.log("Deterministic scan...");
  const PAGE = 5000;
  let skip = 0;
  const byBatch = new Map();
  const flagTotals = {};
  let scanned = 0;
  while (true) {
    const rows = await prisma.bankQuestion.findMany({
      skip, take: PAGE,
      where: { qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET", "NEEDS_REVIEW"] } },
      select: { subject: true, source: true, importBatch: true, question: true, optionsJson: true, correctIndex: true, explanation: true, questionForm: true },
    });
    if (!rows.length) break;
    for (const row of rows) {
      scanned += 1;
      const flags = classifyRow(row);
      const key = `${row.subject}|${row.source}|${row.importBatch ?? "—"}`;
      const e = byBatch.get(key) ?? { subject: row.subject, source: row.source, importBatch: row.importBatch ?? "—", count: 0, flagged: 0, contradictions: 0, artifacts: 0, withForm: 0 };
      e.count += 1;
      if (flags.length) e.flagged += 1;
      if (flags.includes("key-contradiction")) e.contradictions += 1;
      if (flags.includes("artifact-stem")) e.artifacts += 1;
      if (row.questionForm) e.withForm += 1;
      byBatch.set(key, e);
      for (const f of flags) flagTotals[f] = (flagTotals[f] ?? 0) + 1;
    }
    skip += PAGE;
    process.stdout.write(`\r  scanned ${scanned}...`);
  }
  console.log(`\n  scanned ${scanned} servable rows`);
  console.log("  flag totals:", JSON.stringify(flagTotals));

  const hitList = [...byBatch.values()]
    .filter((b) => b.count >= 30)
    .map((b) => ({ ...b, contradictionRate: Math.round((b.contradictions / b.count) * 1000) / 10, artifactRate: Math.round((b.artifacts / b.count) * 1000) / 10, formCoverage: Math.round((b.withForm / b.count) * 1000) / 10 }))
    .sort((a, b) => b.contradictions + b.artifacts - (a.contradictions + a.artifacts));

  console.log("\nWorst batches (top 15 by contradiction+artifact):");
  for (const b of hitList.slice(0, 15)) {
    console.log(`  ${b.subject}/${b.source}/${b.importBatch} n=${b.count} contradiction=${b.contradictionRate}% artifact=${b.artifactRate}% form=${b.formCoverage}%`);
  }

  console.log(`\nAI double-blind accuracy sample (${sampleSize}/subject)...`);
  const samples = [];
  for (const subject of ["Physics", "Chemistry", "Botany", "Zoology"]) {
    const s = await sampleAccuracy(subject, sampleSize);
    console.log(`  ${subject}: ${s.accuracy}% (${s.agree}/${s.sampled} both solvers agree with key)`);
    samples.push(s);
  }
  const totSampled = samples.reduce((s, x) => s + x.sampled, 0);
  const totAgree = samples.reduce((s, x) => s + x.agree, 0);
  const overall = totSampled ? Math.round((totAgree / totSampled) * 1000) / 10 : null;
  console.log(`  OVERALL sampled accuracy: ${overall}% (${totAgree}/${totSampled})`);

  mkdirSync("data/bank-audit", { recursive: true });
  writeFileSync("data/bank-audit/report.json", JSON.stringify({ at: new Date().toISOString(), scanned, flagTotals, hitList, samples, overallSampledAccuracy: overall }, null, 2));
  console.log("\nWrote data/bank-audit/report.json");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
