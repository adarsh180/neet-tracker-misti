import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node scripts/stage-institute-paper.mjs <extracted-paper.json>");
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
const resumeFrom = Number(process.argv.find((arg) => arg.startsWith("--from="))?.split("=")[1] ?? 1);
if (!Number.isInteger(resumeFrom) || resumeFrom < 1 || resumeFrom > 180) {
  throw new Error("--from must be an integer from 1 through 180");
}

function normalizeForBankHash(question, options) {
  return `${question} ${options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function bankHash(question, options) {
  return createHash("sha256").update(normalizeForBankHash(question, options)).digest("hex");
}

function providerHost(url) {
  return new URL(url).hostname.toLowerCase();
}

const officialKeyHosts = new Set(["neet.nta.nic.in", "nta.ac.in", "www.nta.ac.in", "cdnbbsr.s3waas.gov.in"]);
if (!officialKeyHosts.has(providerHost(manifest.answerKeyUrl))) {
  throw new Error("An official NTA/NEET answer-key URL is required before staging verified answers");
}
if (!Array.isArray(manifest.questions) || manifest.questions.length !== 180) {
  throw new Error("The extraction manifest must contain exactly 180 question slots");
}

const paperArtifact = await db.questionSourceArtifact.findUnique({ where: { assetUrl: manifest.paperUrl } });
const keyArtifact = await db.questionSourceArtifact.findUnique({ where: { assetUrl: manifest.answerKeyUrl } });
const solutionArtifact = manifest.solutionUrl
  ? await db.questionSourceArtifact.findUnique({ where: { assetUrl: manifest.solutionUrl } })
  : null;
if (!paperArtifact || !keyArtifact) throw new Error("Paper and official key artifacts must be crawled before staging");
if (paperArtifact.sha256 !== manifest.paperSha256 || keyArtifact.sha256 !== manifest.answerKeySha256) {
  throw new Error("Artifact SHA-256 mismatch; refusing to stage changed source files");
}
if (manifest.solutionUrl && (!solutionArtifact || solutionArtifact.sha256 !== manifest.solutionSha256)) {
  throw new Error("Solution artifact SHA-256 mismatch; refusing to stage unproven explanations");
}

const report = {
  staged: 0,
  cleanlyExtracted: 0,
  needsVisualReview: 0,
  officialKeyVerified: 0,
  exactBankMatches: 0,
  bankRowsUpgraded: 0,
  answerConflicts: 0,
};

try {
  for (const row of manifest.questions) {
    if (row.paperQuestionNumber < resumeFrom) continue;
    const options = Array.isArray(row.options) && row.options.length === 4 ? row.options.map(String) : null;
    const correctIndices = Array.isArray(row.correctIndices) ? row.correctIndices.filter(Number.isInteger) : [];
    const exactHash = row.question && options ? bankHash(String(row.question), options) : null;
    const existing = exactHash ? await db.bankQuestion.findUnique({ where: { contentHash: exactHash } }) : null;
    const singleOfficialAnswer = correctIndices.length === 1;
    const answerAgrees = existing && singleOfficialAnswer ? existing.correctIndex === correctIndices[0] : null;
    const verificationStatus = singleOfficialAnswer
      ? answerAgrees === false ? "CONFLICT" : "OFFICIAL_KEY_VERIFIED"
      : "PENDING";
    const reviewReasons = new Set(Array.isArray(row.reviewReasons) ? row.reviewReasons : []);
    if (!row.question || !options) reviewReasons.add("INCOMPLETE_TEXT_OR_OPTIONS");
    if (!singleOfficialAnswer) reviewReasons.add("SINGLE_OFFICIAL_ANSWER_REQUIRED");
    if (!row.chapter) reviewReasons.add("CURRENT_SYLLABUS_CHAPTER_MAPPING_REQUIRED");
    if (!row.explanation) reviewReasons.add("REVIEWED_EXPLANATION_REQUIRED");
    if (!Array.isArray(row.optionExplanations) || row.optionExplanations.length !== 4) {
      reviewReasons.add("OPTION_EXPLANATIONS_REQUIRED");
    }
    if (answerAgrees === false) reviewReasons.add("EXISTING_BANK_ANSWER_CONFLICT");

    const candidate = await db.questionIngestionCandidate.upsert({
      where: {
        exam_examYear_paperCode_paperQuestionNumber: {
          exam: manifest.exam,
          examYear: manifest.examYear,
          paperCode: manifest.paperCode,
          paperQuestionNumber: row.paperQuestionNumber,
        },
      },
      create: {
        exam: manifest.exam,
        examYear: manifest.examYear,
        paperCode: manifest.paperCode,
        paperQuestionNumber: row.paperQuestionNumber,
        subject: row.subject,
        question: row.question,
        optionsJson: options,
        correctIndicesJson: correctIndices,
        explanation: row.explanation ?? null,
        optionExplanationsJson: row.optionExplanations ?? null,
        normalizedHash: exactHash,
        extractionStatus: row.extractionStatus,
        verificationStatus,
        verificationJson: {
          officialKey: true,
          paperUrl: manifest.paperUrl,
          paperSha256: manifest.paperSha256,
          answerKeyUrl: manifest.answerKeyUrl,
          answerKeySha256: manifest.answerKeySha256,
          provider: manifest.provider,
          solutionUrl: manifest.solutionUrl ?? null,
          solutionSha256: manifest.solutionSha256 ?? null,
        },
        reviewReasonsJson: [...reviewReasons],
        matchedBankQuestionId: existing?.id ?? null,
        matchScore: existing ? 1 : null,
        promotionStatus: existing && answerAgrees ? "PROMOTED" : "NEEDS_REVIEW",
      },
      update: {
        subject: row.subject,
        question: row.question,
        optionsJson: options,
        correctIndicesJson: correctIndices,
        explanation: row.explanation ?? null,
        optionExplanationsJson: row.optionExplanations ?? null,
        normalizedHash: exactHash,
        extractionStatus: row.extractionStatus,
        verificationStatus,
        verificationJson: {
          officialKey: true,
          paperUrl: manifest.paperUrl,
          paperSha256: manifest.paperSha256,
          answerKeyUrl: manifest.answerKeyUrl,
          answerKeySha256: manifest.answerKeySha256,
          provider: manifest.provider,
          solutionUrl: manifest.solutionUrl ?? null,
          solutionSha256: manifest.solutionSha256 ?? null,
        },
        reviewReasonsJson: [...reviewReasons],
        matchedBankQuestionId: existing?.id ?? null,
        matchScore: existing ? 1 : null,
        promotionStatus: existing && answerAgrees ? "PROMOTED" : "NEEDS_REVIEW",
      },
    });

    await db.questionSourceEvidence.upsert({
      where: { candidateId_artifactId: { candidateId: candidate.id, artifactId: paperArtifact.id } },
      create: {
        candidateId: candidate.id,
        artifactId: paperArtifact.id,
        pageNumber: row.pages?.[0] ?? null,
        extractedJson: { question: row.question, options, pages: row.pages, reviewReasons: [...reviewReasons] },
        extractionMethod: "PDFPLUMBER_TWO_COLUMN_V1",
        confidence: row.extractionStatus === "EXTRACTED" ? 0.96 : 0.55,
      },
      update: {
        pageNumber: row.pages?.[0] ?? null,
        extractedJson: { question: row.question, options, pages: row.pages, reviewReasons: [...reviewReasons] },
        extractionMethod: "PDFPLUMBER_TWO_COLUMN_V1",
        confidence: row.extractionStatus === "EXTRACTED" ? 0.96 : 0.55,
      },
    });
    if (solutionArtifact) {
      await db.questionSourceEvidence.upsert({
        where: { candidateId_artifactId: { candidateId: candidate.id, artifactId: solutionArtifact.id } },
        create: {
          candidateId: candidate.id,
          artifactId: solutionArtifact.id,
          pageNumber: row.pages?.[0] ?? null,
          extractedJson: { explanation: row.explanation, optionExplanations: row.optionExplanations },
          extractionMethod: "LICENSED_COACHING_SOLUTION_TEXT_V1",
          confidence: row.explanation ? 0.95 : 0,
        },
        update: {
          pageNumber: row.pages?.[0] ?? null,
          extractedJson: { explanation: row.explanation, optionExplanations: row.optionExplanations },
          extractionMethod: "LICENSED_COACHING_SOLUTION_TEXT_V1",
          confidence: row.explanation ? 0.95 : 0,
        },
      });
    }
    await db.questionSourceEvidence.upsert({
      where: { candidateId_artifactId: { candidateId: candidate.id, artifactId: keyArtifact.id } },
      create: {
        candidateId: candidate.id,
        artifactId: keyArtifact.id,
        pageNumber: 1,
        answerIndicesJson: correctIndices,
        extractionMethod: "OFFICIAL_NTA_KEY_TEXT_V1",
        confidence: singleOfficialAnswer ? 1 : 0.5,
      },
      update: {
        answerIndicesJson: correctIndices,
        extractionMethod: "OFFICIAL_NTA_KEY_TEXT_V1",
        confidence: singleOfficialAnswer ? 1 : 0.5,
      },
    });

    if (existing && answerAgrees) {
      const previousProvenance = existing.provenanceJson && typeof existing.provenanceJson === "object" ? existing.provenanceJson : {};
      await db.bankQuestion.update({
        where: { id: existing.id },
        data: {
          source: "NEET_PYQ",
          sourceRef: `NEET UG ${manifest.examYear} - ${manifest.paperCode} - Q${row.paperQuestionNumber}`,
          exam: manifest.exam,
          examYear: manifest.examYear,
          paperCode: manifest.paperCode,
          paperQuestionNumber: row.paperQuestionNumber,
          verificationMethod: "OFFICIAL_PAPER_KEY_VERIFIED",
          verified: true,
          verifiedAt: new Date(),
          provenanceJson: {
            ...previousProvenance,
            instituteSources: [
              ...new Set([...(Array.isArray(previousProvenance.instituteSources) ? previousProvenance.instituteSources : []), manifest.provider]),
            ],
            paperUrl: manifest.paperUrl,
            paperSha256: manifest.paperSha256,
            answerKeyUrl: manifest.answerKeyUrl,
            answerKeySha256: manifest.answerKeySha256,
          },
        },
      });
      report.bankRowsUpgraded += 1;
    }

    report.staged += 1;
    if (row.extractionStatus === "EXTRACTED") report.cleanlyExtracted += 1;
    else report.needsVisualReview += 1;
    if (singleOfficialAnswer) report.officialKeyVerified += 1;
    if (existing) report.exactBankMatches += 1;
    if (answerAgrees === false) report.answerConflicts += 1;
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
