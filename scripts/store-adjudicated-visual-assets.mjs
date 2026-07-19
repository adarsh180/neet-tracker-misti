import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROOT = process.cwd();
const inputPath = path.resolve(process.argv[2] ?? "data/pdf-admission-audit/adjudicated-zoology-animal-kingdom-visual-v1.valid.jsonl");

function rowsFromJsonl(text) {
  return text.split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

async function main() {
  const rows = rowsFromJsonl(await fs.readFile(inputPath, "utf8"));
  const report = { input: rows.length, stored: 0, linked: 0, skipped: 0, missingQuestions: [] };
  for (const row of rows) {
    const url = String(row.visualAssetUrl ?? "");
    if (!url.startsWith("/bank-visuals/")) {
      report.skipped += 1;
      continue;
    }
    const filePath = path.join(ROOT, "public", url.slice(1));
    const fileData = await fs.readFile(filePath);
    const assetHash = createHash("sha256").update(fileData).digest("hex");
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === ".webp" ? "image/webp" : extension === ".png" ? "image/png" : "application/octet-stream";
    const asset = await prisma.questionVisualAsset.upsert({
      where: { contentHash: assetHash },
      create: {
        contentHash: assetHash,
        mimeType,
        kind: String(row.visualAssetKind ?? "DIAGRAM"),
        altText: String(row.visualAssetAlt ?? "Question diagram"),
        byteSize: fileData.byteLength,
        fileData,
      },
      update: {
        mimeType,
        kind: String(row.visualAssetKind ?? "DIAGRAM"),
        altText: String(row.visualAssetAlt ?? "Question diagram"),
        byteSize: fileData.byteLength,
        fileData,
      },
    });
    report.stored += 1;
    const updated = await prisma.bankQuestion.updateMany({
      where: { contentHash: row.contentHash },
      data: {
        visualAssetId: asset.id,
        visualAssetUrl: `/api/practice/visual/${asset.id}`,
        visualAssetAlt: String(row.visualAssetAlt ?? asset.altText),
        visualAssetKind: String(row.visualAssetKind ?? asset.kind),
      },
    });
    if (updated.count) report.linked += updated.count;
    else report.missingQuestions.push(row.contentHash);
  }
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
