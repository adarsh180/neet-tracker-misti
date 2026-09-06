import { PrismaClient } from "@prisma/client";
import { databaseConnectionUrl } from "./database-connection";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: databaseConnectionUrl(process.env.DATABASE_URL),
      },
    },
  });

// Route bundles in the same production process should reuse one pool too.
// Separate serverless instances still get their own bounded pool.
globalForPrisma.prisma = db;
