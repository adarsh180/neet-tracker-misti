import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
require("@next/env").loadEnvConfig(process.cwd());

const { fillVisualQuestionBank } = require("../src/lib/question-bank.ts");
const { db } = require("../src/lib/db.ts");

function argsFrom(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

const args = argsFrom(process.argv.slice(2));
const currentVisuals = await db.bankQuestion.count({
  where: { qualityStatus: "VERIFIED_STRICT", verified: true, visualAssetUrl: { not: null }, OR: [{ isDiagramBased: true }, { isGraphBased: true }] },
});
const target = Number(args.target ?? 5000);
const requested = args.count ? Number(args.count) : Math.max(0, target - currentVisuals);
if (requested <= 0) {
  console.log(JSON.stringify({ currentVisuals, target, inserted: 0, complete: true }, null, 2));
  await db.$disconnect();
  process.exit(0);
}
const report = await fillVisualQuestionBank({
  count: requested,
  batchSize: Number(args.batch ?? 4),
  subject: args.subject,
  chapter: args.chapter,
  timeBudgetMs: Number(args["time-budget-minutes"] ?? 30) * 60_000,
});
console.log(JSON.stringify({ currentVisuals, target, ...report }, null, 2));
await db.$disconnect();
