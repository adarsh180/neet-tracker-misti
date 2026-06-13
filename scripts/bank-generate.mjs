import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020", baseUrl: ".", paths: { "@/*": ["./src/*"] } },
});
// Resolve "@/..." path aliases used inside the imported TS modules.
require("tsconfig-paths").register({ baseUrl: ".", paths: { "@/*": ["./src/*"] } });

const { PrismaClient } = require("@prisma/client");
const { extractJsonArray } = require("../src/lib/ai-json.ts");
const { AI_MODELS, BANK_SECOND_PASS_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");
const { CHAPTERS } = require("../src/data/syllabus/neet-chapters.ts");
const { insertBankQuestions } = require("../src/lib/question-bank.ts");

let prisma = new PrismaClient();

// bank-generate: NCERT-grounded ORIGINAL questions in top institute-test-series
// style (no verbatim textbook reproduction), modern NEET/JEE-Main forms, each
// blind-verified before insert so inserted rows are correct by construction and
// stored as VERIFIED_STRICT.

const GEN_MODELS = BANK_SECOND_PASS_MODELS; // gemini-3.5-flash lead (high quality)
const GEMMA_A = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.bulkFlash, AI_MODELS.emergencyFallback];
const GEMMA_B = [AI_MODELS.primary, AI_MODELS.fallback1, AI_MODELS.bulkFlash, AI_MODELS.emergencyFallback];
const FLASH_C = [AI_MODELS.bulkFlash, AI_MODELS.emergencyFallback, AI_MODELS.primary];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) a[k] = true; else { a[k] = n; i++; }
  }
  return a;
}

const FORM_LINE = `Form mix across the batch: ~50% single-correct, ~18% Statement-based (Statement I & II, then ask which are correct), ~14% Assertion-Reason (A & R with the standard 4 options), ~10% Match-the-column (two lists), ~8% case/passage-based. Tag each with "questionForm" = SINGLE | STATEMENT | ASSERTION_REASON | MATCH_COLUMN | CASE.`;

function genPrompt(subject, classLevel, chapter, count) {
  return [
    `You are a senior question setter for top NEET UG / JEE Main test series (Allen / Aakash / Physics Wallah standard).`,
    `Write ${count} ORIGINAL single-correct MCQs for NEET UG, strictly inside NCERT Class ${classLevel} ${subject}, chapter "${chapter}".`,
    `Author original questions grounded in the chapter's NCERT concepts and standard previous-year patterns. Do NOT copy textbook sentences verbatim — compose fresh, exam-grade items.`,
    FORM_LINE,
    `HARD RULES:
1. Respond with a valid JSON array ONLY — no markdown fences, no prose. Begin your reply with "[".
2. Each item: { "subject": "${subject}", "classLevel": "${classLevel}", "chapter": "${chapter}", "topic": "specific topic", "source": "AI", "sourceRef": "Institute test-series standard", "difficulty": "EASY|MODERATE|TOUGH", "questionForm": "SINGLE|STATEMENT|ASSERTION_REASON|MATCH_COLUMN|CASE", "question": "string", "options": ["A","B","C","D"], "correctIndex": 0-3, "explanation": "1-3 sentence reason the key is correct" }.
3. Difficulty spread ~30% EASY, ~45% MODERATE, ~25% TOUGH.
4. Exactly 4 options, mutually exclusive, similar length, one unambiguous correct answer. Solve each yourself before keying it.
5. Math/chemistry in LaTeX inline $...$ (use \\times, subscripts like $N_2O_4$); plain text for biology.
6. No diagrams/figures (text-only). No "as shown in figure".
7. BE COMPACT: question < 90 words, options < 18 words, explanation < 45 words.`,
  ].join("\n\n");
}

async function solveBlind(rows, models) {
  const payload = rows.map((row, i) => ({ id: `q${i + 1}`, subject: row.subject, question: row.question, options: row.options }));
  const result = await chatWithAI(
    [
      { role: "system", content: "You are a senior NEET UG examiner. Solve independently. Respond only with a valid JSON array. Never include markdown fences." },
      { role: "user", content: `Blind-solve each single-correct MCQ. Return [{ "id": "q1", "answerIndex": 0-3, "confident": true|false, "ambiguous": true|false }].\n${JSON.stringify(payload)}` },
    ],
    3200, 0.05, 150000, models,
  );
  return extractJsonArray(result.content) ?? [];
}
const conf = (v) => v && v.confident !== false && v.ambiguous !== true && Number.isInteger(Number(v.answerIndex)) && Number(v.answerIndex) >= 0 && Number(v.answerIndex) <= 3;

// Verify a candidate batch; return rows with the blind-confirmed key (verified=true).
async function verifyCandidates(candidates) {
  if (!candidates.length) return [];
  const a = await solveBlind(candidates, GEMMA_A); await sleep(400);
  const b = await solveBlind(candidates, GEMMA_B);
  const ma = new Map(a.map((e) => [String(e.id), e]));
  const mb = new Map(b.map((e) => [String(e.id), e]));
  const need = candidates.filter((_, i) => {
    const va = ma.get(`q${i + 1}`); const vb = mb.get(`q${i + 1}`);
    return !(conf(va) && conf(vb) && Number(va.answerIndex) === Number(vb.answerIndex));
  });
  let mc = new Map();
  if (need.length) { await sleep(400); const c = await solveBlind(need, FLASH_C); mc = new Map(c.map((e) => [String(e.id), e])); }
  const needIdx = new Map(need.map((row, j) => [row, `q${j + 1}`]));

  const kept = [];
  candidates.forEach((row, i) => {
    const votes = {};
    for (const v of [ma.get(`q${i + 1}`), mb.get(`q${i + 1}`), mc.get(needIdx.get(row))]) if (conf(v)) votes[Number(v.answerIndex)] = (votes[Number(v.answerIndex)] ?? 0) + 1;
    let bestIdx = -1, best = 0, tie = false;
    for (const [k, n] of Object.entries(votes)) { if (n > best) { bestIdx = Number(k); best = n; tie = false; } else if (n === best) tie = true; }
    if (best >= 2 && !tie) kept.push({ ...row, correctIndex: bestIdx, verified: true });
  });
  return kept;
}

async function generateChapter(subject, classLevel, chapter, count) {
  const result = await chatWithAI(
    [
      { role: "system", content: "You are a precise NEET/JEE question setter. Respond only with a valid JSON array. Never include markdown fences." },
      { role: "user", content: genPrompt(subject, classLevel, chapter, count) },
    ],
    8000, 0.5, 150000, GEN_MODELS,
  );
  const raw = extractJsonArray(result.content) ?? [];
  // shape into candidate rows for verification
  return raw
    .filter((q) => q && Array.isArray(q.options) && q.options.length === 4 && q.question)
    .map((q) => ({
      subject, classLevel, chapter,
      topic: q.topic ? String(q.topic) : null,
      source: "AI",
      sourceRef: "Institute test-series standard",
      difficulty: ["EASY", "MODERATE", "TOUGH"].includes(String(q.difficulty).toUpperCase()) ? String(q.difficulty).toUpperCase() : "MODERATE",
      questionForm: String(q.questionForm ?? "SINGLE").toUpperCase(),
      question: String(q.question),
      options: q.options.map(String),
      correctIndex: Number(q.correctIndex),
      explanation: String(q.explanation ?? ""),
    }));
}

async function chapterTargets(spread) {
  // verified count per chapter; fill the gaps toward a modest target, weighted to thinnest.
  const verified = await prisma.bankQuestion.groupBy({ by: ["subject", "chapter"], where: { qualityStatus: "VERIFIED_STRICT" }, _count: { _all: true } });
  const vmap = new Map(verified.map((r) => [`${r.subject}::${r.chapter}`, r._count._all]));
  const TARGET = 300;
  const gaps = CHAPTERS.map((c) => ({ ...c, verified: vmap.get(`${c.subject}::${c.chapter}`) ?? 0 }))
    .map((c) => ({ ...c, gap: Math.max(0, TARGET - c.verified) }))
    .filter((c) => c.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const totalGap = gaps.reduce((s, c) => s + c.gap, 0) || 1;
  return gaps.map((c) => ({ ...c, want: Math.max(10, Math.round((c.gap / totalGap) * spread)) }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchSize = Math.max(5, Math.min(12, Number(args.batch ?? 10)));
  const maxCalls = Number(args["max-calls"] ?? Infinity);
  const importBatch = `generated-${new Date().toISOString().slice(0, 10)}`;
  let calls = 0, inserted = 0, dropped = 0;

  let plan;
  if (args.subject && args.chapter) {
    const entry = CHAPTERS.find((c) => c.subject === args.subject && c.chapter === args.chapter) || { subject: args.subject, classLevel: args.classLevel ?? "11", chapter: args.chapter };
    plan = [{ ...entry, want: Number(args.count ?? 30) }];
  } else {
    plan = await chapterTargets(Number(args.spread ?? 5000));
  }

  console.log(`bank-generate — ${plan.length} chapters, ~${plan.reduce((s, c) => s + c.want, 0)} target questions\n`);

  for (const chap of plan) {
    if (calls >= maxCalls) break;
    let made = 0;
    while (made < chap.want && calls < maxCalls) {
      const n = Math.min(batchSize, chap.want - made);
      let candidates;
      try { candidates = await generateChapter(chap.subject, chap.classLevel, chap.chapter, n); calls++; }
      catch (err) { console.warn(`  gen failed ${chap.subject}/${chap.chapter}: ${String(err).slice(0, 60)}`); break; }
      if (!candidates.length) break;
      await sleep(400);
      let kept;
      try { kept = await verifyCandidates(candidates); calls += 2; }
      catch (err) { console.warn(`  verify failed: ${String(err).slice(0, 60)}`); break; }
      dropped += candidates.length - kept.length;
      if (kept.length) {
        const report = await insertBankQuestions(kept, { trusted: true, importBatch });
        inserted += report.inserted;
        made += report.inserted;
      }
      process.stdout.write(`\r  ${chap.subject}/${chap.chapter}: +${made}/${chap.want} · total inserted ${inserted} dropped ${dropped} · ${calls} calls`);
      await sleep(400);
    }
    console.log("");
  }
  // Mark this run's blind-verified inserts as VERIFIED_STRICT so they count and
  // rank ahead of unverified stock when serving.
  const promoted = await prisma.bankQuestion.updateMany({
    where: { importBatch, verified: true, qualityStatus: "UNVERIFIED" },
    data: { qualityStatus: "VERIFIED_STRICT", qualityScore: 0.95, verifiedAt: new Date() },
  });
  console.log(`\nDone. inserted=${inserted} dropped=${dropped} calls=${calls} · promoted ${promoted.count} to VERIFIED_STRICT`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
