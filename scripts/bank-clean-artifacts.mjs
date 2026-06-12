// Cosmetic artifact cleanup for SERVABLE bank questions.
//
// Codex's quality pipeline rejected the broken questions and quarantined wrong
// keys; its bank-clean-text.mjs fixes mojibake. This pass removes the remaining
// machine-generator artifacts from otherwise-good servable stems: templated
// lead-ins ("Previous-year style:"), numeric-set tokens ("table 001-20",
// "item 14-15"), and leaked prompt text in sourceRef. Text only — never touches
// options, keys, or quality status.
//
// Cursor-based + small retrying transactions so TiDB's serverless connection
// drops (P1017) cannot corrupt a long run.
//
//   node --env-file=.env scripts/bank-clean-artifacts.mjs            (dry run)
//   node --env-file=.env scripts/bank-clean-artifacts.mjs --apply

import { PrismaClient } from "@prisma/client";

let db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const READ_BATCH = 2000;
const WRITE_CHUNK = 80;
const EXCLUDE = ["REJECTED", "NEEDS_VISUAL_ASSET", "NEEDS_REVIEW"];

const SOURCE_CLEAN_LABEL = {
  NEET_PYQ: "NEET PYQ", JEE_PYQ: "JEE Main PYQ", INSTITUTE: "Institute test-series",
  PLATFORM: "Standard practice", NCERT: "NCERT", AI: "Original",
};
const LEAKED_REF = /not a verbatim|aligned to NCERT|coaching-notes|test-series style question|Original question aligned|; not a/i;
// Strips machine lead-ins up to their first colon: "Previous-year style item:",
// "Previous-year style single-correct:", "Single-correct:", "PYQ-style ...:".
const PREFIX_NOISE = /^(?:Previous-year style|Single-correct|PYQ-style)[^:]{0,40}:\s*/i;
const NUMSET_TOKEN = /\s*\b(?:item|table|case|set|sheet|round|q|fig(?:ure)?)\s*\d{1,3}\s*[-–]\s*\d{1,3}\b/gi;
const BARE_NUMSET = /\s*\b0{2}\d\s*[-–]\s*\d{1,3}\b/g;

function cleanStem(text) {
  let out = String(text ?? "")
    .replace(PREFIX_NOISE, "")
    .replace(NUMSET_TOKEN, "")
    .replace(BARE_NUMSET, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:;,.?])/g, "$1")
    .trim();
  if (out && /^[a-z]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function writeChunkWithRetry(chunk) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.$transaction(chunk.map((c) => db.bankQuestion.update({ where: { id: c.id }, data: c.data })));
      return;
    } catch (err) {
      if (err.code === "P1017" || /closed the connection|ECONNRESET|socket/i.test(String(err.message))) {
        await db.$disconnect().catch(() => {});
        await sleep(1500 * (attempt + 1));
        db = new PrismaClient();
        continue;
      }
      throw err;
    }
  }
  throw new Error("write chunk failed after retries");
}

async function main() {
  console.log(`Artifact cleanup ${APPLY ? "(APPLY)" : "(dry run)"}\n`);
  let cursor = null;
  let scanned = 0, changed = 0;
  let pending = [];

  while (true) {
    const rows = await db.bankQuestion.findMany({
      where: { qualityStatus: { notIn: EXCLUDE } },
      take: READ_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, question: true, source: true, sourceRef: true },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned++;
      const cleanedQ = cleanStem(row.question);
      const refLeaked = LEAKED_REF.test(row.sourceRef);
      const cleanedRef = refLeaked ? (SOURCE_CLEAN_LABEL[row.source] ?? row.sourceRef.slice(0, 40)) : row.sourceRef;
      if (cleanedQ.length >= 12 && (cleanedQ !== row.question || cleanedRef !== row.sourceRef)) {
        changed++;
        pending.push({ id: row.id, data: { question: cleanedQ, sourceRef: cleanedRef } });
      }
    }

    if (APPLY) {
      while (pending.length >= WRITE_CHUNK) await writeChunkWithRetry(pending.splice(0, WRITE_CHUNK));
    } else {
      pending = [];
    }
    process.stdout.write(`\r  scanned ${scanned}, cleaned ${changed}...`);
  }

  if (APPLY) while (pending.length) await writeChunkWithRetry(pending.splice(0, WRITE_CHUNK));

  console.log(`\n\nScanned servable: ${scanned}`);
  console.log(`Text cleaned:     ${changed} (${((changed / Math.max(scanned, 1)) * 100).toFixed(1)}%)`);
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect().catch(() => {}); process.exit(1); });
