import { writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../src/lib/db";
import { isStrictlyServeableBankRow } from "../src/lib/question-bank";

type CountMap = Record<string, number>;

function increment(map: CountMap, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function main() {
  const take = 2_000;
  let cursor: string | undefined;
  let strict = 0;
  let serveable = 0;
  const bySubject: CountMap = {};
  const bySource: CountMap = {};
  const byClass: CountMap = {};
  const byChapter: CountMap = {};
  const rejectedBySubject: CountMap = {};

  while (true) {
    const rows = await db.bankQuestion.findMany({
      where: { verified: true, qualityStatus: "VERIFIED_STRICT" },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      strict += 1;
      if (!isStrictlyServeableBankRow(row)) {
        increment(rejectedBySubject, row.subject);
        continue;
      }
      serveable += 1;
      increment(bySubject, row.subject);
      increment(bySource, row.source);
      increment(byClass, `${row.subject} | Class ${row.classLevel ?? "unknown"}`);
      increment(byChapter, `${row.subject} | Class ${row.classLevel ?? "unknown"} | ${row.chapter}`);
    }
    cursor = rows.at(-1)?.id;
    if (rows.length < take) break;
  }

  const chapterEntries = Object.entries(byChapter).sort((a, b) => a[0].localeCompare(b[0]));
  const report = {
    generatedAt: new Date().toISOString(),
    strict,
    serveable,
    runtimeRejected: strict - serveable,
    bySubject,
    bySource,
    byClass,
    chapters: Object.fromEntries(chapterEntries),
    below50: Object.fromEntries(chapterEntries.filter(([, count]) => count < 50)),
    rejectedBySubject,
  };
  const output = path.resolve("data/bank-import/live-runtime-servable.json");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
