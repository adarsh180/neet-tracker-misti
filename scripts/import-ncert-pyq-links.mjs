import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const inputPath = path.resolve(process.argv[2] ?? "tmp/pdfs/ncert-official/ncert-pyq-links.json");
const payload = JSON.parse(await readFile(inputPath, "utf8"));

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function contentHash(question, options) {
  return createHash("sha256").update(normalize(`${question}|${options.join("|")}`)).digest("hex");
}

const verifiedMatches = payload.matches.filter((entry) =>
  entry.match?.reviewStatus === "VERIFIED_AUTO" &&
  entry.match.score >= 0.58 &&
  entry.match.margin >= 0.08 &&
  entry.match.sharedKeywords >= 5,
);
const report = { considered: verifiedMatches.length, importedQuestions: 0, importedPassages: 0, importedLinks: 0, skipped: 0 };

try {
  for (const entry of verifiedMatches) {
    const candidate = await db.questionIngestionCandidate.findUnique({ where: { id: entry.candidateId } });
    if (
      !candidate || candidate.verificationStatus !== "OFFICIAL_KEY_VERIFIED" ||
      candidate.extractionStatus !== "EXTRACTED" || !candidate.explanation
    ) {
      report.skipped += 1;
      continue;
    }
    const document = await db.ncertDocument.findFirst({
      where: {
        sourceSha256: entry.document.sourceSha256,
        reviewStatus: "VERIFIED_SOURCE",
      },
      select: { id: true, subject: true, classLevel: true, chapter: true, title: true },
    });
    if (!document) {
      report.skipped += 1;
      continue;
    }
    const options = Array.isArray(entry.options) ? entry.options.map(String) : [];
    const optionExplanations = Array.isArray(entry.optionExplanations) ? entry.optionExplanations.map(String) : [];
    if (options.length !== 4 || optionExplanations.length !== 4 || !Number.isInteger(entry.correctIndex)) {
      report.skipped += 1;
      continue;
    }

    const question = await db.bankQuestion.upsert({
      where: { contentHash: contentHash(entry.question, options) },
      create: {
        subject: document.subject,
        classLevel: document.classLevel,
        chapter: document.chapter,
        topic: null,
        source: "NEET_PYQ",
        sourceRef: `NEET UG ${entry.examYear} · ${entry.paperCode} · Q${entry.paperQuestionNumber}`,
        difficulty: "UNRATED",
        question: entry.question,
        optionsJson: options,
        correctIndex: entry.correctIndex,
        explanation: entry.explanation,
        optionExplanationsJson: optionExplanations,
        verified: true,
        qualityStatus: "VERIFIED_STRICT",
        qualityScore: entry.match.score,
        verifiedAt: new Date(),
        verifierModel: "DETERMINISTIC_SOURCE_PIPELINE",
        verificationMethod: "OFFICIAL_KEY_LICENSED_SOLUTION_NCERT_LINK",
        verificationVersion: "ncert-pyq-link-v1",
        exam: entry.exam,
        examYear: entry.examYear,
        paperCode: entry.paperCode,
        paperQuestionNumber: entry.paperQuestionNumber,
        provenanceJson: {
          answerVerification: candidate.verificationJson,
          sourceEvidence: entry.evidences,
          solutionCandidateId: candidate.id,
          ncertLink: entry.match,
          difficultyStatus: "UNRATED",
        },
        contentHash: contentHash(entry.question, options),
        importBatch: `ncert-linked-pyq-${entry.examYear}-${entry.paperCode}`,
      },
      update: {
        subject: document.subject,
        classLevel: document.classLevel,
        chapter: document.chapter,
        explanation: entry.explanation,
        optionExplanationsJson: optionExplanations,
        exam: entry.exam,
        examYear: entry.examYear,
        paperCode: entry.paperCode,
        paperQuestionNumber: entry.paperQuestionNumber,
      },
      select: { id: true },
    });
    report.importedQuestions += 1;

    const passage = await db.ncertPassage.upsert({
      where: { documentId_normalizedHash: { documentId: document.id, normalizedHash: entry.passage.normalizedHash } },
      create: {
        documentId: document.id,
        pageNumber: entry.passage.pageNumber,
        text: entry.passage.text,
        normalizedHash: entry.passage.normalizedHash,
        bboxJson: entry.passage.bbox,
        reviewStatus: "VERIFIED",
      },
      update: {
        pageNumber: entry.passage.pageNumber,
        text: entry.passage.text,
        bboxJson: entry.passage.bbox,
        reviewStatus: "VERIFIED",
      },
      select: { id: true },
    });
    report.importedPassages += 1;

    await db.ncertPassageQuestionLink.upsert({
      where: { passageId_bankQuestionId: { passageId: passage.id, bankQuestionId: question.id } },
      create: {
        passageId: passage.id,
        bankQuestionId: question.id,
        linkType: "DERIVED_FROM",
        confidence: entry.match.score,
        reviewStatus: "VERIFIED",
        reviewNote: `${entry.match.method}; margin=${entry.match.margin}; shared=${entry.match.sharedKeywords}`,
      },
      update: {
        confidence: entry.match.score,
        reviewStatus: "VERIFIED",
        reviewNote: `${entry.match.method}; margin=${entry.match.margin}; shared=${entry.match.sharedKeywords}`,
      },
    });
    report.importedLinks += 1;

    const previousReasons = Array.isArray(candidate.reviewReasonsJson) ? candidate.reviewReasonsJson : [];
    await db.questionIngestionCandidate.update({
      where: { id: candidate.id },
      data: {
        subject: document.subject,
        classLevel: document.classLevel,
        chapter: document.chapter,
        matchedBankQuestionId: question.id,
        matchScore: entry.match.score,
        promotionStatus: "PROMOTED",
        reviewReasonsJson: previousReasons.filter((reason) => ![
          "CURRENT_SYLLABUS_CHAPTER_MAPPING_REQUIRED",
          "REVIEWED_EXPLANATION_REQUIRED",
          "OPTION_EXPLANATIONS_REQUIRED",
        ].includes(String(reason))),
      },
    });
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
