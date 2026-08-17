import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
require("@next/env").loadEnvConfig(process.cwd());

const { db } = require("../src/lib/db.ts");
const { canonicalizeChapter, normalizeSubject } = require("../src/data/syllabus/neet-chapters.ts");

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: npm run reader:import -- <reviewed-manifest.json>");
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
if (manifest.humanReviewed !== true || !Array.isArray(manifest.documents)) throw new Error("Manifest must set humanReviewed=true and contain documents[]");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalizeText = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
let importedDocuments = 0;
let importedPassages = 0;
let importedLinks = 0;

async function importDocument(raw) {
  const subject = normalizeSubject(String(raw.subject ?? ""));
  const chapter = subject && canonicalizeChapter(subject, String(raw.chapter ?? ""));
  const classLevel = raw.classLevel === "11" || raw.classLevel === "12" ? raw.classLevel : null;
  if (!subject || !chapter || !classLevel || chapter.classLevel !== classLevel) throw new Error(`Invalid syllabus mapping: ${raw.subject}/${raw.classLevel}/${raw.chapter}`);
  const sourceUrl = new URL(String(raw.sourceUrl ?? ""));
  if (sourceUrl.protocol !== "https:") throw new Error(`NCERT sourceUrl must use HTTPS: ${raw.sourceUrl}`);
  const expectedSha = String(raw.sourceSha256 ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) throw new Error(`A SHA-256 is required for ${raw.title}`);
  const absolutePdfPath = raw.pdfPath ? path.resolve(path.dirname(manifestPath), raw.pdfPath) : null;
  const bytes = absolutePdfPath
    ? await readFile(absolutePdfPath)
    : Buffer.from(await (await fetch(sourceUrl)).arrayBuffer());
  const actualSha = sha256(bytes);
  if (actualSha !== expectedSha) throw new Error(`Source hash mismatch for ${raw.title}: expected ${expectedSha}, got ${actualSha}`);
  const edition = normalizeText(raw.edition) || "current";
  const storagePath = absolutePdfPath ? path.relative(process.cwd(), absolutePdfPath).replaceAll("\\", "/") : null;
  const embedPdf = raw.embedPdf === true || process.env.NCERT_EMBED_PDFS === "1";

  const document = await db.ncertDocument.upsert({
    select: { id: true },
    where: { subject_classLevel_chapter_edition_language: { subject, classLevel, chapter: chapter.chapter, edition, language: raw.language ?? "en" } },
    create: { subject, classLevel, chapter: chapter.chapter, title: normalizeText(raw.title) || chapter.chapter, edition, language: raw.language ?? "en", sourceUrl: sourceUrl.toString(), sourceSha256: actualSha, storagePath, fileData: embedPdf ? bytes : null, pageCount: Number(raw.pageCount) || null, reviewStatus: "VERIFIED_SOURCE" },
    update: { title: normalizeText(raw.title) || chapter.chapter, sourceUrl: sourceUrl.toString(), sourceSha256: actualSha, storagePath, ...(embedPdf ? { fileData: bytes } : {}), pageCount: Number(raw.pageCount) || null, reviewStatus: "VERIFIED_SOURCE" },
  });
  importedDocuments += 1;

  for (const rawPassage of raw.passages ?? []) {
    const text = normalizeText(rawPassage.text);
    const pageNumber = Number(rawPassage.pageNumber);
    if (text.length < 15 || !Number.isInteger(pageNumber) || pageNumber < 1) throw new Error(`Invalid passage in ${raw.title}`);
    const normalizedHash = sha256(text.toLowerCase());
    const passage = await db.ncertPassage.upsert({
      where: { documentId_normalizedHash: { documentId: document.id, normalizedHash } },
      create: { documentId: document.id, pageNumber, text, normalizedHash, bboxJson: rawPassage.bbox ?? undefined, reviewStatus: "VERIFIED" },
      update: { pageNumber, text, bboxJson: rawPassage.bbox ?? undefined, reviewStatus: "VERIFIED" },
    });
    importedPassages += 1;
    for (const rawLink of rawPassage.questions ?? []) {
      const bankQuestion = rawLink.bankQuestionId
        ? await db.bankQuestion.findUnique({ where: { id: rawLink.bankQuestionId } })
        : await db.bankQuestion.findUnique({ where: { contentHash: String(rawLink.contentHash ?? "") } });
      if (!bankQuestion || bankQuestion.source !== "NEET_PYQ" || bankQuestion.qualityStatus !== "VERIFIED_STRICT" || !bankQuestion.verified) {
        throw new Error(`Passage link must target a verified historical NEET question (${rawLink.bankQuestionId ?? rawLink.contentHash})`);
      }
      const confidence = Number(rawLink.confidence);
      if (!Number.isFinite(confidence) || confidence < 0.8 || confidence > 1) throw new Error(`Reviewed link confidence must be between 0.8 and 1`);
      await db.ncertPassageQuestionLink.upsert({
        where: { passageId_bankQuestionId: { passageId: passage.id, bankQuestionId: bankQuestion.id } },
        create: { passageId: passage.id, bankQuestionId: bankQuestion.id, confidence, linkType: rawLink.linkType ?? "DERIVED_FROM", reviewStatus: "VERIFIED", reviewNote: rawLink.reviewNote ?? null },
        update: { confidence, linkType: rawLink.linkType ?? "DERIVED_FROM", reviewStatus: "VERIFIED", reviewNote: rawLink.reviewNote ?? null },
      });
      importedLinks += 1;
    }
  }
}

const concurrency = Math.max(1, Math.min(6, Number(process.env.NCERT_IMPORT_CONCURRENCY) || 4));
for (let offset = 0; offset < manifest.documents.length; offset += concurrency) {
  await Promise.all(manifest.documents.slice(offset, offset + concurrency).map(importDocument));
}

console.log(JSON.stringify({ importedDocuments, importedPassages, importedLinks }, null, 2));
await db.$disconnect();
