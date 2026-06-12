import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REPORT_DIR = path.join(process.cwd(), "data", "bank-import", "reports");
const EXCLUDED = ["REJECTED", "NEEDS_VISUAL_ASSET"];
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const SOURCE_REF_LEAK_SQL = "(Original question aligned|not a verbatim|copyright|prompt|instruction|verbatim copyrighted)";
const ARTIFACT_SQL = "(Table/matching item|Lengthy case|case [0-9]+-[0-9]+|item [0-9]+-[0-9]+|passage [0-9]+-[0-9]+)";
const BIO_KEYWORD_SQL = "(chromosome|gene|dna|rna|codon|population|species|enzyme|cell|organism|allele)";
const OPTION_PATTERNS = [
  /\b(?:correct\s+(?:answer|option)\s*(?:is|:)?|answer\s*(?:is|:)?|option\s*)\s*\(?([A-D])\)?\b/gi,
  /\b\(?([A-D])\)?\s*(?:is|seems|appears)\s+(?:the\s+)?correct\b/gi,
  /\b(?:hence|therefore|thus)\s*,?\s*(?:the\s+)?(?:correct\s+)?(?:answer\s+)?(?:is\s+)?(?:option\s*)?\(?([A-D])\)?\b/gi,
];

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

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? Number(inner) : inner)));
}

function normalizeStem(question) {
  return String(question ?? "")
    .toLowerCase()
    .replace(/\b(?:table\/matching item|lengthy case|case|item|passage)\s*\d+\s*-\s*\d+\b/g, " ")
    .replace(/(?:^|\s)(?:q|question)\s*\d+[\).:-]?\s*/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function inferAnswerIndex(explanation) {
  const found = new Set();
  for (const pattern of OPTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(explanation)) !== null) found.add(match[1].toUpperCase().charCodeAt(0) - 65);
  }
  return found.size === 1 ? [...found][0] : null;
}

function scoreRow(row) {
  let score = 0;
  if (row.qualityStatus === "VERIFIED_STRICT") score += 100;
  if (row.verified) score += 25;
  if (YEAR_RE.test(row.sourceRef ?? "")) score += 8;
  score += Math.min(20, String(row.explanation ?? "").trim().length / 20);
  score += row.timesCorrect ?? 0;
  score -= (row.timesWrong ?? 0) * 2;
  return score;
}

function sqlList(ids) {
  return ids.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
}

async function countStatuses() {
  return prisma.bankQuestion.groupBy({ by: ["qualityStatus"], _count: { _all: true } });
}

async function executeCount(sql) {
  const result = await prisma.$executeRawUnsafe(sql);
  return Number(result);
}

async function updateInChunks(ids, sqlForChunk, chunkSize = 750) {
  let updated = 0;
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    updated += await executeCount(sqlForChunk(chunk));
  }
  return updated;
}

async function keyCorrections() {
  const rows = await prisma.bankQuestion.findMany({
    where: {
      qualityStatus: { notIn: EXCLUDED },
      explanation: { contains: "correct" },
    },
    select: { id: true, correctIndex: true, explanation: true },
  });
  const groups = new Map();
  for (const row of rows) {
    const inferred = inferAnswerIndex(row.explanation);
    if (inferred === null || inferred === row.correctIndex) continue;
    const bucket = groups.get(inferred) ?? [];
    bucket.push(row.id);
    groups.set(inferred, bucket);
  }
  let updated = 0;
  for (const [index, ids] of groups.entries()) {
    updated += await updateInChunks(
      ids,
      (chunk) => `
        UPDATE bank_questions
        SET correctIndex=${Number(index)},
            verified=0,
            qualityStatus='NEEDS_REVIEW',
            rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'stored key corrected from explicit explanation option; pending blind verification')
        WHERE id IN (${sqlList(chunk)})
      `,
    );
  }
  return updated;
}

async function duplicateQuarantine({ maxRejectShare, minUsablePerChapter }) {
  const counts = await prisma.bankQuestion.groupBy({
    by: ["subject", "chapter"],
    where: { qualityStatus: { notIn: EXCLUDED } },
    _count: { _all: true },
  });
  const state = new Map(counts.map((row) => [`${row.subject}::${row.chapter}`, { total: row._count._all, rejected: 0 }]));
  const rows = await prisma.bankQuestion.findMany({
    where: { qualityStatus: { notIn: EXCLUDED } },
    select: {
      id: true,
      subject: true,
      chapter: true,
      question: true,
      sourceRef: true,
      explanation: true,
      qualityStatus: true,
      verified: true,
      timesCorrect: true,
      timesWrong: true,
    },
  });
  const groups = new Map();
  for (const row of rows) {
    const stem = normalizeStem(row.question);
    if (stem.length < 45) continue;
    const key = `${row.subject}::${row.chapter}::${stem}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const rejectIds = [];
  let candidates = 0;
  let safeguardSkipped = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => scoreRow(b) - scoreRow(a));
    for (const row of sorted.slice(1)) {
      candidates += 1;
      const key = `${row.subject}::${row.chapter}`;
      const entry = state.get(key) ?? { total: 0, rejected: 0 };
      const maxReject = Math.floor(entry.total * maxRejectShare);
      if (entry.total - entry.rejected - 1 < minUsablePerChapter || entry.rejected >= maxReject) {
        safeguardSkipped += 1;
        continue;
      }
      entry.rejected += 1;
      state.set(key, entry);
      rejectIds.push(row.id);
    }
  }

  const updated = await updateInChunks(
    rejectIds,
    (chunk) => `
      UPDATE bank_questions
      SET verified=0,
          qualityStatus='REJECTED',
          rejectedAt=NOW(),
          rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'near-duplicate stem; stronger sibling kept in serving pool')
      WHERE id IN (${sqlList(chunk)})
    `,
  );
  return { candidates, updated, safeguardSkipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !args.apply;
  const maxRejectShare = Math.max(0.05, Math.min(0.3, Number(args["max-reject-share"] ?? 0.3)));
  const minUsablePerChapter = Math.max(1, Number(args["min-usable-per-chapter"] ?? 120));
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const before = await countStatuses();
  if (dryRun) {
    console.log("Dry-run is not supported for fast apply. Re-run with --apply after reviewing scripts/bank-refine-sweep.mjs dry-run.");
    console.log(JSON.stringify({ before: jsonSafe(before), maxRejectShare, minUsablePerChapter }, null, 2));
    return;
  }

  const leakyRefs = await executeCount(`
    UPDATE bank_questions
    SET sourceRef=CASE
          WHEN source='NCERT' THEN 'NCERT-aligned original'
          WHEN source='AI' THEN 'Original'
          ELSE CONCAT(REPLACE(source, '_', ' '), '-style practice')
        END,
        verified=0,
        qualityStatus=IF(qualityStatus IN ('REJECTED','NEEDS_VISUAL_ASSET'), qualityStatus, 'NEEDS_REVIEW'),
        rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'stripped leaked prompt/copyright wording from sourceRef')
    WHERE sourceRef REGEXP '${SOURCE_REF_LEAK_SQL}'
  `);

  const neetRelabelled = await executeCount(`
    UPDATE bank_questions
    SET source='PLATFORM',
        sourceRef='NEET-style practice (year unverified)',
        verified=0,
        qualityStatus=IF(qualityStatus IN ('REJECTED','NEEDS_VISUAL_ASSET'), qualityStatus, 'NEEDS_REVIEW'),
        rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'relabelled NEET_PYQ without year as unverified practice source')
    WHERE source='NEET_PYQ' AND sourceRef NOT REGEXP '(19|20)[0-9]{2}'
  `);

  const jeeRelabelled = await executeCount(`
    UPDATE bank_questions
    SET source='PLATFORM',
        sourceRef='JEE Main-style practice (shift/year unverified)',
        verified=0,
        qualityStatus=IF(qualityStatus IN ('REJECTED','NEEDS_VISUAL_ASSET'), qualityStatus, 'NEEDS_REVIEW'),
        rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'relabelled JEE_PYQ without shift/year as unverified practice source')
    WHERE source='JEE_PYQ' AND sourceRef NOT REGEXP '(19|20)[0-9]{2}'
  `);

  const thinExplanations = await executeCount(`
    UPDATE bank_questions
    SET verified=0,
        qualityStatus='NEEDS_REVIEW',
        rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'thin explanation; needs AI repair')
    WHERE qualityStatus NOT IN ('REJECTED','NEEDS_VISUAL_ASSET')
      AND CHAR_LENGTH(TRIM(explanation)) < 30
  `);

  const artifactRejected = await executeCount(`
    UPDATE bank_questions
    SET verified=0,
        qualityStatus='REJECTED',
        rejectedAt=NOW(),
        rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'generator artifact in question stem')
    WHERE qualityStatus NOT IN ('REJECTED','NEEDS_VISUAL_ASSET')
      AND question REGEXP '${ARTIFACT_SQL}'
  `);

  const bioArithmeticRejected = await executeCount(`
    UPDATE bank_questions
    SET verified=0,
        qualityStatus='REJECTED',
        rejectedAt=NOW(),
        rejectReason=CONCAT_WS('; ', NULLIF(rejectReason, ''), 'biology row is trivial arithmetic, not NEET biology')
    WHERE qualityStatus NOT IN ('REJECTED','NEEDS_VISUAL_ASSET')
      AND subject IN ('Botany','Zoology')
      AND question REGEXP '^[^?]{0,160}[0-9]+[^?]*(how many|find|calculate|remaining|left)[^?]*\\\\??$'
      AND question NOT REGEXP '${BIO_KEYWORD_SQL}'
  `);

  const correctedKeys = await keyCorrections();
  const duplicates = await duplicateQuarantine({ maxRejectShare, minUsablePerChapter });
  const after = await countStatuses();
  const lowestUsableChapters = await prisma.bankQuestion.groupBy({
    by: ["subject", "chapter"],
    where: { qualityStatus: { notIn: EXCLUDED } },
    _count: { _all: true },
    orderBy: { _count: { id: "asc" } },
    take: 12,
  });
  const sourcePollutionRemaining = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(sourceRef REGEXP '${SOURCE_REF_LEAK_SQL}') AS leaky_refs,
      SUM(source='NEET_PYQ' AND sourceRef NOT REGEXP '(19|20)[0-9]{2}') AS neet_no_year,
      SUM(source='JEE_PYQ' AND sourceRef NOT REGEXP '(19|20)[0-9]{2}') AS jee_no_year,
      SUM(CHAR_LENGTH(TRIM(explanation)) < 30 AND qualityStatus NOT IN ('REJECTED','NEEDS_VISUAL_ASSET')) AS thin_served,
      SUM(question REGEXP '${ARTIFACT_SQL}' AND qualityStatus NOT IN ('REJECTED','NEEDS_VISUAL_ASSET')) AS artifact_served
    FROM bank_questions
  `);

  const report = {
    before: jsonSafe(before),
    leakyRefs,
    neetRelabelled,
    jeeRelabelled,
    thinExplanations,
    artifactRejected,
    bioArithmeticRejected,
    correctedKeys,
    duplicateCandidates: duplicates.candidates,
    duplicateRejected: duplicates.updated,
    duplicateSafeguardSkipped: duplicates.safeguardSkipped,
    after: jsonSafe(after),
    lowestUsableChapters: jsonSafe(lowestUsableChapters),
    sourcePollutionRemaining: jsonSafe(sourcePollutionRemaining[0]),
  };
  const reportPath = path.join(REPORT_DIR, `bank-refine-fast-apply-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
