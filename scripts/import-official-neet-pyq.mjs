import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
require("@next/env").loadEnvConfig(process.cwd());

const { insertBankQuestions } = require("../src/lib/question-bank.ts");
const { db } = require("../src/lib/db.ts");

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node scripts/import-official-neet-pyq.mjs <verified-manifest.json>");
const bytes = await readFile(path.resolve(manifestPath));
const manifest = JSON.parse(bytes.toString("utf8"));
const approvedHosts = new Set(["nta.ac.in", "www.nta.ac.in", "neet.nta.nic.in"]);

function requireOfficialUrl(value, label) {
  const url = new URL(String(value ?? ""));
  if (url.protocol !== "https:" || !approvedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} must be an official HTTPS NTA/NEET URL`);
  }
  return url.toString();
}

const examYear = Number(manifest.examYear);
if (!Number.isInteger(examYear) || examYear < 2013 || examYear > new Date().getFullYear()) throw new Error("Invalid NEET examYear");
if (!manifest.paperCode || !Array.isArray(manifest.questions) || !manifest.questions.length) throw new Error("paperCode and questions are required");
if (manifest.extractionConsensus !== true || manifest.verifiedAgainstOfficialKey !== true) {
  throw new Error("Manifest must record independent extraction consensus and official answer-key verification");
}
const paperUrl = requireOfficialUrl(manifest.paperUrl, "paperUrl");
const answerKeyUrl = requireOfficialUrl(manifest.answerKeyUrl, "answerKeyUrl");
const paperSha256 = String(manifest.paperSha256 ?? "");
const answerKeySha256 = String(manifest.answerKeySha256 ?? "");
if (!/^[a-f0-9]{64}$/i.test(paperSha256) || !/^[a-f0-9]{64}$/i.test(answerKeySha256)) throw new Error("Official file SHA-256 values are required");

const questionNumbers = new Set();
const rows = manifest.questions.map((question) => {
  const paperQuestionNumber = Number(question.paperQuestionNumber);
  if (!Number.isInteger(paperQuestionNumber) || paperQuestionNumber < 1 || questionNumbers.has(paperQuestionNumber)) {
    throw new Error(`Invalid or duplicate paperQuestionNumber: ${question.paperQuestionNumber}`);
  }
  questionNumbers.add(paperQuestionNumber);
  if (!Array.isArray(question.optionExplanations) || question.optionExplanations.length !== 4) {
    throw new Error(`Q${paperQuestionNumber} requires four option explanations`);
  }
  return {
    ...question,
    source: "NEET_PYQ",
    sourceRef: `NEET UG ${examYear} - ${manifest.paperCode} - Q${paperQuestionNumber}`,
    verified: true,
    exam: "NEET_UG",
    examYear,
    paperCode: String(manifest.paperCode),
    paperQuestionNumber,
    provenanceJson: {
      paperUrl,
      answerKeyUrl,
      paperSha256,
      answerKeySha256,
      manifestSha256: createHash("sha256").update(bytes).digest("hex"),
      extractionConsensus: true,
      officialKeyVerified: true,
      importedAt: new Date().toISOString(),
    },
  };
});

const report = await insertBankQuestions(rows, {
  trusted: true,
  importBatch: `official-neet-${examYear}-${manifest.paperCode}`,
  verificationMethod: "OFFICIAL_PAPER_KEY_VERIFIED",
});
console.log(JSON.stringify({ examYear, paperCode: manifest.paperCode, ...report }, null, 2));
await db.$disconnect();
