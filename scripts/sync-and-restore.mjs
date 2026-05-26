import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import fs from "node:fs";

const db = new PrismaClient();

async function main() {
  console.log("Step 1: Backing up PYQ progress...");
  let backup = [];
  try {
    backup = await db.pyqYearProgress.findMany();
    console.log(`Found ${backup.length} progress row(s).`);
    fs.writeFileSync("scripts/backup-progress.json", JSON.stringify(backup, null, 2), "utf8");
    console.log("Backup saved to scripts/backup-progress.json.");
  } catch (err) {
    console.warn("Could not query progress table, maybe it does not exist yet:", err.message);
  }

  console.log("\nStep 2: Pushing database schema via prisma db push...");
  try {
    // Run prisma db push --accept-data-loss
    const output = execSync("npx prisma db push --accept-data-loss", { encoding: "utf8" });
    console.log(output);
  } catch (err) {
    console.error("Prisma db push failed:", err.message);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }

  if (backup.length > 0) {
    console.log("\nStep 3: Restoring progress row(s)...");
    const clientForRestore = new PrismaClient();
    try {
      for (const row of backup) {
        await clientForRestore.pyqYearProgress.upsert({
          where: {
            userId_exam_year: {
              userId: row.userId,
              exam: row.exam,
              year: row.year
            }
          },
          create: {
            id: row.id,
            userId: row.userId,
            exam: row.exam,
            year: row.year,
            completed: row.completed,
            revisionCount: row.revisionCount,
            completedAt: row.completedAt ? new Date(row.completedAt) : null,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt)
          },
          update: {
            completed: row.completed,
            revisionCount: row.revisionCount,
            completedAt: row.completedAt ? new Date(row.completedAt) : null
          }
        });
      }
      console.log(`Successfully restored ${backup.length} progress row(s).`);
    } catch (err) {
      console.error("Failed to restore progress:", err);
    } finally {
      await clientForRestore.$disconnect();
    }
  } else {
    console.log("\nNo progress rows to restore.");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
