import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const result = await db.$queryRaw`SHOW TABLES;`;
  console.log("Tables in database:", JSON.stringify(result, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
