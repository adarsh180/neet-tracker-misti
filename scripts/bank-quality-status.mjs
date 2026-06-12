import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.bankQuestion.groupBy({
  by: ["subject", "qualityStatus"],
  _count: { _all: true },
});

const total = await prisma.bankQuestion.count();
const verified = await prisma.bankQuestion.count({ where: { qualityStatus: "VERIFIED_STRICT" } });
const basicVerified = await prisma.bankQuestion.count({ where: { verified: true } });
const statuses = ["UNVERIFIED", "VERIFIED_STRICT", "NEEDS_REVIEW", "NEEDS_VISUAL_ASSET", "REJECTED"];

console.log(`Total bank rows: ${total}`);
console.log(`Strict verified: ${verified}`);
console.log(`Verified boolean true: ${basicVerified}`);
console.log("");
console.log(`Subject\t${statuses.join("\t")}\tUSABLE`);

for (const subject of ["Physics", "Chemistry", "Botany", "Zoology"]) {
  const values = Object.fromEntries(
    rows
      .filter((row) => row.subject === subject)
      .map((row) => [row.qualityStatus, row._count._all]),
  );
  const usable = (values.UNVERIFIED ?? 0) + (values.VERIFIED_STRICT ?? 0) + (values.NEEDS_REVIEW ?? 0);
  console.log(`${subject}\t${statuses.map((status) => values[status] ?? 0).join("\t")}\t${usable}`);
}

await prisma.$disconnect();
