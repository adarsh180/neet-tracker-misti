import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Bank-ready rows come straight from the solved PhysicsWallah packs with a real
// answer key and a real "Text Solution" explanation. We promote them to
// VERIFIED_STRICT deterministically (no AI) after re-checking structure quality.
const SOURCE_BATCHES = ["zoology-pdf-bank-ready.json"];
const BAD_EXPLANATION_RE = /\b(?:physics|chemistry|botany|master ncert|pw books app)\b/i;
const BAD_STEM_RE = /\b(?:video solution|text solution)\b/i;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function optionsOf(row) {
  return Array.isArray(row.optionsJson) ? row.optionsJson.map(clean) : [];
}

function residualExplanation(row) {
  let explanation = clean(row.explanation);
  const question = clean(row.question);
  if (question && explanation.toLowerCase().startsWith(question.slice(0, Math.min(80, question.length)).toLowerCase())) {
    explanation = explanation.slice(question.length).trim();
  }
  for (const option of optionsOf(row)) {
    if (option) explanation = explanation.replace(option, " ");
  }
  return clean(explanation.replace(/\(?\s*[1-4A-Da-d]\s*\)?/g, " "));
}

function eligible(row) {
  const options = optionsOf(row);
  const explanation = clean(row.explanation);
  const question = clean(row.question);
  const residual = residualExplanation(row);
  const visual = Boolean(row.isDiagramBased || row.isGraphBased || row.visualAssetKind);
  const reasons = [];

  if (row.subject !== "Zoology") reasons.push("not zoology");
  if (!SOURCE_BATCHES.includes(row.importBatch ?? "")) reasons.push("not zoology staged batch");
  if (row.qualityStatus !== "UNVERIFIED" && row.qualityStatus !== "NEEDS_REVIEW") reasons.push("already adjudicated");
  if (visual && !row.visualAssetUrl) reasons.push("visual row without image");
  if (BAD_STEM_RE.test(question)) reasons.push("stem contains solution label");
  if (BAD_EXPLANATION_RE.test(explanation)) reasons.push("explanation contains cross-subject/watermark leakage");
  if (question.length < 25) reasons.push("short question");
  if (options.length !== 4 || options.some((option) => option.length < 1 || option.length > 400)) reasons.push("bad options");
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) reasons.push("duplicate options");
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) reasons.push("bad key");
  if (explanation.length < 40) reasons.push("short explanation");
  if (residual.length < 25) reasons.push("non-substantive explanation");

  return { ok: reasons.length === 0, reasons };
}

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const limit = Number(args.limit ?? 0);
const take = Math.max(1, Number(args.take ?? 5000));

try {
  const rows = await prisma.bankQuestion.findMany({
    where: {
      subject: "Zoology",
      importBatch: { in: SOURCE_BATCHES },
      qualityStatus: { in: ["UNVERIFIED", "NEEDS_REVIEW"] },
    },
    select: {
      id: true, subject: true, chapter: true, importBatch: true, sourceRef: true,
      question: true, optionsJson: true, correctIndex: true, explanation: true,
      qualityStatus: true, isDiagramBased: true, isGraphBased: true,
      visualAssetKind: true, visualAssetUrl: true,
    },
    orderBy: [{ createdAt: "asc" }],
    take,
  });

  const eligibleRows = [];
  const rejectedReasons = new Map();
  for (const row of rows) {
    const verdict = eligible(row);
    if (verdict.ok) eligibleRows.push(row);
    else for (const reason of verdict.reasons) rejectedReasons.set(reason, (rejectedReasons.get(reason) ?? 0) + 1);
  }

  const selected = limit ? eligibleRows.slice(0, limit) : eligibleRows;
  if (apply) {
    for (const row of selected) {
      await prisma.bankQuestion.update({
        where: { id: row.id },
        data: {
          verified: true,
          qualityStatus: "VERIFIED_STRICT",
          qualityScore: 0.93,
          verifiedAt: new Date(),
          verifierModel: "zoology-source-promote-v1",
          rejectReason: null,
        },
      });
    }
  }

  console.log(JSON.stringify({
    apply,
    scanned: rows.length,
    eligible: eligibleRows.length,
    selected: selected.length,
    promoted: apply ? selected.length : 0,
    withVisual: selected.filter((r) => r.visualAssetUrl).length,
    rejectedReasons: Object.fromEntries([...rejectedReasons.entries()].sort((a, b) => b[1] - a[1])),
    examples: selected.slice(0, 8).map((row) => ({
      chapter: row.chapter,
      sourceRef: row.sourceRef,
      question: clean(row.question).slice(0, 120),
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
