import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");

const PAGE_SIZE = 2000;
const UPDATE_BATCH_SIZE = 300;
const MAX_RETRIES = 8;
const STRICT_METHODS = new Set(["AUTOMATED_DOUBLE_BLIND_PLUS_CRITIC", "OFFICIAL_PAPER_KEY_VERIFIED"]);
const HARD_SOURCE_REASONS = new Set([
  "UNKNOWN_SUBJECT",
  "UNKNOWN_CHAPTER",
  "INVALID_OPTIONS",
  "DUPLICATE_OPTIONS",
  "UNREADABLE_TEXT",
  "MALFORMED_MATH_MARKUP",
  "UNRESOLVED_ANSWER",
  "ANSWER_FIELD_CONFLICT",
  "DUPLICATE_GROUP_ANSWER_CONFLICT",
  "MISSING_EXPLANATION",
]);
const SELECT = {
  id: true,
  subject: true,
  chapter: true,
  contentHash: true,
  source: true,
  sourceRef: true,
  verified: true,
  qualityStatus: true,
  qualityScore: true,
  verifiedAt: true,
  rejectedAt: true,
  verifierModel: true,
  verificationMethod: true,
  verificationVersion: true,
  rejectReason: true,
  question: true,
  optionsJson: true,
  correctIndex: true,
  explanation: true,
  optionExplanationsJson: true,
  questionForm: true,
  isDiagramBased: true,
  isGraphBased: true,
  visualAssetKind: true,
  visualAssetUrl: true,
  visualAssetId: true,
  provenanceJson: true,
  exam: true,
  examYear: true,
  paperCode: true,
  paperQuestionNumber: true,
};

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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryDatabase(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.split("\n").filter(Boolean).at(-1) : String(error);
      console.error(`[${label}] attempt ${attempt}/${MAX_RETRIES} failed: ${message}`);
      if (attempt < MAX_RETRIES) await sleep(Math.min(12000, 750 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function loadJsonLines(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function mergeManifestRows(rows) {
  const manifest = new Map();
  for (const row of rows) {
    const existing = manifest.get(row.contentHash);
    if (!existing) {
      manifest.set(row.contentHash, { ...row, reasons: new Set(row.reasons ?? []) });
      continue;
    }
    for (const reason of row.reasons ?? []) existing.reasons.add(reason);
    existing.visualClaim ||= Boolean(row.visualClaim);
    if (existing.resolvedAnswer !== null && row.resolvedAnswer !== null && existing.resolvedAnswer !== row.resolvedAnswer) {
      existing.reasons.add("MANIFEST_HASH_ANSWER_CONFLICT");
    }
  }
  return manifest;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readableOptions(row) {
  if (!Array.isArray(row.optionsJson) || row.optionsJson.length !== 4) return null;
  const options = row.optionsJson.map(normalizeText);
  if (options.some((option) => !option || /^\[object Object\]$/i.test(option))) return null;
  if (new Set(options.map((option) => option.toLocaleLowerCase("en"))).size !== 4) return null;
  return options;
}

function hasUnreadableText(value) {
  return /[\ufffd\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(String(value ?? ""));
}

function hasMangledMathMarkup(value) {
  if (Array.isArray(value)) return value.some(hasMangledMathMarkup);
  if (value && typeof value === "object") return Object.values(value).some(hasMangledMathMarkup);
  if (typeof value !== "string") return false;
  return (
    /\text\s*\{|\frac\s*\{|\theta\b|\times\b|\x08egin\s*\{|\x08eta\b|\right\b|\nu\b/.test(value) ||
    /\b(?:ext|rac|egin)\s*\{|\b(?:heta|imes|ight)\b/.test(value)
  );
}

function hasFourOptionRationales(row) {
  return (
    Array.isArray(row.optionExplanationsJson) &&
    row.optionExplanationsJson.length === 4 &&
    row.optionExplanationsJson.every((entry) => normalizeText(entry).length >= 8 && !hasUnreadableText(entry))
  );
}

function isNumericalLike(row, manifest) {
  const form = `${row.questionForm ?? ""} ${manifest?.questionForm ?? ""}`;
  return (
    /numer|calculation|formula|multi-step|circuit|ray-diagram|graph-based/i.test(form) ||
    /\bcalculate\b|\bfind the (?:value|magnitude|ratio|number)\b|\bhow many\b/i.test(row.question)
  );
}

function hasOfficialPyqProvenance(row) {
  const provenance = row.provenanceJson;
  return Boolean(
    row.verificationMethod === "OFFICIAL_PAPER_KEY_VERIFIED" &&
      provenance &&
      typeof provenance === "object" &&
      provenance.officialKeyVerified === true &&
      provenance.paperUrl &&
      provenance.answerKeyUrl &&
      row.exam &&
      Number.isInteger(row.examYear) &&
      row.paperCode &&
      Number.isInteger(row.paperQuestionNumber),
  );
}

function sourceForManifest(manifest, currentSource, currentRef) {
  if (!manifest) return { source: currentSource, sourceRef: currentRef };
  if (manifest.provenance === "UNVERIFIED_NEET_PYQ_CLAIM") return { source: "NEET_PYQ", sourceRef: currentRef };
  if (manifest.provenance === "UNVERIFIED_JEE_PYQ_CLAIM") return { source: "JEE_PYQ", sourceRef: currentRef };
  if (manifest.provenance === "NCERT_ALIGNED_UNVERIFIED_REFERENCE") {
    return { source: "AI", sourceRef: "AI original - NCERT-aligned" };
  }
  if (manifest.provenance === "COACHING_STYLE_UNLICENSED") {
    return { source: "AI", sourceRef: "AI original - coaching-style" };
  }
  return { source: "AI", sourceRef: "AI original" };
}

function proposedState(row, manifest, auditAt) {
  const reasons = new Set(manifest ? [...manifest.reasons] : []);
  const options = readableOptions(row);
  if (!options) reasons.add("DATABASE_INVALID_OPTIONS");
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) reasons.add("DATABASE_INVALID_KEY");
  if (!normalizeText(row.question) || hasUnreadableText(row.question)) reasons.add("DATABASE_UNREADABLE_QUESTION");
  if (normalizeText(row.explanation).length < 25 || hasUnreadableText(row.explanation)) reasons.add("DATABASE_THIN_OR_UNREADABLE_EXPLANATION");
  if (hasMangledMathMarkup([row.question, row.optionsJson, row.explanation, row.optionExplanationsJson])) {
    reasons.add("DATABASE_MALFORMED_MATH_MARKUP");
  }

  const manifestClaimsPyq =
    manifest?.provenance === "UNVERIFIED_NEET_PYQ_CLAIM" || manifest?.provenance === "UNVERIFIED_JEE_PYQ_CLAIM";
  const unsupportedPyq =
    (row.source === "NEET_PYQ" || row.source === "JEE_PYQ" || manifestClaimsPyq) && !hasOfficialPyqProvenance(row);
  if (unsupportedPyq) reasons.add("MISSING_OFFICIAL_PYQ_PROVENANCE");

  const source = sourceForManifest(manifest, row.source, row.sourceRef);
  const isGeneratedCorpus = Boolean(
    manifest &&
      ["ORIGINAL_STYLE_OR_GENERATED", "NCERT_ALIGNED_UNVERIFIED_REFERENCE", "COACHING_STYLE_UNLICENSED"].includes(manifest.provenance),
  );
  const hardFailure = [...reasons].some((reason) => HARD_SOURCE_REASONS.has(reason)) ||
    ["MANIFEST_HASH_ANSWER_CONFLICT", "DATABASE_INVALID_OPTIONS", "DATABASE_INVALID_KEY", "DATABASE_UNREADABLE_QUESTION", "DATABASE_MALFORMED_MATH_MARKUP"].some((reason) => reasons.has(reason));
  const visualClaim = Boolean(row.isDiagramBased || row.isGraphBased || row.visualAssetKind || manifest?.visualClaim);
  const missingVisual = (visualClaim || row.qualityStatus === "NEEDS_VISUAL_ASSET") && !row.visualAssetId;
  if (missingVisual) reasons.add("DATABASE_MISSING_VISUAL_ASSET");
  if (row.qualityStatus === "REJECTED") reasons.add("EXISTING_REJECTED_PRESERVED");

  const numerical = isNumericalLike(row, manifest);
  const completeExplanation = normalizeText(row.explanation).length >= (numerical ? 40 : 25);
  const explanationPolicy = numerical ? completeExplanation : hasFourOptionRationales(row);
  if (!explanationPolicy) reasons.add(numerical ? "NUMERICAL_SOLUTION_NEEDS_REVIEW" : "MISSING_DATABASE_OPTION_RATIONALES");

  const generatorBoilerplate = manifest?.reasons.has("GENERATOR_BOILERPLATE") === true;
  const strictEligible =
    !hardFailure &&
    !missingVisual &&
    !unsupportedPyq &&
    !generatorBoilerplate &&
    explanationPolicy &&
    STRICT_METHODS.has(row.verificationMethod) &&
    row.verified === true;

  let qualityStatus;
  if (hardFailure || row.qualityStatus === "REJECTED") qualityStatus = "REJECTED";
  else if (missingVisual) qualityStatus = "NEEDS_VISUAL_ASSET";
  else if (strictEligible) qualityStatus = "VERIFIED_STRICT";
  else if (manifest || unsupportedPyq || (row.qualityStatus === "VERIFIED_STRICT" && !STRICT_METHODS.has(row.verificationMethod))) qualityStatus = "NEEDS_REVIEW";
  else qualityStatus = row.qualityStatus;

  const isStrict = qualityStatus === "VERIFIED_STRICT";
  const shouldAudit = Boolean(manifest || unsupportedPyq || row.qualityStatus === "VERIFIED_STRICT");
  const data = {
    source: source.source,
    sourceRef: source.sourceRef,
    verified: isStrict,
    qualityStatus,
    qualityScore: isStrict ? row.qualityScore : null,
    verifiedAt: isStrict ? row.verifiedAt : null,
    rejectedAt: qualityStatus === "REJECTED" ? row.rejectedAt ?? auditAt : null,
    verificationMethod: isStrict ? row.verificationMethod : shouldAudit ? (qualityStatus === "REJECTED" ? "SOURCE_AUDIT_REJECTED" : "SOURCE_AUDIT_PENDING") : row.verificationMethod,
    verificationVersion: isStrict ? row.verificationVersion : shouldAudit ? "source-audit-v1" : row.verificationVersion,
    rejectReason: isStrict || !shouldAudit ? row.rejectReason : `SOURCE_AUDIT: ${[...reasons].sort().join(", ")}`,
  };

  if (!isGeneratedCorpus && !manifest) {
    data.source = row.source;
    data.sourceRef = row.sourceRef;
  }

  return { data, reasons, matched: Boolean(manifest), unsupportedPyq, numerical, strictEligible };
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function rowNeedsChange(row, data) {
  return Object.entries(data).some(([key, value]) => comparable(row[key]) !== comparable(value));
}

function changedFields(row, data) {
  return Object.fromEntries(Object.entries(data).filter(([key, value]) => comparable(row[key]) !== comparable(value)));
}

function backupFields(row) {
  return {
    source: row.source,
    sourceRef: row.sourceRef,
    verified: row.verified,
    qualityStatus: row.qualityStatus,
    qualityScore: row.qualityScore,
    verifiedAt: row.verifiedAt,
    rejectedAt: row.rejectedAt,
    verificationMethod: row.verificationMethod,
    verificationVersion: row.verificationVersion,
    rejectReason: row.rejectReason,
  };
}

function serializeUpdateData(data) {
  return JSON.stringify(data, (_key, value) => (value instanceof Date ? { $date: value.toISOString() } : value));
}

function deserializeUpdateData(value) {
  return JSON.parse(value, (_key, entry) => (entry && typeof entry === "object" && Object.keys(entry).length === 1 && entry.$date ? new Date(entry.$date) : entry));
}

function addCount(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function fetchBankRows(db) {
  const rows = [];
  let cursor;
  while (true) {
    const page = await retryDatabase("fetch-bank-page", () =>
      db.bankQuestion.findMany({
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        select: SELECT,
      }),
    );
    if (!page.length) break;
    rows.push(...page);
    cursor = page.at(-1).id;
    if (rows.length % (PAGE_SIZE * 10) === 0) console.log(`fetched ${rows.length} bank rows...`);
  }
  return rows;
}

async function applyGroupedUpdates(db, changes) {
  const groups = new Map();
  for (const change of changes) {
    const key = serializeUpdateData(change.data);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(change.id);
  }

  let updated = 0;
  let groupNumber = 0;
  for (const [serialized, ids] of groups) {
    groupNumber += 1;
    const data = deserializeUpdateData(serialized);
    for (let offset = 0; offset < ids.length; offset += UPDATE_BATCH_SIZE) {
      const chunk = ids.slice(offset, offset + UPDATE_BATCH_SIZE);
      const result = await retryDatabase("update-bank-batch", () => db.bankQuestion.updateMany({ where: { id: { in: chunk } }, data }));
      updated += result.count;
    }
    if (groupNumber % 20 === 0) console.log(`applied ${groupNumber}/${groups.size} update groups (${updated} rows)...`);
  }
  return { updated, groups: groups.size };
}

async function restoreBackup(db, backupPath) {
  const records = loadJsonLines(await readFile(backupPath, "utf8"));
  const changes = records.map((record) => ({
    id: record.id,
    data: {
      ...record.before,
      verifiedAt: record.before.verifiedAt ? new Date(record.before.verifiedAt) : null,
      rejectedAt: record.before.rejectedAt ? new Date(record.before.rejectedAt) : null,
    },
  }));
  const applied = await applyGroupedUpdates(db, changes);
  console.log(JSON.stringify({ restoredFrom: backupPath, records: records.length, ...applied }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    if (args.restore) {
      await restoreBackup(db, path.resolve(String(args.restore)));
      return;
    }

    const manifestPath = path.resolve(String(args.manifest || "data/bank-import/reports/bank-source-manifest-latest.jsonl"));
    const outputDir = path.resolve(String(args.out || "data/bank-import/reconciliation"));
    await mkdir(outputDir, { recursive: true });
    const manifest = mergeManifestRows(loadJsonLines(await readFile(manifestPath, "utf8")));
    console.log(`loaded ${manifest.size} database content hashes from the source manifest`);

    const auditAt = new Date();
    const rows = await fetchBankRows(db);
    const changes = [];
    const counts = { databaseRows: rows.length, manifestHashes: manifest.size, matchedRows: 0, unmatchedRows: 0, changedRows: 0, unchangedRows: 0, unsupportedPyqRows: 0, strictEligibleRows: 0 };
    const beforeStatus = {};
    const afterStatus = {};
    const reasonCounts = {};
    const sampleChanges = [];

    for (const row of rows) {
      const sourceEntry = manifest.get(row.contentHash);
      const proposed = proposedState(row, sourceEntry, auditAt);
      if (sourceEntry) counts.matchedRows += 1;
      else counts.unmatchedRows += 1;
      if (proposed.unsupportedPyq) counts.unsupportedPyqRows += 1;
      if (proposed.strictEligible) counts.strictEligibleRows += 1;
      addCount(beforeStatus, row.qualityStatus);
      addCount(afterStatus, proposed.data.qualityStatus);
      for (const reason of proposed.reasons) addCount(reasonCounts, reason);
      if (rowNeedsChange(row, proposed.data)) {
        counts.changedRows += 1;
        changes.push({ id: row.id, contentHash: row.contentHash, before: backupFields(row), data: changedFields(row, proposed.data) });
        if (sampleChanges.length < 30) {
          sampleChanges.push({
            id: row.id,
            contentHash: row.contentHash,
            subject: row.subject,
            chapter: row.chapter,
            questionPreview: normalizeText(row.question).slice(0, 180),
            manifestProvenance: sourceEntry?.provenance ?? null,
            reasons: [...proposed.reasons].sort(),
            before: backupFields(row),
            after: proposed.data,
          });
        }
      } else counts.unchangedRows += 1;
    }

    const timestamp = auditAt.toISOString().replace(/[:.]/g, "-");
    const planPath = path.join(outputDir, `bank-reconciliation-plan-${timestamp}.json`);
    const backupPath = path.join(outputDir, `bank-reconciliation-backup-${timestamp}.jsonl`);
    const plan = {
      generatedAt: auditAt.toISOString(),
      mode: args.apply ? "APPLY" : "DRY_RUN",
      manifestPath,
      counts,
      beforeStatus: sortedRecord(beforeStatus),
      afterStatus: sortedRecord(afterStatus),
      reasons: sortedRecord(reasonCounts),
      sampleChanges,
      backupPath: args.apply ? backupPath : null,
      policy: {
        noDeletes: true,
        generatedCorpusRelabeledAsAiOriginal: true,
        unprovenPyqExcludedFromStrict: true,
        legacyDoubleBlindExcludedFromStrictV2: true,
        missingVisualAssetsExcludedFromStrict: true,
        nonNumericalStrictRowsRequireFourOptionRationales: true,
      },
    };
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    let applied = null;
    if (args.apply) {
      const backupPayload = `${changes.map((change) => JSON.stringify({ id: change.id, contentHash: change.contentHash, before: change.before })).join("\n")}\n`;
      await writeFile(backupPath, backupPayload, "utf8");
      const backupSha256 = createHash("sha256").update(backupPayload).digest("hex");
      applied = { ...(await applyGroupedUpdates(db, changes)), backupSha256 };
      await writeFile(planPath, `${JSON.stringify({ ...plan, applied }, null, 2)}\n`, "utf8");
    }

    console.log(JSON.stringify({ planPath, backupPath: args.apply ? backupPath : null, counts, beforeStatus: plan.beforeStatus, afterStatus: plan.afterStatus, topReasons: Object.fromEntries(Object.entries(plan.reasons).slice(0, 20)), applied }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
