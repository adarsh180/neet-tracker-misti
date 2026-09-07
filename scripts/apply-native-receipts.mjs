// Apply only this reviewed additive table, not unrelated historical migrations.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
try {
  const rows = await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'native_mutations'`;
  if (!rows.length && process.argv.includes("--apply")) {
    const sql = await readFile(new URL("../prisma/migrations/20260907180000_native_mutation_receipts/migration.sql", import.meta.url), "utf8");
    if (!/^--[^\n]+\nCREATE TABLE `native_mutations` \(/.test(sql) || /\b(DROP|ALTER|DELETE|TRUNCATE)\b/i.test(sql)) throw new Error("Migration failed the additive-only check.");
    await db.$executeRawUnsafe(sql);
    console.log("Created native_mutations receipt table; existing academic records unchanged.");
  } else console.log(rows.length ? "Receipt table already exists; not modified." : "Receipt table missing. Run with --apply after reviewing the migration.");
  if (rows.length || process.argv.includes("--apply")) {
    const columns = await db.$queryRaw`SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'native_mutations'`;
    const expected = { id: "varchar", userId: "varchar", payloadHash: "varchar", resultJson: "json", createdAt: "datetime" };
    if (columns.length !== 5 || columns.some(row => expected[row.COLUMN_NAME] !== row.DATA_TYPE)) throw new Error("Receipt table schema mismatch; no destructive repair attempted.");
    console.log("Receipt schema verified.");
  }
} finally { await db.$disconnect(); }
