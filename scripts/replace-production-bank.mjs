import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
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
const { insertBankQuestions } = require("../src/lib/question-bank.ts");

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

async function* jsonLines(filePath) {
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (line.trim()) yield { row: JSON.parse(line), line: `${line}\n` };
  }
}

async function inspectFile(filePath, options = {}) {
  const hash = createHash("sha256");
  const hashes = options.uniqueHashes ? new Set() : null;
  let count = 0;
  let aiRows = 0;
  let unverified = 0;
  let duplicateHashes = 0;
  for await (const { row, line } of jsonLines(filePath)) {
    hash.update(line);
    count += 1;
    if (row.source === "AI") aiRows += 1;
    if (row.verified !== true) unverified += 1;
    if (hashes) {
      if (hashes.has(row.contentHash)) duplicateHashes += 1;
      hashes.add(row.contentHash);
    }
  }
  return { count, sha256: hash.digest("hex"), aiRows, unverified, duplicateHashes };
}

function restoredRow(row) {
  return {
    ...row,
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt) : null,
    rejectedAt: row.rejectedAt ? new Date(row.rejectedAt) : null,
    lastServedAt: row.lastServedAt ? new Date(row.lastServedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

async function restoreBackup(backupPath, expectedCount) {
  console.error("deployment failed; restoring production backup");
  await db.bankQuestion.deleteMany();
  let restored = 0;
  let batch = [];
  for await (const { row } of jsonLines(backupPath)) {
    batch.push(restoredRow(row));
    if (batch.length >= 250) {
      await db.bankQuestion.createMany({ data: batch });
      restored += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await db.bankQuestion.createMany({ data: batch });
    restored += batch.length;
  }
  if (restored !== expectedCount) throw new Error(`ROLLBACK_INCOMPLETE: restored ${restored}/${expectedCount}`);
  console.error(`rollback complete: restored ${restored} rows`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args["backup-report"] || !args.out) throw new Error("--file, --backup-report and --out are required");
  const inputPath = path.resolve(String(args.file));
  const backupReportPath = path.resolve(String(args["backup-report"]));
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const backupReport = JSON.parse(await readFile(backupReportPath, "utf8"));
  const backupPath = path.resolve(String(backupReport.backupPath));
  const [candidate, backup, liveBefore, bookmarksBefore] = await Promise.all([
    inspectFile(inputPath, { uniqueHashes: true }),
    inspectFile(backupPath),
    db.bankQuestion.count(),
    db.questionBookmark.count(),
  ]);
  if (backup.count !== Number(backupReport.count) || backup.sha256 !== backupReport.sha256) throw new Error("Backup manifest verification failed");
  if (liveBefore !== backup.count) throw new Error(`Live count ${liveBefore} no longer matches backup count ${backup.count}`);
  if (!candidate.count || candidate.aiRows || candidate.unverified || candidate.duplicateHashes) throw new Error(`Candidate preflight failed: ${JSON.stringify(candidate)}`);
  const preflight = { generatedAt: new Date().toISOString(), inputPath, backupReportPath, backupPath, candidate, backup, liveBefore, bookmarksBefore, applyRequested: Boolean(args.apply) };
  await writeFile(path.join(outputDir, "preflight.json"), `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
  if (!args.apply) {
    console.log(JSON.stringify({ ...preflight, databaseWrites: 0 }, null, 2));
    await db.$disconnect();
    return;
  }

  const importBatch = String(args.batch || `strict-non-ai-${new Date().toISOString().slice(0, 10)}`);
  let inserted = 0;
  const startedAt = new Date();
  try {
    const removed = await db.bankQuestion.deleteMany();
    if (removed.count !== liveBefore) throw new Error(`Expected to remove ${liveBefore}, removed ${removed.count}`);
    let batch = [];
    for await (const { row } of jsonLines(inputPath)) {
      batch.push(row);
      if (batch.length >= 500) {
        const result = await insertBankQuestions(batch, { trusted: true, importBatch, verificationMethod: "STRICT_MULTI_PASS_2026_07" });
        if (result.invalid.length || result.duplicate || result.inserted !== batch.length) throw new Error(`Import batch failed validation: ${JSON.stringify(result)}`);
        inserted += result.inserted;
        batch = [];
        if (inserted % 5000 === 0) console.log(`inserted ${inserted}/${candidate.count}`);
      }
    }
    if (batch.length) {
      const result = await insertBankQuestions(batch, { trusted: true, importBatch, verificationMethod: "STRICT_MULTI_PASS_2026_07" });
      if (result.invalid.length || result.duplicate || result.inserted !== batch.length) throw new Error(`Final import batch failed validation: ${JSON.stringify(result)}`);
      inserted += result.inserted;
    }
    const [liveAfter, strictAfter, aiAfter, bookmarksAfter, bySubject] = await Promise.all([
      db.bankQuestion.count(),
      db.bankQuestion.count({ where: { verified: true, qualityStatus: "VERIFIED_STRICT" } }),
      db.bankQuestion.count({ where: { source: "AI" } }),
      db.questionBookmark.count(),
      db.bankQuestion.groupBy({ by: ["subject"], _count: { _all: true } }),
    ]);
    if (liveAfter !== candidate.count || strictAfter !== candidate.count || aiAfter !== 0 || bookmarksAfter !== bookmarksBefore) {
      throw new Error(`Post-deployment verification failed: ${JSON.stringify({ liveAfter, strictAfter, aiAfter, bookmarksAfter, bookmarksBefore })}`);
    }
    const report = {
      completedAt: new Date().toISOString(), startedAt: startedAt.toISOString(), inputPath, backupPath, importBatch,
      before: { rows: liveBefore, bookmarks: bookmarksBefore },
      after: { rows: liveAfter, strict: strictAfter, ai: aiAfter, bookmarks: bookmarksAfter, bySubject: Object.fromEntries(bySubject.map((entry) => [entry.subject, entry._count._all])) },
      inserted,
      rollbackRequired: false,
    };
    await writeFile(path.join(outputDir, "deployment-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await restoreBackup(backupPath, backup.count);
    const failure = { failedAt: new Date().toISOString(), inputPath, backupPath, insertedBeforeFailure: inserted, error: error instanceof Error ? error.message : String(error), rollbackRequired: false, rollbackCompleted: true };
    await writeFile(path.join(outputDir, "deployment-failure.json"), `${JSON.stringify(failure, null, 2)}\n`, "utf8");
    throw error;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
