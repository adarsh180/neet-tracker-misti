import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IMPORT_BATCH = "structurally-admissible-unverified.jsonl";
const UNSUPPORTED_METHOD = "CODEX_FAMILY_DERIVATION";

function parseArgs(argv) {
  return { apply: argv.includes("--apply") };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const rows = await prisma.bankQuestion.findMany({
    where: {
      importBatch: IMPORT_BATCH,
      verificationMethod: UNSUPPORTED_METHOD,
    },
    select: {
      id: true,
      contentHash: true,
      subject: true,
      chapter: true,
      topic: true,
      verified: true,
      qualityStatus: true,
      qualityScore: true,
      verifiedAt: true,
      verifierModel: true,
      verifierRuns: true,
      verificationMethod: true,
      verificationVersion: true,
      timesServed: true,
      timesCorrect: true,
      timesWrong: true,
      lastServedAt: true,
    },
  });

  const generatedAt = new Date();
  const outputDir = path.resolve("data/bank-import/new-json-intake/integrity-remediation");
  await mkdir(outputDir, { recursive: true });
  const stamp = generatedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const evidencePath = path.join(outputDir, `family-verification-v1-${stamp}.json`);

  const report = {
    generatedAt: generatedAt.toISOString(),
    applied: apply,
    importBatch: IMPORT_BATCH,
    unsupportedMethod: UNSUPPORTED_METHOD,
    affected: rows.length,
    previouslyServedRows: rows.filter((row) => row.timesServed > 0).length,
    totalServeCount: rows.reduce((sum, row) => sum + row.timesServed, 0),
    action: apply
      ? "Retained every row and usage counter; removed test eligibility pending independent per-question academic adjudication."
      : "Dry run only; pass --apply to remove unsupported test eligibility.",
    previousState: rows,
  };
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (apply && rows.length) {
    const remediationRun = [{
      verifier: "CODEX_INTEGRITY_REMEDIATION",
      version: "family-verification-remediation-v1",
      method: "EVIDENCE_AUDIT",
      passed: false,
      reviewedAt: generatedAt.toISOString(),
      note: "Previous family-level structural admission did not independently solve this individual question. The row is preserved but cannot be served until per-question academic adjudication passes.",
    }];
    for (let offset = 0; offset < rows.length; offset += 500) {
      await prisma.bankQuestion.updateMany({
        where: { id: { in: rows.slice(offset, offset + 500).map((row) => row.id) } },
        data: {
          verified: false,
          qualityStatus: "NEEDS_REVIEW",
          qualityScore: null,
          verifiedAt: null,
          verifierModel: null,
          verifierRuns: remediationRun,
          verificationMethod: "INSUFFICIENT_ACADEMIC_EVIDENCE",
          verificationVersion: "family-verification-remediation-v1",
          rejectReason: "Preserved for repair: independent per-question answer and solution verification is still required.",
        },
      });
    }
  }

  console.log(JSON.stringify({ ...report, previousState: undefined, evidencePath }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
