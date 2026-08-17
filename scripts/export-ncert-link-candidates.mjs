import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const outputPath = path.resolve(process.argv[2] ?? "tmp/pdfs/ncert-official/link-candidates.json");

try {
  const rows = await db.questionIngestionCandidate.findMany({
    where: {
      subject: { in: ["Botany", "Zoology"] },
      extractionStatus: "EXTRACTED",
      verificationStatus: "OFFICIAL_KEY_VERIFIED",
      question: { not: null },
      explanation: { not: null },
      optionExplanationsJson: { not: { equals: null } },
    },
    select: {
      id: true,
      exam: true,
      examYear: true,
      paperCode: true,
      paperQuestionNumber: true,
      subject: true,
      question: true,
      optionsJson: true,
      correctIndicesJson: true,
      explanation: true,
      optionExplanationsJson: true,
      verificationJson: true,
      evidences: {
        select: {
          artifact: {
            select: {
              provider: true,
              artifactKind: true,
              sourcePageUrl: true,
              assetUrl: true,
              sha256: true,
            },
          },
        },
      },
    },
    orderBy: [{ examYear: "desc" }, { paperQuestionNumber: "asc" }],
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), candidates: rows }, null, 2));
  console.log(JSON.stringify({ output: outputPath, candidates: rows.length }, null, 2));
} finally {
  await db.$disconnect();
}
