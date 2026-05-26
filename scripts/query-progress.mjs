import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const progress = await db.pyqYearProgress.findMany();
  console.log("Current PYQ Year Progress:", JSON.stringify(progress, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
