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
const { cleanQuestionOptions, cleanQuestionText, isPlaceholderText } = require("../src/lib/text-cleanup.ts");

const prisma = new PrismaClient();

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

function appendReason(existing, addition) {
  const text = String(existing ?? "").trim();
  if (!text) return addition;
  if (text.includes(addition)) return text;
  return `${text}; ${addition}`.slice(0, 4000);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function isArtifactStem(question) {
  const text = cleanQuestionText(question);
  return (
    isPlaceholderText(text) ||
    /\b(?:table|item|case)\s+\d{3}-\d{2}\b/i.test(text) ||
    /^\s*Assertion-Reason\s+\d{3}-\d{2}\s*:/i.test(text) ||
    /\b(?:Table\/matching item|Lengthy case)\s+\d+-\d+\b/i.test(text)
  );
}

function lowQualityReason(row) {
  const options = Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : [];
  if (options.length !== 4) return "invalid option count";
  if (options.some((option) => isPlaceholderText(option))) return "unreadable placeholder option text";
  if (isArtifactStem(row.question)) return "generator artifact stem";
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) return "invalid correctIndex";
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === true || args.dryRun === true;
  const verbose = args.verbose === true;
  const limit = Math.max(1, Math.min(250000, Number(args.limit ?? 250000)));
  const candidates = await prisma.bankQuestion.findMany({
    where: {
      qualityStatus: { not: "REJECTED" },
      OR: [
        { optionsJson: { array_contains: "[object Object]" } },
        { question: { contains: " table " } },
        { question: { contains: "Assertion-Reason " } },
        { question: { contains: "Lengthy case" } },
        { question: { contains: "Table/matching item" } },
      ],
    },
    select: {
      id: true,
      subject: true,
      chapter: true,
      question: true,
      optionsJson: true,
      correctIndex: true,
      rejectReason: true,
    },
    take: limit,
  });

  const badRows = candidates
    .map((row) => ({ row, reason: lowQualityReason(row) }))
    .filter((entry) => entry.reason);

  const byChapter = new Map();
  for (const { row } of badRows) {
    const key = `${row.subject}::${row.chapter}`;
    byChapter.set(key, (byChapter.get(key) ?? 0) + 1);
  }

  if (!dryRun) {
    for (const group of chunk(badRows, 200)) {
      await prisma.bankQuestion.updateMany({
        where: { id: { in: group.map(({ row }) => row.id) } },
        data: {
          verified: false,
          qualityStatus: "REJECTED",
          rejectedAt: new Date(),
          rejectReason: "Quarantined before CBT serving: unreadable placeholder options or generator artifact stem",
        },
      });
    }
  }

  if (verbose) {
    for (const { row, reason } of badRows) {
      console.log(`${dryRun ? "WOULD_REJECT" : "REJECTED"}\t${row.id}\t${row.subject}\t${row.chapter}\t${reason}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: candidates.length,
        rejected: badRows.length,
        byChapter: Object.fromEntries([...byChapter.entries()].sort()),
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
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
