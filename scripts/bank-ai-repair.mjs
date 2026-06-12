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
const DEFAULT_MODELS = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.emergencyFallback];
const BIO_ARITHMETIC_RE =
  /\b\d+\b[^?]*(?:sections|samples|specimens|plants|organisms|cells|roots|leaves|flowers|fields)[^?]*(?:each|per)[^?]*\b\d+\b[^?]*(?:total|how many|calculate|find)/i;

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

function appendReason(existing, addition) {
  const text = String(existing ?? "").trim();
  if (!text) return addition;
  if (text.includes(addition)) return text;
  return `${text}; ${addition}`.slice(0, 4000);
}

function rowToPayload(row, index) {
  return {
    id: `q${index + 1}`,
    dbId: row.id,
    subject: row.subject,
    chapter: row.chapter,
    topic: row.topic,
    difficulty: row.difficulty,
    source: row.source,
    question: row.question,
    options: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [],
    storedAnswerIndex: row.correctIndex,
    storedExplanation: row.explanation,
    knownIssue: row.rejectReason,
  };
}

function isBiologyArithmeticFiller(row, explanation = "") {
  if (row.subject !== "Botany" && row.subject !== "Zoology") return false;
  const question = String(row.question ?? "");
  const reason = String(explanation ?? "");
  return BIO_ARITHMETIC_RE.test(question) || /\b(simple|straightforward|basic)\s+(?:arithmetic|multiplication|calculation)\b/i.test(reason);
}

function modelLane(args) {
  if (args.models === "flash" || args.model === "flash") return [AI_MODELS.emergencyFallback];
  if (args.models === "primary" || args.model === "primary") return [AI_MODELS.primary];
  if (args.models === "fallback" || args.model === "fallback") return [AI_MODELS.fallback1];
  return DEFAULT_MODELS;
}

async function repairBatch(rows, dryRun, options) {
  const payload = rows.map(rowToPayload);
  const result = await chatWithAI(
    [
      {
        role: "system",
        content:
          "You are a senior NEET UG examiner repairing a question bank. Solve independently. Respond only with valid JSON array. Never include markdown fences.",
      },
      {
        role: "user",
        content: `Repair these single-correct MCQs. Do not change the question/options. Return exactly one object per input:
[{ "id": "q1", "valid": true|false, "answerIndex": 0-3, "explanation": "45-120 words, teaches the concept", "confidence": 0-1, "reason": "short" }].

Rules:
- Set valid=false if the row is filler, ambiguous, has no correct option, has multiple correct options, is outside NEET scope, or needs a missing diagram/graph/table.
- If valid=true, answerIndex must be the independently solved correct option and explanation must justify that key.
- Do not trust the stored answer.

Rows:
${JSON.stringify(payload)}`,
      },
    ],
    options.maxTokens,
    0.05,
    options.timeoutMs,
    options.models,
  );

  const repaired = extractJsonArray(result.content) ?? [];
  const byId = new Map(repaired.map((entry) => [String(entry.id), entry]));
  const summary = { attempted: rows.length, repaired: 0, rejected: 0, needsReview: 0, model: result.model };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const entry = byId.get(`q${index + 1}`);
    const answerIndex = Number(entry?.answerIndex);
    const confidence = Number(entry?.confidence ?? 0);
    const explanation = String(entry?.explanation ?? "").trim();
    const biologyArithmeticFiller = isBiologyArithmeticFiller(row, `${explanation} ${entry?.reason ?? ""}`);
    const isReliable =
      !biologyArithmeticFiller &&
      entry?.valid === true &&
      Number.isInteger(answerIndex) &&
      answerIndex >= 0 &&
      answerIndex <= 3 &&
      confidence >= 0.72 &&
      explanation.length >= 35;

    if (isReliable) {
      summary.repaired += 1;
      if (!dryRun) {
        await prisma.bankQuestion.update({
          where: { id: row.id },
          data: {
            correctIndex: answerIndex,
            explanation,
            verified: false,
            qualityStatus: "UNVERIFIED",
            qualityScore: Math.max(0.6, Math.min(0.82, confidence)),
            verifierModel: result.model,
            verifierRuns: { repair: entry },
            rejectReason: appendReason(row.rejectReason, "AI-repaired key/explanation; pending blind verification"),
          },
        });
      }
      console.log(`REPAIRED\t${row.id}\t${row.subject}\t${row.chapter}\t${answerIndex}\t${entry.reason ?? ""}`);
      continue;
    }

    if (entry?.valid === false || confidence < 0.45 || biologyArithmeticFiller) {
      summary.rejected += 1;
      if (!dryRun) {
        await prisma.bankQuestion.update({
          where: { id: row.id },
          data: {
            verified: false,
            qualityStatus: "REJECTED",
            rejectedAt: new Date(),
            verifierModel: result.model,
            verifierRuns: { repair: entry ?? null },
            rejectReason: appendReason(row.rejectReason, biologyArithmeticFiller ? "AI repair guard rejected biology arithmetic filler" : `AI repair rejected/unusable: ${entry?.reason ?? "no reliable repair"}`),
          },
        });
      }
      console.log(`REJECTED\t${row.id}\t${row.subject}\t${row.chapter}\t${entry?.reason ?? "no reliable repair"}`);
      continue;
    }

    summary.needsReview += 1;
    if (!dryRun) {
      await prisma.bankQuestion.update({
        where: { id: row.id },
        data: {
          verified: false,
          qualityStatus: "NEEDS_REVIEW",
          verifierModel: result.model,
          verifierRuns: { repair: entry ?? null },
          rejectReason: appendReason(row.rejectReason, `AI repair unresolved: ${entry?.reason ?? "weak repair"}`),
        },
      });
    }
    console.log(`NEEDS_REVIEW\t${row.id}\t${row.subject}\t${row.chapter}\t${entry?.reason ?? "weak repair"}`);
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !args.apply;
  const limit = Math.max(1, Number(args.limit ?? 30));
  const batchSize = Math.max(1, Math.min(8, Number(args.batch ?? 5)));
  const delayMs = Math.max(0, Number(args.delay ?? 5000));
  const options = {
    maxTokens: Math.max(800, Number(args.tokens ?? 7000)),
    timeoutMs: Math.max(15000, Number(args.timeout ?? 150000)),
    models: modelLane(args),
  };
  const where = {
    qualityStatus: args.status ? String(args.status) : "NEEDS_REVIEW",
    subject: args.subject ? String(args.subject) : undefined,
    chapter: args.chapter ? String(args.chapter) : undefined,
    rejectReason: args.all
      ? undefined
      : {
          contains: args.reason ? String(args.reason) : "thin explanation",
        },
  };

  const rows = await prisma.bankQuestion.findMany({
    where,
    orderBy: [{ timesWrong: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  const total = { attempted: 0, repaired: 0, rejected: 0, needsReview: 0, failedBatches: 0, dryRun, models: [] };
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    try {
      const summary = await repairBatch(rows.slice(offset, offset + batchSize), dryRun, options);
      total.attempted += summary.attempted;
      total.repaired += summary.repaired;
      total.rejected += summary.rejected;
      total.needsReview += summary.needsReview;
      total.models.push(summary.model);
    } catch (error) {
      total.failedBatches += 1;
      console.error(`FAILED_BATCH\toffset=${offset}\t${error instanceof Error ? error.message : String(error)}`);
    }
    if (offset + batchSize < rows.length) await sleep(delayMs);
  }
  console.log(JSON.stringify(total, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
