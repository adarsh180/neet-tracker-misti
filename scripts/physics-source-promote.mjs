import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_BATCHES = ["physics-pdf-bank-ready.json", "physics-pdf-complete-review.json"];
const BAD_EXPLANATION_RE = /\b(?:chemistry|botany|zoology|biology|master ncert with pw books app)\b/i;
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

function metaOf(row) {
  if (!row.trendMetaJson || typeof row.trendMetaJson !== "object" || Array.isArray(row.trendMetaJson)) return {};
  return row.trendMetaJson;
}

function explanationAfterRemovingStem(row) {
  let explanation = clean(row.explanation).replace(/\bVideo Solution:\s*$/i, "").trim();
  const question = clean(row.question);
  if (question && explanation.toLowerCase().startsWith(question.slice(0, Math.min(80, question.length)).toLowerCase())) {
    explanation = explanation.slice(question.length).trim();
  }
  for (const option of optionsOf(row)) {
    if (option) explanation = explanation.replace(option, " ");
  }
  return clean(explanation.replace(/\(?\s*[1-4A-Da-d]\s*\)?/g, " "));
}

function isFormulaOrReasoning(text) {
  return /[=+\-*/√πµΩ]|because|hence|therefore|using|given|formula|law|equation|since|so|proportional|conservation|resonance|impedance|current|field|energy|force|momentum/i.test(text);
}

function eligible(row) {
  const meta = metaOf(row);
  const options = optionsOf(row);
  const explanation = clean(row.explanation);
  const residual = explanationAfterRemovingStem(row);
  const question = clean(row.question);
  const reasons = [];

  if (row.subject !== "Physics") reasons.push("not physics");
  if (!SOURCE_BATCHES.includes(row.importBatch ?? "")) reasons.push("not PW staged batch");
  if (row.qualityStatus !== "NEEDS_REVIEW") reasons.push("not needs_review");
  if (row.isDiagramBased || row.isGraphBased || row.visualAssetKind) reasons.push("visual row");
  if (BAD_STEM_RE.test(row.question)) reasons.push("stem contains solution label");
  if (BAD_EXPLANATION_RE.test(explanation)) reasons.push("explanation contains section/app leakage");
  if (question.length < 35) reasons.push("short question");
  if (options.length !== 4 || options.some((option) => option.length < 1 || option.length > 360)) reasons.push("bad options");
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) reasons.push("bad key");
  if (explanation.length < 70) reasons.push("short explanation");
  if (question && explanation.toLowerCase().startsWith(question.slice(0, Math.min(70, question.length)).toLowerCase())) reasons.push("explanation repeats question stem");
  if (residual.length < 35) reasons.push("non-substantive explanation");
  if (!isFormulaOrReasoning(residual)) reasons.push("no visible reasoning/formula");
  if (meta.needsVisualAsset === true) reasons.push("meta visual");
  if (meta.sectionLeak === true) reasons.push("meta section leak");
  if (meta.solutionAnswerAgrees === false) reasons.push("solution answer mismatch");
  if (meta.suspiciousOptions === true) reasons.push("suspicious options");
  if (typeof meta.parseConfidence === "number" && meta.parseConfidence < 0.9) reasons.push("low parse confidence");
  if (meta.explanationRelevant === false) reasons.push("irrelevant explanation");
  if (meta.explanationSubstantive === false) reasons.push("non-substantive meta");

  return { ok: reasons.length === 0, reasons, residual };
}

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const limit = Number(args.limit ?? 0);
const take = Math.max(1, Number(args.take ?? 5000));

try {
  const rows = await prisma.bankQuestion.findMany({
    where: {
      subject: "Physics",
      importBatch: { in: SOURCE_BATCHES },
      qualityStatus: "NEEDS_REVIEW",
    },
    select: {
      id: true,
      subject: true,
      chapter: true,
      importBatch: true,
      sourceRef: true,
      question: true,
      optionsJson: true,
      correctIndex: true,
      explanation: true,
      qualityStatus: true,
      isDiagramBased: true,
      isGraphBased: true,
      visualAssetKind: true,
      trendMetaJson: true,
    },
    orderBy: [{ createdAt: "asc" }],
    take,
  });

  const eligibleRows = [];
  const rejectedReasons = new Map();
  for (const row of rows) {
    const verdict = eligible(row);
    if (verdict.ok) {
      eligibleRows.push({ row, residual: verdict.residual });
    } else {
      for (const reason of verdict.reasons) rejectedReasons.set(reason, (rejectedReasons.get(reason) ?? 0) + 1);
    }
  }

  const selected = limit ? eligibleRows.slice(0, limit) : eligibleRows;
  if (apply) {
    for (const { row } of selected) {
      await prisma.bankQuestion.update({
        where: { id: row.id },
        data: {
          verified: true,
          qualityStatus: "VERIFIED_STRICT",
          qualityScore: 0.93,
          verifiedAt: new Date(),
          verifierModel: "physics-source-promote-v1",
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
    rejectedReasons: Object.fromEntries([...rejectedReasons.entries()].sort((a, b) => b[1] - a[1])),
    examples: selected.slice(0, 12).map(({ row }) => ({
      id: row.id,
      chapter: row.chapter,
      sourceRef: row.sourceRef,
      question: clean(row.question).slice(0, 180),
      explanation: clean(row.explanation).slice(0, 180),
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
