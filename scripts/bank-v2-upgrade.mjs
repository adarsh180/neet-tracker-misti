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
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
require("@next/env").loadEnvConfig(process.cwd());

const { upgradeQuestionBankToAutomatedV2 } = require("../src/lib/question-bank.ts");
const { db } = require("../src/lib/db.ts");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const report = await upgradeQuestionBankToAutomatedV2({
  limit: Number(args.limit ?? 100),
  batchSize: Number(args.batch ?? 6),
  delayMs: Number(args.delay ?? 800),
  dryRun: Boolean(args["dry-run"]),
  statuses: args.statuses ? String(args.statuses).split(",").map((value) => value.trim()).filter(Boolean) : undefined,
});
console.log(JSON.stringify(report, null, 2));
await db.$disconnect();
