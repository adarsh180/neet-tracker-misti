import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const outputPath = path.resolve(process.argv[2] ?? `assistant-state-backup-${Date.now()}.json`);
const db = new PrismaClient();

try {
  const [preferences, topics] = await Promise.all([
    db.$queryRawUnsafe("SELECT * FROM voice_assistant_preferences ORDER BY createdAt ASC"),
    db.$queryRawUnsafe("SELECT * FROM topics ORDER BY subjectId, classLevel, chapterOrder, topicOrder"),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    source: "pre-assistant-v2-migration",
    preferences,
    topics,
  };

  await writeFile(
    outputPath,
    `${JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ outputPath, preferences: preferences.length, topics: topics.length }));
} finally {
  await db.$disconnect();
}
