import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const outDir = path.resolve("data/bank-import/reports");
await mkdir(outDir, { recursive: true });

const rows = await prisma.bankQuestion.findMany({
  where: { qualityStatus: "NEEDS_VISUAL_ASSET" },
  orderBy: [{ subject: "asc" }, { chapter: "asc" }, { createdAt: "asc" }],
  select: {
    id: true,
    subject: true,
    classLevel: true,
    chapter: true,
    topic: true,
    question: true,
    optionsJson: true,
    correctIndex: true,
    explanation: true,
  },
});

const queue = rows.map((row) => ({
  ...row,
  options: Array.isArray(row.optionsJson) ? row.optionsJson : [],
  optionsJson: undefined,
  requiredAction:
    "Create a real image/SVG/PNG for the described diagram or graph, rewrite the question to reference the image, then re-run strict visual verification.",
}));

const outPath = path.join(outDir, "visual-question-conversion-queue.json");
await writeFile(outPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");

console.log(`Exported ${queue.length} visual questions needing real assets to ${outPath}`);

await prisma.$disconnect();
