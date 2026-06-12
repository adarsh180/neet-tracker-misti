import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.bankQuestion.groupBy({
  by: ["subject", "qualityStatus"],
  _count: { _all: true },
});

const total = await prisma.bankQuestion.count();
const verified = await prisma.bankQuestion.count({ where: { qualityStatus: "VERIFIED_STRICT" } });
const basicVerified = await prisma.bankQuestion.count({ where: { verified: true } });

console.log(`Total bank rows: ${total}`);
console.log(`Strict verified: ${verified}`);
console.log(`Verified boolean true: ${basicVerified}`);
console.log("");
console.log("Subject\tUNVERIFIED\tVERIFIED_STRICT\tNEEDS_REVIEW\tREJECTED");

for (const subject of ["Physics", "Chemistry", "Botany", "Zoology"]) {
  const values = Object.fromEntries(
    rows
      .filter((row) => row.subject === subject)
      .map((row) => [row.qualityStatus, row._count._all]),
  );
  console.log(
    `${subject}\t${values.UNVERIFIED ?? 0}\t${values.VERIFIED_STRICT ?? 0}\t${values.NEEDS_REVIEW ?? 0}\t${values.REJECTED ?? 0}`,
  );
}

await prisma.$disconnect();
