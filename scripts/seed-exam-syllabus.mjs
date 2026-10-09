// Seeds the NEET PG / NEET SS syllabus into exam_nodes from scripts/exam-syllabus/nodes.json.
// Idempotent: inserts only keys that are not there yet, so your own edits,
// notes, removals and additions are never overwritten.
//   node scripts/seed-exam-syllabus.mjs            (insert missing nodes)
//   node scripts/seed-exam-syllabus.mjs --dry      (count only)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const { nodes } = JSON.parse(readFileSync(join(here, "exam-syllabus", "nodes.json"), "utf8"));
const dry = process.argv.includes("--dry");
const db = new PrismaClient();

const rows = nodes.map((n) => ({ exam: n.e, key: n.k, parentKey: n.p ?? null, level: n.l, name: n.n, detail: n.d ?? null, ord: n.o, meta: n.m ?? undefined, origin: "seed" }));
const counts = rows.reduce((a, r) => ((a[`${r.exam}:${r.level}`] = (a[`${r.exam}:${r.level}`] ?? 0) + 1), a), {});
console.log("seed nodes", rows.length, counts);
if (!dry) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 800) {
    const res = await db.examNode.createMany({ data: rows.slice(i, i + 800), skipDuplicates: true });
    inserted += res.count;
  }
  console.log("inserted", inserted, "already present", rows.length - inserted);
}
await db.$disconnect();
