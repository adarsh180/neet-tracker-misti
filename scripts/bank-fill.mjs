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

const {
  fillQuestionBank,
  getBankStatus,
} = require("../src/lib/question-bank.ts");

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

const count = args.count ? Number(args.count) : args["max-questions"] ? Number(args["max-questions"]) : 300;
const maxQuestions = args["max-questions"] ? Number(args["max-questions"]) : count;

if (!args.all && (!args.subject || !args.chapter)) {
  console.error('Usage: node scripts/bank-fill.mjs --subject physics --chapter "Laws of Motion" --count 200');
  console.error("   or: node scripts/bank-fill.mjs --all --max-questions 1000");
  console.error("   or: node scripts/bank-fill.mjs --status");
  process.exit(1);
}

const report = await fillQuestionBank({
  subject: args.subject,
  chapter: args.chapter,
  count,
  all: Boolean(args.all),
  maxQuestions,
});

console.log(JSON.stringify(report, null, 2));
