import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
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
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
const { db } = require("../src/lib/db.ts");

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

async function write(stream, text) {
  if (!stream.write(text)) await once(stream, "drain");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error("--out is required");
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const backupPath = path.join(outputDir, "bank-questions-before-strict-deployment.jsonl");
  const stream = createWriteStream(backupPath, { encoding: "utf8" });
  const hash = createHash("sha256");
  const beforeCount = await db.bankQuestion.count();
  let count = 0;
  let cursor = null;
  while (true) {
    const rows = await db.bankQuestion.findMany({
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      const line = `${JSON.stringify(row)}\n`;
      hash.update(line);
      await write(stream, line);
      count += 1;
    }
    cursor = rows.at(-1).id;
    if (count % 10000 === 0) console.log(`backed up ${count}/${beforeCount}`);
  }
  stream.end();
  await once(stream, "finish");
  if (count !== beforeCount) throw new Error(`Backup count ${count} does not match live count ${beforeCount}`);
  const report = {
    generatedAt: new Date().toISOString(),
    backupPath,
    count,
    sha256: hash.digest("hex"),
    source: "production bank_questions",
    databaseWrites: 0,
  };
  await writeFile(path.join(outputDir, "backup-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
