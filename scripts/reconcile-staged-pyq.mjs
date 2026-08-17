import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const MIN_QUESTION_SCORE = 0.82;
const MIN_OPTION_SCORE = 0.84;
const MIN_MARGIN = 0.07;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it",
  "of", "on", "or", "that", "the", "their", "these", "this", "to", "was", "which", "with", "following",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\\(?:text|mathrm|mathbf|left|right|,|;|:|!)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function optionMapping(candidateOptions, bankOptions) {
  const bankSets = bankOptions.map(tokens);
  const used = new Set();
  const mapping = [];
  let total = 0;
  for (const option of candidateOptions) {
    const optionTokens = tokens(option);
    let best = { index: -1, score: 0 };
    for (let index = 0; index < bankSets.length; index += 1) {
      if (used.has(index)) continue;
      const score = jaccard(optionTokens, bankSets[index]);
      if (score > best.score) best = { index, score };
    }
    if (best.index < 0) return null;
    used.add(best.index);
    mapping.push(best.index);
    total += best.score;
  }
  return { mapping, score: total / candidateOptions.length };
}

function contentHash(question, options) {
  return createHash("sha256").update(normalize(`${question}|${options.join("|")}`)).digest("hex");
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function provenanceFor(candidate) {
  return {
    exam: candidate.exam,
    examYear: candidate.examYear,
    paperCode: candidate.paperCode,
    paperQuestionNumber: candidate.paperQuestionNumber,
    answerVerification: candidate.verificationStatus,
    sourceArtifacts: candidate.evidences.map(({ artifact }) => ({
      provider: artifact.provider,
      kind: artifact.artifactKind,
      sourcePageUrl: artifact.sourcePageUrl,
      assetUrl: artifact.assetUrl,
      sha256: artifact.sha256,
    })),
  };
}

const candidates = await db.questionIngestionCandidate.findMany({
  where: {
    extractionStatus: "EXTRACTED",
    verificationStatus: "OFFICIAL_KEY_VERIFIED",
    promotionStatus: { not: "PROMOTED" },
    question: { not: null },
  },
  include: {
    evidences: {
      include: {
        artifact: {
          select: {
            provider: true,
            artifactKind: true,
            sourcePageUrl: true,
            assetUrl: true,
            sha256: true,
          },
        },
      },
    },
  },
  orderBy: [{ examYear: "desc" }, { paperCode: "asc" }, { paperQuestionNumber: "asc" }],
});

const banksBySubject = new Map();
for (const subject of ["Physics", "Chemistry", "Botany", "Zoology"]) {
  banksBySubject.set(subject, await db.bankQuestion.findMany({
    where: {
      subject,
      verified: true,
      qualityStatus: "VERIFIED_STRICT",
      explanation: { not: "" },
      optionExplanationsJson: { not: { equals: null } },
    },
    select: {
      id: true,
      subject: true,
      classLevel: true,
      chapter: true,
      topic: true,
      difficulty: true,
      question: true,
      optionsJson: true,
      correctIndex: true,
      explanation: true,
      optionExplanationsJson: true,
      questionForm: true,
      subtopic: true,
      trendChapterId: true,
      selectionKey: true,
    },
  }));
}

const report = { examined: candidates.length, reconciled: 0, applied: 0, ambiguous: 0, rejected: 0, samples: [] };

try {
  for (const candidate of candidates) {
    const candidateOptions = asStringArray(candidate.optionsJson);
    const correctIndices = Array.isArray(candidate.correctIndicesJson) ? candidate.correctIndicesJson.filter(Number.isInteger) : [];
    if (!candidate.question || candidateOptions.length !== 4 || correctIndices.length !== 1) {
      report.rejected += 1;
      continue;
    }
    const questionTokens = tokens(candidate.question);
    const ranked = [];
    for (const bank of banksBySubject.get(candidate.subject) ?? []) {
      const bankOptions = asStringArray(bank.optionsJson);
      const bankOptionExplanations = asStringArray(bank.optionExplanationsJson);
      if (bankOptions.length !== 4 || bankOptionExplanations.length !== 4) continue;
      const questionScore = jaccard(questionTokens, tokens(bank.question));
      if (questionScore < MIN_QUESTION_SCORE) continue;
      const optionMatch = optionMapping(candidateOptions, bankOptions);
      if (!optionMatch || optionMatch.score < MIN_OPTION_SCORE) continue;
      if (optionMatch.mapping[correctIndices[0]] !== bank.correctIndex) continue;
      ranked.push({ bank, questionScore, optionMatch, combined: questionScore * 0.72 + optionMatch.score * 0.28 });
    }
    ranked.sort((left, right) => right.combined - left.combined);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best) {
      report.rejected += 1;
      continue;
    }
    if (runnerUp && best.combined - runnerUp.combined < MIN_MARGIN && runnerUp.bank.id !== best.bank.id) {
      report.ambiguous += 1;
      continue;
    }
    report.reconciled += 1;
    if (report.samples.length < 12) {
      report.samples.push({
        examYear: candidate.examYear,
        paperCode: candidate.paperCode,
        questionNumber: candidate.paperQuestionNumber,
        subject: candidate.subject,
        score: Number(best.combined.toFixed(3)),
        chapter: best.bank.chapter,
      });
    }
    if (!APPLY) continue;

    const bankOptionExplanations = asStringArray(best.bank.optionExplanationsJson);
    const remappedExplanations = best.optionMatch.mapping.map((bankIndex) => bankOptionExplanations[bankIndex]);
    const hash = contentHash(candidate.question, candidateOptions);
    const sourceProviders = [...new Set(candidate.evidences.map(({ artifact }) => artifact.provider).filter((provider) => provider !== "NTA"))];
    const sourceRef = `${candidate.exam.replaceAll("_", " ")} ${candidate.examYear} · ${candidate.paperCode} · Q${candidate.paperQuestionNumber}`;
    const promoted = await db.bankQuestion.upsert({
      where: { contentHash: hash },
      create: {
        subject: candidate.subject,
        classLevel: best.bank.classLevel,
        chapter: best.bank.chapter,
        topic: best.bank.topic,
        source: "PYQ",
        sourceRef,
        difficulty: best.bank.difficulty,
        question: candidate.question,
        optionsJson: candidateOptions,
        correctIndex: correctIndices[0],
        explanation: best.bank.explanation,
        optionExplanationsJson: remappedExplanations,
        verified: true,
        qualityStatus: "VERIFIED_STRICT",
        qualityScore: best.combined,
        verifiedAt: new Date(),
        verifierModel: "DETERMINISTIC_RECONCILIATION",
        verificationMethod: "OFFICIAL_KEY_AND_STRICT_BANK_MATCH",
        verificationVersion: "pyq-reconcile-v1",
        trendChapterId: best.bank.trendChapterId,
        questionForm: best.bank.questionForm,
        subtopic: best.bank.subtopic,
        selectionKey: best.bank.selectionKey,
        exam: candidate.exam,
        examYear: candidate.examYear,
        paperCode: candidate.paperCode,
        paperQuestionNumber: candidate.paperQuestionNumber,
        provenanceJson: { ...provenanceFor(candidate), explanationSourceBankQuestionId: best.bank.id, sourceProviders },
        contentHash: hash,
        importBatch: `staged-pyq-${candidate.examYear}-${candidate.paperCode}`,
      },
      update: {
        exam: candidate.exam,
        examYear: candidate.examYear,
        paperCode: candidate.paperCode,
        paperQuestionNumber: candidate.paperQuestionNumber,
        provenanceJson: { ...provenanceFor(candidate), explanationSourceBankQuestionId: best.bank.id, sourceProviders },
      },
      select: { id: true },
    });
    await db.questionIngestionCandidate.update({
      where: { id: candidate.id },
      data: {
        classLevel: best.bank.classLevel,
        chapter: best.bank.chapter,
        topic: best.bank.topic,
        explanation: best.bank.explanation,
        optionExplanationsJson: remappedExplanations,
        matchedBankQuestionId: promoted.id,
        matchScore: best.combined,
        promotionStatus: "PROMOTED",
        verificationJson: { method: "OFFICIAL_KEY_AND_STRICT_BANK_MATCH", explanationSourceBankQuestionId: best.bank.id },
      },
    });
    report.applied += 1;
  }
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", ...report }, null, 2));
} finally {
  await db.$disconnect();
}
