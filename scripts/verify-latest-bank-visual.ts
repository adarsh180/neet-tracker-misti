import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../src/lib/db";

async function main() {
  const asset = await db.questionVisualAsset.findFirst({ orderBy: { createdAt: "desc" } });
  if (!asset) throw new Error("No generated visual asset exists");
  const outputDir = path.resolve("tmp", "visuals");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${asset.id}.svg`);
  await writeFile(outputPath, asset.fileData);
  console.log(outputPath);
}

main().finally(() => db.$disconnect());
