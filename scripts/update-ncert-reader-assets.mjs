import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const reportPath = path.resolve(process.argv[2] ?? "tmp/pdfs/ncert-official/named-assets.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const result = { considered: report.assets.length, updated: 0, skipped: 0 };

try {
  let cursor = 0;
  async function uploadNext() {
    while (cursor < report.assets.length) {
      const asset = report.assets[cursor];
      cursor += 1;
    const document = await db.ncertDocument.findFirst({
      where: { sourceSha256: asset.sourceSha256, reviewStatus: "VERIFIED_SOURCE" },
      select: { id: true, title: true, storagePath: true },
    });
    if (!document || document.title !== asset.title) {
      result.skipped += 1;
      continue;
    }
    const derivedStoragePath = path.relative(process.cwd(), asset.derivedPath).split(path.sep).join("/");
    if (document.storagePath === derivedStoragePath) {
      result.updated += 1;
      continue;
    }
    if (asset.bytes > 5_700_000) {
      console.log(`Proxy fallback for oversized chapter: ${asset.title}`);
      result.skipped += 1;
      continue;
    }
    const bytes = await readFile(asset.derivedPath);
    try {
      await db.ncertDocument.update({
        where: { id: document.id },
        data: { fileData: bytes, storagePath: derivedStoragePath },
      });
      result.updated += 1;
      console.log(`Uploaded ${result.updated}/${report.assets.length}: ${asset.title}`);
    } catch (error) {
      result.skipped += 1;
      console.warn(`Proxy fallback for ${asset.title}: ${error instanceof Error ? error.message.split("\n").at(-1) : error}`);
    }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => uploadNext()));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.$disconnect();
}
