import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IMPORT_BATCH = "structurally-admissible-unverified.jsonl";
const FAMILY_POLICY = [
  { subject: "Physics", chapter: "Kinematics", excludedTopics: [] },
  {
    subject: "Physics",
    chapter: "1D",
    excludedTopics: [
      "Distance in the nth second",
      "Time from an acceleration function",
    ],
  },
  { subject: "Physics", chapter: "Dual Nature of Matter and Radiation", excludedTopics: [] },
  { subject: "Chemistry", chapter: "Chemical Kinetics", excludedTopics: [] },
];

const MOJIBAKE = /\ufffd|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?/;

function parseArgs(argv) {
  if (argv.includes("--apply")) {
    throw new Error(
      "Family-level structural checks cannot promote questions to VERIFIED_STRICT. " +
      "Use an independent per-question academic adjudication manifest instead.",
    );
  }
  return { apply: false };
}

function normalized(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

function structuralFailure(row) {
  const options = Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [];
  const rationales = Array.isArray(row.optionExplanationsJson) ? row.optionExplanationsJson.map(String) : [];
  const combined = [row.question, ...options, row.explanation, ...rationales].join(" ");
  if (row.source !== "AI") return "WRONG_PROVENANCE";
  if (options.length !== 4 || new Set(options.map(normalized)).size !== 4) return "INVALID_OPTIONS";
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) return "INVALID_KEY";
  if (row.question.trim().length < 20 || row.explanation.trim().length < 25) return "THIN_CONTENT";
  if (rationales.length !== 4 || rationales.some((entry) => entry.trim().length < 20)) return "INCOMPLETE_RATIONALES";
  if (MOJIBAKE.test(combined)) return "MOJIBAKE";
  if ((row.isDiagramBased || row.isGraphBased || row.visualAssetKind) && !row.visualAssetUrl) return "MISSING_VISUAL";
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const decisions = [];
  for (const family of FAMILY_POLICY) {
    const rows = await prisma.bankQuestion.findMany({
      where: {
        importBatch: IMPORT_BATCH,
        source: "AI",
        subject: family.subject,
        chapter: family.chapter,
        verified: false,
        qualityStatus: "UNVERIFIED",
      },
    });
    for (const row of rows) {
      const excluded = family.excludedTopics.includes(row.topic ?? "");
      const failure = excluded ? "FAMILY_REQUIRES_TEXT_OR_DERIVATION_REPAIR" : structuralFailure(row);
      decisions.push({ id: row.id, subject: row.subject, chapter: row.chapter, topic: row.topic, promote: !failure, reason: failure });
    }
  }

  const promoted = decisions.filter((decision) => decision.promote);
  const held = decisions.filter((decision) => !decision.promote);
  const generatedAt = new Date();
  const counts = {};
  for (const row of promoted) counts[`${row.subject} | ${row.chapter}`] = (counts[`${row.subject} | ${row.chapter}`] ?? 0) + 1;
  const report = {
    generatedAt: generatedAt.toISOString(),
    applied: args.apply,
    importBatch: IMPORT_BATCH,
    promoted: promoted.length,
    held: held.length,
    promotedByChapter: counts,
    heldReasons: Object.fromEntries(Object.entries(held.reduce((result, row) => {
      result[row.reason] = (result[row.reason] ?? 0) + 1;
      return result;
    }, {})).sort((a, b) => b[1] - a[1])),
    policy: {
      eligibleForNormalTests: false,
      eligibleForPyq: false,
      provenancePreserved: "AI",
      note: "This report is triage only. Family membership and structural checks are not academic verification and never change database eligibility.",
    },
  };
  const output = path.resolve("data/bank-import/new-json-intake/self-adjudicated-safe-families.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
