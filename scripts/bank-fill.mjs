import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    target: "ES2020",
  },
});
require("@next/env").loadEnvConfig(process.cwd());

const {
  fillQuestionBank,
  getBankStatus,
} = require("../src/lib/question-bank.ts");
const { db } = require("../src/lib/db.ts");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function printStatus(rows) {
  console.log("Subject\tClass\tChapter\tVerified/Quota\tDifficulty(E/M/T)\tSources");
  for (const row of rows) {
    const sources = Object.entries(row.source)
      .filter(([, count]) => count)
      .map(([source, count]) => `${source}:${count}`)
      .join(",");
    console.log(
      `${row.subject}\t${row.classLevel}\t${row.chapter}\t${row.verified}/${row.quota}\t${row.difficulty.EASY}/${row.difficulty.MODERATE}/${row.difficulty.TOUGH}\t${sources || "-"}`,
    );
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.status) {
  const rows = await getBankStatus();
  printStatus(rows);
  process.exit(0);
}

let count = args.count ? Number(args.count) : args["max-questions"] ? Number(args["max-questions"]) : 300;
let maxQuestions = args["max-questions"] ? Number(args["max-questions"]) : count;
if (args["target-strict"]) {
  const currentStrict = await db.bankQuestion.count({ where: { qualityStatus: "VERIFIED_STRICT", verified: true } });
  const targetStrict = Math.max(currentStrict, Number(args["target-strict"]));
  count = targetStrict - currentStrict;
  maxQuestions = count;
  console.log(`Current strict bank: ${currentStrict}. Strict target: ${targetStrict}. Remaining accepted inserts: ${count}.`);
  if (count === 0) process.exit(0);
} else if (args["target-total"]) {
  const currentTotal = await db.bankQuestion.count();
  const targetTotal = Math.max(currentTotal, Number(args["target-total"]));
  count = targetTotal - currentTotal;
  maxQuestions = count;
  console.log(`Current bank: ${currentTotal}. Target: ${targetTotal}. Remaining inserts: ${count}.`);
  if (count === 0) process.exit(0);
}

if (!args.all && (!args.subject || !args.chapter)) {
  console.error('Usage: node scripts/bank-fill.mjs --subject physics --chapter "Laws of Motion" --count 200');
  console.error("   or: node scripts/bank-fill.mjs --all --max-questions 1000");
  console.error("   or: node scripts/bank-fill.mjs --all --target-strict 300000 --time-budget-minutes 60");
  console.error("   or: node scripts/bank-fill.mjs --all --target-total 300000 --time-budget-minutes 60");
  console.error("   or: node scripts/bank-fill.mjs --status");
  process.exit(1);
}

const report = await fillQuestionBank({
  subject: args.subject,
  chapter: args.chapter,
  count,
  all: Boolean(args.all),
  maxQuestions,
  timeBudgetMs: Math.max(1, Number(args["time-budget-minutes"] ?? 2)) * 60_000,
  batchSize: Number(args.batch ?? 8),
});

console.log(JSON.stringify(report, null, 2));
await db.$disconnect();
