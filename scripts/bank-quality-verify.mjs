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
const { BANK_MODELS, BANK_SECOND_PASS_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");

const prisma = new PrismaClient();

const STRICT_MODELS = BANK_MODELS;
const SECOND_PASS_MODELS = BANK_SECOND_PASS_MODELS;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowToPayload(row, index) {
  return {
    id: `q${index + 1}`,
    subject: row.subject,
    chapter: row.chapter,
    difficulty: row.difficulty,
    question: row.question,
    options: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [],
  };
}

async function solveBlind(rows, models) {
  const payload = rows.map(rowToPayload);
  const result = await chatWithAI(
    [
      {
        role: "system",
        content:
          "You are a senior NEET UG examiner. Solve independently. Respond only with valid JSON array. Never include markdown fences.",
      },
      {
        role: "user",
        content: `Blind-solve each single-correct MCQ below. Do not assume the provided question is valid. Return a JSON array:
[{ "id": "q1", "answerIndex": 0-3, "confident": true|false, "reason": "short reason", "ambiguous": true|false }].

Set confident=false or ambiguous=true if:
- more than one option can be correct,
- no option is correct,
- data is insufficient,
- the wording is scientifically wrong,
- the options are malformed.

Questions:
${JSON.stringify(payload)}`,
      },
    ],
    3600,
    0.05,
    150000,
    models,
  );

  const solved = extractJsonArray(result.content) ?? [];
  return { model: result.model, solved };
}

function decisionFor(row, first, second) {
  const firstAnswer = Number(first?.answerIndex);
  const secondAnswer = Number(second?.answerIndex);
  const firstConfident = first?.confident !== false && first?.ambiguous !== true;
  const secondConfident = second?.confident !== false && second?.ambiguous !== true;
  const key = row.correctIndex;

  if (firstConfident && secondConfident && firstAnswer === key && secondAnswer === key) {
    return {
      status: "VERIFIED_STRICT",
      verified: true,
      score: 0.97,
      reason: "two independent blind solvers agreed confidently with stored key",
    };
  }

  if ((firstConfident && firstAnswer !== key) || (secondConfident && secondAnswer !== key)) {
    return {
      status: "REJECTED",
      verified: false,
      score: 0,
      reason: `solver disagreement with stored key ${key}`,
    };
  }

  return {
    status: "NEEDS_REVIEW",
    verified: false,
    score: 0.5,
    reason: "solver uncertainty or incomplete consensus",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Math.max(1, Number(args.limit ?? 100));
  const batchSize = Math.max(1, Math.min(8, Number(args.batch ?? 6)));
  const delayMs = Math.max(0, Number(args.delay ?? 6000));
  const dryRun = Boolean(args["dry-run"]);

  const where = {
    qualityStatus: args.retry ? { in: ["UNVERIFIED", "NEEDS_REVIEW"] } : "UNVERIFIED",
    subject: args.subject ? String(args.subject) : undefined,
    chapter: args.chapter ? String(args.chapter) : undefined,
  };

  const rows = await prisma.bankQuestion.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  });

  let verified = 0;
  let rejected = 0;
  let needsReview = 0;

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const first = await solveBlind(batch, STRICT_MODELS);
    await sleep(delayMs);
    const second = await solveBlind(batch, SECOND_PASS_MODELS);

    const firstMap = new Map(first.solved.map((entry) => [String(entry.id), entry]));
    const secondMap = new Map(second.solved.map((entry) => [String(entry.id), entry]));

    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      const id = `q${i + 1}`;
      const decision = decisionFor(row, firstMap.get(id), secondMap.get(id));
      if (decision.status === "VERIFIED_STRICT") verified += 1;
      else if (decision.status === "REJECTED") rejected += 1;
      else needsReview += 1;

      const verifierRuns = {
        first: { model: first.model, result: firstMap.get(id) ?? null },
        second: { model: second.model, result: secondMap.get(id) ?? null },
      };

      if (!dryRun) {
        await prisma.bankQuestion.update({
          where: { id: row.id },
          data: {
            verified: decision.verified,
            qualityStatus: decision.status,
            qualityScore: decision.score,
            verifiedAt: decision.verified ? new Date() : null,
            rejectedAt: decision.status === "REJECTED" ? new Date() : null,
            verifierModel: `${first.model}; ${second.model}`,
            verifierRuns,
            rejectReason: decision.status === "VERIFIED_STRICT" ? null : decision.reason,
          },
        });
      }

      console.log(`${decision.status}\t${row.subject}\t${row.chapter}\t${row.id}\t${decision.reason}`);
    }

    if (offset + batchSize < rows.length) await sleep(delayMs);
  }

  console.log(
    JSON.stringify(
      {
        checked: rows.length,
        verified,
        rejected,
        needsReview,
        dryRun,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
