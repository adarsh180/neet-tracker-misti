import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
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
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { PrismaClient } = require("@prisma/client");
const { contentHash, isStrictlyServeableBankRow } = require("../src/lib/question-bank.ts");
const prisma = new PrismaClient();

const filePath = path.resolve(process.argv[2] || "data/pdf-admission-audit/adjudicated-botany-anatomy-pilot.valid.jsonl");
const text = await fs.readFile(filePath, "utf8");
const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const hashes = rows.map((row) => contentHash(row.question, row.options));
const live = await prisma.bankQuestion.findMany({ where: { contentHash: { in: hashes } } });
const serveable = live.filter(isStrictlyServeableBankRow);
const missing = hashes.filter((hash) => !live.some((row) => row.contentHash === hash));

console.log(JSON.stringify({
  input: rows.length,
  live: live.length,
  strictServeable: serveable.length,
  missing: missing.length,
  bySubjectChapter: Object.fromEntries(
    [...new Set(serveable.map((row) => `${row.subject} :: ${row.chapter}`))].map((key) => [
      key,
      serveable.filter((row) => `${row.subject} :: ${row.chapter}` === key).length,
    ]),
  ),
}, null, 2));

await prisma.$disconnect();
