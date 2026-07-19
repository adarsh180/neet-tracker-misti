import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.bankQuestion.groupBy({
  by: ["subject", "classLevel", "chapter"],
  where: { verified: true, qualityStatus: "VERIFIED_STRICT" },
  _count: { _all: true },
});

const report = {};
for (const subject of ["Physics", "Chemistry", "Botany", "Zoology"]) {
  report[subject] = rows
    .filter((row) => row.subject === subject)
    .map((row) => ({ classLevel: row.classLevel, chapter: row.chapter, count: row._count._all }))
    .sort((a, b) => a.count - b.count || a.chapter.localeCompare(b.chapter));
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  totals: Object.fromEntries(Object.entries(report).map(([subject, chapters]) => [subject, chapters.reduce((sum, row) => sum + row.count, 0)])),
  below50: Object.fromEntries(Object.entries(report).map(([subject, chapters]) => [subject, chapters.filter((row) => row.count < 50)])),
  chapters: report,
}, null, 2));

await prisma.$disconnect();
