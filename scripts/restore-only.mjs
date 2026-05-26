import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const db = new PrismaClient();

async function main() {
  if (!fs.existsSync("scripts/backup-progress.json")) {
    console.log("No backup file found, skipping restore.");
    return;
  }

  const backup = JSON.parse(fs.readFileSync("scripts/backup-progress.json", "utf8"));
  console.log(`Found ${backup.length} progress row(s) to restore.`);

  for (const row of backup) {
    await db.pyqYearProgress.upsert({
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
  console.log("Successfully restored backed-up progress rows.");
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
