import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_BATCH = "structurally-admissible-unverified.jsonl";
const TARGET_LOWER_BOUND = 0.98;
const Z_ONE_SIDED_99 = 2.326347874;

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

function wilsonLowerBound(successes, total) {
  if (!total) return 0;
  const p = successes / total;
  const z2 = Z_ONE_SIDED_99 ** 2;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const spread = Z_ONE_SIDED_99 * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - spread) / denominator);
}

function hasIndependentAcademicEvidence(row) {
  const runs = Array.isArray(row.verifierRuns) ? row.verifierRuns : [];
  const method = String(row.verificationMethod || "").toUpperCase();
  const academicRuns = runs.filter((run) => {
    if (!run || typeof run !== "object") return false;
    const descriptor = `${run.verifier ?? ""} ${run.method ?? ""} ${run.version ?? ""}`.toUpperCase();
    return /ACADEMIC|INDEPENDENT|BLIND|CODEX/.test(descriptor) && run.passed !== false;
  });
  return row.verified === true
    && row.qualityStatus === "VERIFIED_STRICT"
    && /ACADEMIC|INDEPENDENT|BLIND|ADJUDICATION|DERIVATION/.test(method)
    && academicRuns.length >= 1;
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const importBatch = String(args.batch || DEFAULT_BATCH);
  const outputPath = path.resolve(String(args.out || "data/bank-import/new-json-intake/academic-readiness.json"));
  const rows = await prisma.bankQuestion.findMany({
    where: { importBatch },
    select: {
      id: true,
      subject: true,
      chapter: true,
      source: true,
      verified: true,
      qualityStatus: true,
      verificationMethod: true,
      verifierRuns: true,
      rejectReason: true,
      visualAssetUrl: true,
      isDiagramBased: true,
      isGraphBased: true,
    },
  });

  const byChapter = {};
  let accepted = 0;
  let rejected = 0;
  let academicallyAdjudicated = 0;
  let missingRequiredVisual = 0;
  for (const row of rows) {
    increment(byChapter, `${row.subject} | ${row.chapter}`);
    if ((row.isDiagramBased || row.isGraphBased) && !row.visualAssetUrl) missingRequiredVisual += 1;
    if (hasIndependentAcademicEvidence(row)) {
      academicallyAdjudicated += 1;
      accepted += 1;
    } else if (row.qualityStatus === "REJECTED" && row.rejectReason) {
      academicallyAdjudicated += 1;
      rejected += 1;
    }
  }

  const accuracyLowerBound99 = wilsonLowerBound(accepted, academicallyAdjudicated);
  const coverage = rows.length ? academicallyAdjudicated / rows.length : 0;
  const blockers = [];
  if (!rows.length) blockers.push("IMPORT_BATCH_NOT_FOUND");
  if (coverage < 1) blockers.push("EVERY_QUESTION_REQUIRES_ACADEMIC_ADJUDICATION");
  if (missingRequiredVisual) blockers.push("REQUIRED_VISUAL_ASSET_MISSING");
  if (accuracyLowerBound99 < TARGET_LOWER_BOUND) blockers.push("ACCURACY_LOWER_BOUND_BELOW_98_PERCENT");
  const eligibleForTest = blockers.length === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    importBatch,
    policy: {
      pyqEligibility: false,
      normalTestEligibilityRequires: "VERIFIED_STRICT plus independent academic evidence",
      confidenceRule: "one-sided 99% Wilson lower bound >= 0.98",
      provenancePreserved: true,
    },
    inventory: {
      total: rows.length,
      academicallyAdjudicated,
      accepted,
      rejected,
      pending: rows.length - academicallyAdjudicated,
      missingRequiredVisual,
      adjudicationCoverage: coverage,
      observedPassRate: academicallyAdjudicated ? accepted / academicallyAdjudicated : null,
      accuracyLowerBound99,
    },
    eligibleForTest,
    blockers,
    byChapter: Object.fromEntries(Object.entries(byChapter).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    note: eligibleForTest
      ? "The cohort meets the configured evidence threshold. Individual rows remain subject to the strict serveability checks."
      : "Structural cleanliness is not academic correctness. No pending row is promoted or served by this audit.",
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!eligibleForTest) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
