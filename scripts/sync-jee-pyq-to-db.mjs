import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const db = new PrismaClient();
const sourceRoot = path.resolve("D:\\NEET\\PYQ\\JEE");
const catalogPath = path.resolve("src/data/pyq/jee-catalog.json");
const tempOptPath = "C:\\Users\\Adarsh\\.gemini\\antigravity\\scratch\\temp_opt.pdf";

const pythonPath = fs.existsSync("C:\\Users\\Adarsh\\AppData\\Local\\Programs\\Python\\Python312\\python.exe")
  ? "C:\\Users\\Adarsh\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
  : "python";

async function main() {
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalog not found at ${catalogPath}`);
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  console.log(`Loaded catalog: ${catalog.exam} (${catalog.firstYear}-${catalog.lastYear}) with ${catalog.totalPapers} papers.`);

  let totalOrigBytes = 0;
  let totalOptBytes = 0;
  let totalCompBytes = 0;
  let successCount = 0;

  // Flatten papers list
  const papers = catalog.years.flatMap((yearFolder) => 
    yearFolder.papers.map((paper) => ({
      ...paper,
      year: yearFolder.year
    }))
  );

  console.log(`Starting compression and sync of ${papers.length} papers to TiDB MySQL...`);

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    const sourceFilePath = path.join(sourceRoot, paper.year, paper.fileName);
    const progressLabel = `[${i + 1}/${papers.length}]`;

    if (!fs.existsSync(sourceFilePath)) {
      console.warn(`${progressLabel} WARNING: Local PDF not found at ${sourceFilePath}. Skipping.`);
      continue;
    }

    const origBytes = fs.readFileSync(sourceFilePath);
    const origSize = origBytes.length;
    totalOrigBytes += origSize;

    try {
      // Run Python optimizer helper with unbuffered output
      execFileSync(pythonPath, ["-u", path.resolve("scripts/compress_pdf_helper.py"), sourceFilePath, tempOptPath]);

      if (!fs.existsSync(tempOptPath)) {
        throw new Error("Optimizer output temp file missing.");
      }

      const optBytes = fs.readFileSync(tempOptPath);
      const optSize = optBytes.length;
      totalOptBytes += optSize;

      // Compress with zlib level 9
      const compBytes = zlib.deflateSync(optBytes, { level: 9 });
      const compSize = compBytes.length;
      totalCompBytes += compSize;

      // Upsert into cloud database
      await db.pyqDocument.upsert({
        where: { pathname: paper.pathname },
        create: {
          pathname: paper.pathname,
          fileData: compBytes,
        },
        update: {
          fileData: compBytes,
        },
      });

      successCount += 1;
      const ratio = (compSize / origSize) * 100;
      console.log(
        `${progressLabel} Synced: "${paper.title}"\n` +
        `   Original: ${(origSize / (1024 * 1024)).toFixed(2)} MB | ` +
        `Optimized: ${(optSize / (1024 * 1024)).toFixed(2)} MB | ` +
        `Compressed: ${(compSize / 1024).toFixed(1)} KB (${ratio.toFixed(1)}%)`
      );

      // Clean up temp file
      if (fs.existsSync(tempOptPath)) {
        fs.unlinkSync(tempOptPath);
      }
    } catch (err) {
      console.error(`${progressLabel} ERROR syncing "${paper.title}":`, err.message);
      if (err.stdout) {
        console.error(`   Python stdout:`, err.stdout.toString());
      }
      if (err.stderr) {
        console.error(`   Python stderr:`, err.stderr.toString());
      }
    }
  }

  console.log("\n================ SYNC COMPLETE ================");
  console.log(`Successfully optimized and uploaded ${successCount} / ${papers.length} papers.`);
  console.log(`Total Original Size: ${(totalOrigBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Optimized Size: ${(totalOptBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Database Storage (Compressed): ${(totalCompBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Net Compression Ratio: ${((totalCompBytes / totalOrigBytes) * 100).toFixed(1)}%`);
  console.log(`Total Space Saved: ${((totalOrigBytes - totalCompBytes) / (1024 * 1024)).toFixed(2)} MB`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => {
    if (fs.existsSync(tempOptPath)) {
      try {
        fs.unlinkSync(tempOptPath);
      } catch {}
    }
    db.$disconnect();
  });
