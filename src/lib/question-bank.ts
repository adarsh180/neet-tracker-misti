import { createHash } from "node:crypto";

import type { BankQuestion, Prisma } from "@prisma/client";

import { CHAPTERS, canonicalizeChapter, normalizeSubject, type NeetSubject } from "../data/syllabus/neet-chapters";
import { extractJsonArray } from "./ai-json";
import { db } from "./db";
import { BANK_MODELS, BANK_SECOND_PASS_MODELS, chatWithAI } from "./openrouter";
import type { PracticeDifficulty, PracticeQuestion, PracticeSource, PracticeSubjectSlug } from "./practice-engine";
import { cleanQuestionOptions, cleanQuestionText, hasUnreadableText, isPlaceholderText } from "./text-cleanup";
import { buildTrendAssemblyPlan, shouldUseTrendAssembly } from "./trend-blueprint";
import { renderQuestionVisualSvg } from "./question-visual-svg";
import { storeQuestionVisualAsset } from "./question-visual-assets";

export const BANK_CHAPTER_QUOTA = 2000;
export const BANK_AI_MODELS = BANK_MODELS;
const BANK_AI_TIMEOUT_MS = 300000;

export type BankSource = PracticeSource | "NCERT";

export type RawBankQuestion = {
  subject?: unknown;
  classLevel?: unknown;
  chapter?: unknown;
  topic?: unknown;
  source?: unknown;
  sourceRef?: unknown;
  difficulty?: unknown;
  question?: unknown;
  options?: unknown;
  optionA?: unknown;
  optionB?: unknown;
  optionC?: unknown;
  optionD?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
  optionExplanations?: unknown;
  verified?: unknown;
  trendChapterId?: unknown;
  questionForm?: unknown;
  subtopic?: unknown;
  isDiagramBased?: unknown;
  isGraphBased?: unknown;
  duplicateClusterId?: unknown;
  sourceQuality?: unknown;
  pyqSimilarityScore?: unknown;
  trendMetaJson?: unknown;
  visualAssetUrl?: unknown;
  visualAssetAlt?: unknown;
  visualAssetKind?: unknown;
  visualAssetId?: unknown;
  visualMetaJson?: unknown;
  verifierRuns?: unknown;
  provenanceJson?: unknown;
  exam?: unknown;
  examYear?: unknown;
  paperCode?: unknown;
  paperQuestionNumber?: unknown;
  visualSpec?: unknown;
};

export type ValidatedBankQuestion = {
  subject: NeetSubject;
  classLevel: string | null;
  chapter: string;
  topic: string | null;
  source: BankSource;
  sourceRef: string;
  difficulty: PracticeDifficulty;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  optionExplanations: string[];
  verified: boolean;
  contentHash: string;
  trendChapterId?: string | null;
  questionForm?: string | null;
  subtopic?: string | null;
  isDiagramBased?: boolean;
  isGraphBased?: boolean;
  duplicateClusterId?: string | null;
  sourceQuality?: number | null;
  pyqSimilarityScore?: number | null;
  trendMetaJson?: unknown;
  visualAssetUrl?: string | null;
  visualAssetAlt?: string | null;
  visualAssetKind?: string | null;
  visualAssetId?: string | null;
  visualMetaJson?: unknown;
  verifierRuns?: unknown;
  provenanceJson?: unknown;
  exam?: string | null;
  examYear?: number | null;
  paperCode?: string | null;
  paperQuestionNumber?: number | null;
};

export type BankInsertReport = {
  total: number;
  valid: number;
  inserted: number;
  duplicate: number;
  invalid: { index: number; reason: string }[];
};

export type BankAssemblyAudit = {
  mode: string;
  requested: number;
  selected: number;
  blueprintVersion?: string;
  paperTemplate?: string;
  quotas: Array<{
    subject: string;
    chapter?: string;
    classLevel?: string | null;
    requested: number;
    selected: number;
    trendChapterIds?: string[];
    fallback?: boolean;
  }>;
  warnings: string[];
};

type FillQuestionBankOptions = {
  subject?: unknown;
  chapter?: unknown;
  count?: unknown;
  maxQuestions?: unknown;
  all?: unknown;
  timeBudgetMs?: unknown;
  batchSize?: unknown;
};

type UpgradeQuestionBankOptions = {
  limit?: number;
  batchSize?: number;
  delayMs?: number;
  dryRun?: boolean;
  statuses?: string[];
};

type FillVisualQuestionBankOptions = {
  count?: number;
  batchSize?: number;
  subject?: unknown;
  chapter?: unknown;
  timeBudgetMs?: number;
};

const SOURCES = new Set<BankSource>(["NEET_PYQ", "JEE_PYQ", "INSTITUTE", "PLATFORM", "NCERT", "AI"]);
const DIFFICULTIES = new Set<PracticeDifficulty>(["EASY", "MODERATE", "TOUGH"]);
const SUBJECT_NAMES: Record<PracticeSubjectSlug, NeetSubject> = {
  physics: "Physics",
  chemistry: "Chemistry",
  botany: "Botany",
  zoology: "Zoology",
};

function optionalString(input: unknown, max = 180) {
  const text = String(input ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function optionalNumber(input: unknown) {
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : null;
}

function optionalInteger(input: unknown) {
  const numeric = Number(input);
  return Number.isInteger(numeric) ? numeric : null;
}

function coerceOptionExplanations(input: unknown) {
  return Array.isArray(input) ? cleanQuestionOptions(input).slice(0, 4) : [];
}

function parseCorrectIndex(input: unknown) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  const text = String(input ?? "").trim().toUpperCase();
  if (/^[0-3]$/.test(text)) return Number(text);
  if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  return Number.NaN;
}

function coerceOptions(raw: RawBankQuestion) {
  if (Array.isArray(raw.options)) return cleanQuestionOptions(raw.options);
  if (raw.options && typeof raw.options === "object") {
    const record = raw.options as Record<string, unknown>;
    return ["A", "B", "C", "D"].map((letter) => record[letter] ?? record[letter.toLowerCase()]);
  }
  return [raw.optionA, raw.optionB, raw.optionC, raw.optionD].map((option) => String(option ?? "").trim());
}

export function normalizeContentForHash(question: string, options: string[]) {
  return `${question} ${options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentHash(question: string, options: string[]) {
  return createHash("sha256").update(normalizeContentForHash(question, options)).digest("hex");
}

export function validateBankQuestion(raw: RawBankQuestion, verifiedDefault = false): { question: ValidatedBankQuestion | null; reason?: string } {
  const subject = normalizeSubject(String(raw.subject ?? ""));
  if (!subject) return { question: null, reason: "unknown subject" };

  const chapterEntry = canonicalizeChapter(subject, String(raw.chapter ?? ""));
  if (!chapterEntry) return { question: null, reason: "chapter is not canonicalizable" };

  const options = cleanQuestionOptions(coerceOptions(raw));
  if (options.length !== 4 || options.some((option) => isPlaceholderText(option))) return { question: null, reason: "requires four readable options" };
  if (options.some(hasUnreadableText)) return { question: null, reason: "options contain unreadable encoding artifacts" };

  const correctIndex = parseCorrectIndex(raw.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return { question: null, reason: "correctIndex must be 0-3 or A-D" };

  const source = String(raw.source ?? "AI").trim().toUpperCase() as BankSource;
  if (!SOURCES.has(source)) return { question: null, reason: "unknown source" };
  if (source === "JEE_PYQ" && subject !== "Physics" && subject !== "Chemistry") {
    return { question: null, reason: "JEE_PYQ is allowed only for Physics/Chemistry" };
  }

  const difficulty = String(raw.difficulty ?? "MODERATE").trim().toUpperCase() as PracticeDifficulty;
  if (!DIFFICULTIES.has(difficulty)) return { question: null, reason: "unknown difficulty" };

  const questionText = cleanQuestionText(raw.question);
  if (!questionText) return { question: null, reason: "question is required" };
  if (hasUnreadableText(questionText)) return { question: null, reason: "question contains unreadable encoding artifacts" };
  if (isLowQualityQuestionText(questionText)) return { question: null, reason: "question contains generator artifacts" };

  const explanation = cleanQuestionText(raw.explanation);
  if (!explanation) return { question: null, reason: "explanation is required" };
  const optionExplanations = coerceOptionExplanations(raw.optionExplanations);
  if (hasUnreadableText(explanation) || optionExplanations.some(hasUnreadableText)) return { question: null, reason: "explanation contains unreadable encoding artifacts" };

  const classLevel = String(raw.classLevel ?? chapterEntry.classLevel).trim() || chapterEntry.classLevel;

  return {
    question: {
      subject,
      classLevel,
      chapter: chapterEntry.chapter,
      topic: raw.topic ? String(raw.topic).trim() || null : null,
      source,
      sourceRef: String(raw.sourceRef ?? (source === "AI" ? "Original" : source)).trim().slice(0, 240),
      difficulty,
      question: questionText,
      options,
      correctIndex,
      explanation,
      optionExplanations,
      verified: Boolean(raw.verified ?? verifiedDefault),
      contentHash: contentHash(questionText, options),
      trendChapterId: optionalString(raw.trendChapterId, 120),
      questionForm: optionalString(raw.questionForm, 80),
      subtopic: optionalString(raw.subtopic, 160),
      isDiagramBased: Boolean(raw.isDiagramBased),
      isGraphBased: Boolean(raw.isGraphBased),
      duplicateClusterId: optionalString(raw.duplicateClusterId, 120),
      sourceQuality: optionalNumber(raw.sourceQuality),
      pyqSimilarityScore: optionalNumber(raw.pyqSimilarityScore),
      trendMetaJson: raw.trendMetaJson,
      visualAssetUrl: optionalString(raw.visualAssetUrl, 760),
      visualAssetAlt: optionalString(raw.visualAssetAlt, 1000),
      visualAssetKind: optionalString(raw.visualAssetKind, 40),
      visualAssetId: optionalString(raw.visualAssetId, 191),
      visualMetaJson: raw.visualMetaJson,
      verifierRuns: raw.verifierRuns,
      provenanceJson: raw.provenanceJson,
      exam: optionalString(raw.exam, 40),
      examYear: optionalInteger(raw.examYear),
      paperCode: optionalString(raw.paperCode, 80),
      paperQuestionNumber: optionalInteger(raw.paperQuestionNumber),
    },
  };
}

function toCreateManyInput(
  row: ValidatedBankQuestion,
  importBatch?: string,
  verificationMethod = "TRUSTED_IMPORT",
): Prisma.BankQuestionCreateManyInput {
  return {
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    topic: row.topic,
    source: row.source,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty,
    question: row.question,
    optionsJson: row.options as unknown as Prisma.InputJsonValue,
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    optionExplanationsJson: row.optionExplanations.length === 4 ? row.optionExplanations as unknown as Prisma.InputJsonValue : undefined,
    verified: row.verified,
    qualityStatus: row.verified ? "VERIFIED_STRICT" : "UNVERIFIED",
    verificationMethod: row.verified ? verificationMethod : "UNVERIFIED",
    verificationVersion: row.verified ? "quality-v2" : undefined,
    contentHash: row.contentHash,
    selectionKey: row.contentHash,
    importBatch,
    trendChapterId: row.trendChapterId ?? undefined,
    questionForm: row.questionForm ?? undefined,
    subtopic: row.subtopic ?? undefined,
    isDiagramBased: row.isDiagramBased ?? false,
    isGraphBased: row.isGraphBased ?? false,
    duplicateClusterId: row.duplicateClusterId ?? undefined,
    sourceQuality: row.sourceQuality ?? undefined,
    pyqSimilarityScore: row.pyqSimilarityScore ?? undefined,
    trendMetaJson: row.trendMetaJson === undefined ? undefined : (row.trendMetaJson as Prisma.InputJsonValue),
    visualAssetUrl: row.visualAssetUrl ?? undefined,
    visualAssetAlt: row.visualAssetAlt ?? undefined,
    visualAssetKind: row.visualAssetKind ?? undefined,
    visualAssetId: row.visualAssetId ?? undefined,
    visualMetaJson: row.visualMetaJson === undefined ? undefined : (row.visualMetaJson as Prisma.InputJsonValue),
    verifierRuns: row.verifierRuns === undefined ? undefined : (row.verifierRuns as Prisma.InputJsonValue),
    provenanceJson: row.provenanceJson === undefined ? undefined : (row.provenanceJson as Prisma.InputJsonValue),
    exam: row.exam ?? undefined,
    examYear: row.examYear ?? undefined,
    paperCode: row.paperCode ?? undefined,
    paperQuestionNumber: row.paperQuestionNumber ?? undefined,
  };
}

export async function insertBankQuestions(
  rawRows: RawBankQuestion[],
  options: { trusted?: boolean; importBatch?: string; verificationMethod?: string } = {},
): Promise<BankInsertReport> {
  const invalid: BankInsertReport["invalid"] = [];
  const valid: ValidatedBankQuestion[] = [];

  rawRows.forEach((row, index) => {
    const result = validateBankQuestion(row, options.trusted === true);
    if (result.question) valid.push(result.question);
    else invalid.push({ index, reason: result.reason ?? "invalid row" });
  });

  const unique = new Map<string, ValidatedBankQuestion>();
  valid.forEach((row) => unique.set(row.contentHash, row));
  const candidates = [...unique.values()];
  const existing = candidates.length
    ? await db.bankQuestion.findMany({ where: { contentHash: { in: candidates.map((row) => row.contentHash) } }, select: { contentHash: true } })
    : [];
  const existingHashes = new Set(existing.map((row) => row.contentHash));
  const newRows = candidates.filter((row) => !existingHashes.has(row.contentHash));

  if (newRows.length) {
    await db.bankQuestion.createMany({
      data: newRows.map((row) => toCreateManyInput(row, options.importBatch, options.verificationMethod)),
      skipDuplicates: true,
    });
  }

  return {
    total: rawRows.length,
    valid: valid.length,
    inserted: newRows.length,
    duplicate: rawRows.length - invalid.length - newRows.length,
    invalid,
  };
}

export async function getBankStatus() {
  const [verified, total, difficulty, source, needsReview, needsVisual] = await Promise.all([
    db.bankQuestion.groupBy({ by: ["subject", "chapter"], where: { qualityStatus: "VERIFIED_STRICT", verified: true }, _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter"], _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter", "difficulty"], where: { qualityStatus: "VERIFIED_STRICT", verified: true }, _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter", "source"], where: { qualityStatus: "VERIFIED_STRICT", verified: true }, _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter"], where: { qualityStatus: "NEEDS_REVIEW" }, _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter"], where: { qualityStatus: "NEEDS_VISUAL_ASSET" }, _count: { _all: true } }),
  ]);
  const verifiedMap = new Map(verified.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));
  const totalMap = new Map(total.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));
  const reviewMap = new Map(needsReview.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));
  const visualMap = new Map(needsVisual.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));

  return CHAPTERS.map((chapter) => {
    const key = `${chapter.subject}::${chapter.chapter}`;
    const difficultyRows = difficulty.filter((row) => row.subject === chapter.subject && row.chapter === chapter.chapter);
    const sourceRows = source.filter((row) => row.subject === chapter.subject && row.chapter === chapter.chapter);
    return {
      subject: chapter.subject,
      classLevel: chapter.classLevel,
      chapter: chapter.chapter,
      quota: BANK_CHAPTER_QUOTA,
      verified: verifiedMap.get(key) ?? 0,
      total: totalMap.get(key) ?? 0,
      needsReview: reviewMap.get(key) ?? 0,
      needsVisualAsset: visualMap.get(key) ?? 0,
      difficulty: {
        EASY: difficultyRows.find((row) => row.difficulty === "EASY")?._count._all ?? 0,
        MODERATE: difficultyRows.find((row) => row.difficulty === "MODERATE")?._count._all ?? 0,
        TOUGH: difficultyRows.find((row) => row.difficulty === "TOUGH")?._count._all ?? 0,
      },
      source: Object.fromEntries(sourceRows.map((row) => [row.source, row._count._all])),
    };
  });
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function splitEvenly(total: number, buckets: PracticeSubjectSlug[]) {
  const base = Math.floor(total / buckets.length);
  let remainder = total % buckets.length;
  return buckets.map((bucket) => ({ bucket, count: base + (remainder-- > 0 ? 1 : 0) }));
}

function splitDifficulty(total: number, difficulty: "MIXED" | PracticeDifficulty) {
  const ratios: Record<"MIXED" | PracticeDifficulty, [number, number, number]> = {
    MIXED: [0.3, 0.45, 0.25],
    EASY: [0.6, 0.3, 0.1],
    MODERATE: [0.2, 0.6, 0.2],
    TOUGH: [0.1, 0.3, 0.6],
  };
  const [easyRatio, moderateRatio] = ratios[difficulty];
  const easy = Math.floor(total * easyRatio);
  const moderate = Math.floor(total * moderateRatio);
  return [
    { difficulty: "EASY" as const, count: easy },
    { difficulty: "MODERATE" as const, count: moderate },
    { difficulty: "TOUGH" as const, count: total - easy - moderate },
  ].filter((entry) => entry.count > 0);
}

function bankRowToPracticeQuestion(row: BankQuestion, questionNumber: number): PracticeQuestion {
  const options = Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : [];
  return {
    id: `q${questionNumber}`,
    bankId: row.id,
    subject: row.subject,
    chapter: row.chapter,
    topic: row.topic,
    source: row.source as PracticeSource,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty as PracticeDifficulty,
    question: cleanQuestionText(row.question),
    options,
    correctIndex: row.correctIndex,
    explanation: cleanQuestionText(row.explanation),
    optionExplanations: Array.isArray(row.optionExplanationsJson) ? cleanQuestionOptions(row.optionExplanationsJson) : [],
    verified: row.qualityStatus === "VERIFIED_STRICT" && row.verified,
    visualAssetUrl: row.visualAssetUrl ?? null,
    visualAssetAlt: row.visualAssetAlt ?? null,
    visualAssetKind: row.visualAssetKind ?? null,
    visualMeta: row.visualMetaJson ?? null,
  };
}

function bankQualityRank(row: BankQuestion) {
  if (row.qualityStatus === "VERIFIED_STRICT") return 0;
  if (row.verified) return 1;
  if (row.qualityStatus === "NEEDS_REVIEW") return 3;
  return 2;
}

function isLowQualityQuestionText(question: string) {
  return (
    isPlaceholderText(question) ||
    /\b(?:table|item|case)\s+\d{3}-\d{2}\b/i.test(question) ||
    /^\s*Assertion-Reason\s+\d{3}-\d{2}\s*:/i.test(question) ||
    /\b(?:Table\/matching item|Lengthy case)\s+\d+-\d+\b/i.test(question)
  );
}

export function isStrictlyServeableBankRow(row: BankQuestion) {
  if (row.qualityStatus !== "VERIFIED_STRICT" || !row.verified) return false;
  const options = Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : [];
  if (options.length !== 4 || options.some((option) => isPlaceholderText(option))) return false;
  const caseSensitiveOptions = /scientific\s+name|binomial\s+nomenclature|correctly\s+written/i.test(row.question);
  const normalizedOptions = options.map((option) => {
    const normalized = option.replace(/\s+/g, " ").trim();
    return caseSensitiveOptions ? normalized : normalized.toLocaleLowerCase();
  });
  if (new Set(normalizedOptions).size !== 4 || options.some(hasUnreadableText)) return false;
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) return false;
  const question = cleanQuestionText(row.question);
  const explanation = cleanQuestionText(row.explanation);
  const optionExplanations = Array.isArray(row.optionExplanationsJson)
    ? cleanQuestionOptions(row.optionExplanationsJson)
    : [];
  if (isLowQualityQuestionText(question) || hasUnreadableText(question)) return false;
  if (isPlaceholderText(explanation) || hasUnreadableText(explanation)) return false;
  if (optionExplanations.length !== 4 || optionExplanations.some((entry) => isPlaceholderText(entry) || hasUnreadableText(entry))) return false;
  if ((row.isDiagramBased || row.isGraphBased || row.visualAssetKind) && !row.visualAssetUrl) return false;
  return true;
}

function pushWarning(audit: BankAssemblyAudit | undefined, warning: string) {
  if (!audit || audit.warnings.includes(warning)) return;
  audit.warnings.push(warning);
}

function sourceWhereForRequest(request: { mode: BankAssemblyRequest["mode"] }) {
  if (request.mode === "PYQ_YEAR") return "NEET_PYQ";
  // Academic provenance is not itself a quality decision. Normal tests may use
  // AI-origin rows only after the independent academic pipeline has promoted
  // them to VERIFIED_STRICT; baseWhere below enforces that gate. PYQ remains
  // official-only, and full NEET mocks continue to exclude JEE paper rows.
  if (request.mode === "FULL_LENGTH") return { not: "JEE_PYQ" };
  return undefined;
}

function subjectChapterCap(subject: NeetSubject, requestedSubjectCount: number) {
  const baseCap = subject === "Physics" || subject === "Chemistry" ? 4 : 6;
  return Math.max(1, Math.ceil((baseCap * Math.max(requestedSubjectCount, 1)) / 45));
}

type BankSelectionState = { exclude: Set<string>; duplicateClusters: Set<string> };

async function duplicateClustersForBankIds(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db.bankQuestion.findMany({
    where: { id: { in: ids }, duplicateClusterId: { not: null } },
    select: { duplicateClusterId: true },
  });
  return new Set(rows.map((row) => row.duplicateClusterId).filter((cluster): cluster is string => Boolean(cluster)));
}

function selectionPivot(seed: string, subject: NeetSubject) {
  return createHash("sha256").update(`${seed}:${subject}`).digest("hex");
}

function takeFromCandidatePool(
  pool: BankQuestion[],
  requested: number,
  state: BankSelectionState,
  predicate: (row: BankQuestion) => boolean = () => true,
) {
  const picked: BankQuestion[] = [];
  if (requested <= 0) return picked;
  for (const row of pool) {
    if (picked.length >= requested) break;
    if (state.exclude.has(row.id) || !predicate(row)) continue;
    const cluster = row.duplicateClusterId;
    if (cluster && state.duplicateClusters.has(cluster)) continue;
    picked.push(row);
    state.exclude.add(row.id);
    if (cluster) state.duplicateClusters.add(cluster);
  }
  return picked;
}

async function loadSeededSubjectPool(options: {
  subject: NeetSubject;
  classLevel?: string | null;
  requestedSubjectCount: number;
  request: BankAssemblyRequest;
}) {
  const pivot = selectionPivot(options.request.testSeed || "practice-default", options.subject);
  // A full bank row carries the question, options, solution, and four option
  // rationales. Keeping this seeded window compact cuts network transfer while
  // still leaving an 8x candidate pool for a 45-question subject section.
  const take = Math.min(4000, Math.max(320, options.requestedSubjectCount * 8));
  const baseWhere: Prisma.BankQuestionWhereInput = {
    qualityStatus: "VERIFIED_STRICT",
    verified: true,
    subject: options.subject,
    classLevel: options.classLevel ?? undefined,
    source: sourceWhereForRequest(options.request),
    selectionKey: { not: null },
  };
  const afterPivot = await db.bankQuestion.findMany({
    where: { ...baseWhere, selectionKey: { gte: pivot } },
    orderBy: { selectionKey: "asc" },
    take,
  });
  const beforePivot = afterPivot.length < take
    ? await db.bankQuestion.findMany({
        where: { ...baseWhere, selectionKey: { lt: pivot } },
        orderBy: { selectionKey: "asc" },
        take: take - afterPivot.length,
      })
    : [];
  const unique = new Map<string, BankQuestion>();
  for (const row of [...afterPivot, ...beforePivot]) {
    if (isStrictlyServeableBankRow(row)) unique.set(row.id, row);
  }
  return [...unique.values()].sort((a, b) => a.timesServed - b.timesServed);
}

function fillSubjectShortfallFromPool(options: {
  subject: NeetSubject;
  requestedSubjectCount: number;
  desiredCount: number;
  selected: BankQuestion[];
  pool: BankQuestion[];
  state: BankSelectionState;
  audit?: BankAssemblyAudit;
}) {
  const picked: BankQuestion[] = [];
  const cap = subjectChapterCap(options.subject, options.requestedSubjectCount);
  const counts = new Map<string, number>();
  for (const row of options.selected) {
    if (row.subject !== options.subject) continue;
    counts.set(row.chapter, (counts.get(row.chapter) ?? 0) + 1);
  }
  for (const row of options.pool) {
    if (picked.length >= options.desiredCount) break;
    if ((counts.get(row.chapter) ?? 0) >= cap) continue;
    const next = takeFromCandidatePool([row], 1, options.state);
    if (!next.length) continue;
    picked.push(row);
    counts.set(row.chapter, (counts.get(row.chapter) ?? 0) + 1);
  }

  if (picked.length < options.desiredCount) {
    const remaining = options.desiredCount - picked.length;
    const overflow = takeFromCandidatePool(options.pool, remaining, options.state);
    picked.push(...overflow);
    if (overflow.length) {
      pushWarning(options.audit, `${options.subject} fallback exceeded chapter cap for ${overflow.length} question(s) due to bank shortage.`);
    }
  }

  return picked.slice(0, options.desiredCount);
}

async function assembleTrendQuestions(
  request: BankAssemblyRequest,
  subjects: PracticeSubjectSlug[],
  audit?: BankAssemblyAudit,
) {
  const selected: BankQuestion[] = [];
  const excludedBankIds = request.excludeBankIds ?? [];
  const state = {
    exclude: new Set(excludedBankIds),
    duplicateClusters: await duplicateClustersForBankIds(excludedBankIds),
  };
  const plan = buildTrendAssemblyPlan({
    mode: request.mode,
    subjects,
    classLevel: request.classLevel === "11" || request.classLevel === "12" ? request.classLevel : null,
    questionCount: request.questionCount,
    desiredCount: request.desiredCount,
    existingQuestions: request.existingQuestions,
    seed: request.testSeed,
  });

  if (audit) {
    audit.blueprintVersion = plan.blueprintVersion;
    audit.paperTemplate = plan.paperTemplate;
    audit.warnings.push(...plan.warnings);
  }

  const subjectPools = new Map<NeetSubject, BankQuestion[]>();
  const loadedPools = await Promise.all(
    plan.subjects.map(async (subjectQuota) => ({
      subject: subjectQuota.subject,
      rows: await loadSeededSubjectPool({
        subject: subjectQuota.subject,
        classLevel: request.classLevel,
        requestedSubjectCount: subjectQuota.count,
        request,
      }),
    })),
  );
  for (const loaded of loadedPools) subjectPools.set(loaded.subject, loaded.rows);

  for (const subjectQuota of plan.subjects) {
    const pool = subjectPools.get(subjectQuota.subject) ?? [];
    let subjectPicked = 0;
    for (const chapterQuota of subjectQuota.chapters) {
      let chapterPicked = 0;
      for (const diffBucket of splitDifficulty(chapterQuota.count, request.difficulty)) {
        let picked = takeFromCandidatePool(
          pool,
          diffBucket.count,
          state,
          (row) => row.chapter === chapterQuota.chapter && row.difficulty === diffBucket.difficulty,
        );
        if (picked.length < diffBucket.count) {
          const shortfall = diffBucket.count - picked.length;
          const fallback = takeFromCandidatePool(pool, shortfall, state, (row) => row.chapter === chapterQuota.chapter);
          picked = [...picked, ...fallback];
          if (fallback.length < shortfall) {
            pushWarning(audit, `${subjectQuota.subject}/${chapterQuota.chapter} short by ${shortfall - fallback.length} after same-chapter fallback.`);
          }
        }
        selected.push(...picked);
        chapterPicked += picked.length;
        subjectPicked += picked.length;
      }
      audit?.quotas.push({
        subject: subjectQuota.subject,
        chapter: chapterQuota.chapter,
        classLevel: chapterQuota.classLevel,
        requested: chapterQuota.count,
        selected: chapterPicked,
        trendChapterIds: chapterQuota.trendChapterIds,
      });
    }

    const subjectShortfall = subjectQuota.count - subjectPicked;
    if (subjectShortfall > 0) {
      const fallback = fillSubjectShortfallFromPool(
        {
          subject: subjectQuota.subject,
          requestedSubjectCount: subjectQuota.count,
          desiredCount: subjectShortfall,
          selected,
          pool,
          state,
          audit,
        },
      );
      selected.push(...fallback);
      audit?.quotas.push({
        subject: subjectQuota.subject,
        classLevel: request.classLevel ?? null,
        requested: subjectShortfall,
        selected: fallback.length,
        fallback: true,
      });
      if (fallback.length < subjectShortfall) {
        pushWarning(audit, `${subjectQuota.subject} trend fallback short by ${subjectShortfall - fallback.length}.`);
      }
    }
  }

  if (selected.length < request.desiredCount) {
    const globalShortfall = request.desiredCount - selected.length;
    pushWarning(audit, `Strict subject quotas left ${globalShortfall} slot(s) unfilled; cross-subject substitution is disabled.`);
  }

  if (audit) audit.selected = selected.length;
  return selected.slice(0, request.desiredCount);
}

export type BankAssemblyRequest = {
  mode: "FULL_LENGTH" | "SECTIONAL" | "UNIT" | "SUBJECT" | "CHAPTER" | "TOPIC" | "PYQ_YEAR";
  subject?: PracticeSubjectSlug | null;
  subjects?: PracticeSubjectSlug[] | null;
  classLevel?: string | null;
  chapter?: string | null;
  chapters?: string[] | null;
  topic?: string | null;
  pyqYear?: string | null;
  questionCount: number;
  difficulty: "MIXED" | PracticeDifficulty;
  desiredCount: number;
  startIndex: number;
  excludeBankIds?: string[];
  existingQuestions?: PracticeQuestion[];
  testSeed?: string | null;
  audit?: BankAssemblyAudit;
};

export async function assembleQuestionsFromBank(request: BankAssemblyRequest): Promise<PracticeQuestion[]> {
  const selected: BankQuestion[] = [];
  const exclude = new Set(request.excludeBankIds ?? []);
  const duplicateClusters = await duplicateClustersForBankIds([...exclude]);
  const selectionState: BankSelectionState = { exclude, duplicateClusters };
  const subjects = request.subjects?.length
    ? request.subjects
    : request.subject
      ? [request.subject]
      : (["physics", "chemistry", "botany", "zoology"] as PracticeSubjectSlug[]);

  const audit = request.audit;
  if (audit) {
    audit.mode = request.mode;
    audit.requested = request.desiredCount;
  }

  if (request.mode === "PYQ_YEAR") {
    const examYear = Number(request.pyqYear);
    if (!Number.isInteger(examYear)) {
      pushWarning(audit, "A valid PYQ exam year is required.");
      return [];
    }
    const paperCounts = await db.bankQuestion.groupBy({
      by: ["paperCode"],
      where: {
        exam: "NEET_UG",
        examYear,
        source: "NEET_PYQ",
        qualityStatus: "VERIFIED_STRICT",
        verified: true,
        verificationMethod: "OFFICIAL_PAPER_KEY_VERIFIED",
        paperCode: { not: null },
        paperQuestionNumber: { not: null },
      },
      _count: { _all: true },
    });
    const paper = paperCounts
      .filter((entry): entry is typeof entry & { paperCode: string } => Boolean(entry.paperCode))
      .sort((a, b) => b._count._all - a._count._all || a.paperCode.localeCompare(b.paperCode))[0];
    if (!paper || paper._count._all < request.desiredCount) {
      pushWarning(audit, `No authenticated ${examYear} paper contains all ${request.desiredCount} required questions.`);
      return [];
    }
    const rows = await db.bankQuestion.findMany({
      where: {
        exam: "NEET_UG",
        examYear,
        paperCode: paper.paperCode,
        source: "NEET_PYQ",
        qualityStatus: "VERIFIED_STRICT",
        verified: true,
        verificationMethod: "OFFICIAL_PAPER_KEY_VERIFIED",
        id: exclude.size ? { notIn: [...exclude] } : undefined,
      },
      orderBy: { paperQuestionNumber: "asc" },
      take: request.desiredCount,
    });
    const serveable = rows.filter(isStrictlyServeableBankRow);
    audit?.quotas.push({ subject: `Official paper ${paper.paperCode}`, requested: request.desiredCount, selected: serveable.length });
    if (audit) audit.selected = serveable.length;
    if (serveable.length) {
      await db.bankQuestion.updateMany({
        where: { id: { in: serveable.map((row) => row.id) } },
        data: { timesServed: { increment: 1 }, lastServedAt: new Date() },
      });
    }
    return serveable.map((row, index) => bankRowToPracticeQuestion(row, request.startIndex + index + 1));
  }

  if (shouldUseTrendAssembly(request)) {
    const trendSelected = await assembleTrendQuestions(request, subjects, audit);
    if (trendSelected.length) {
      await db.bankQuestion.updateMany({
        where: { id: { in: trendSelected.map((row) => row.id) } },
        data: { timesServed: { increment: 1 }, lastServedAt: new Date() },
      });
    }
    return trendSelected.map((row, index) => bankRowToPracticeQuestion(row, request.startIndex + index + 1));
  }

  for (const subjectBucket of splitEvenly(request.desiredCount, subjects)) {
    const subject = SUBJECT_NAMES[subjectBucket.bucket];
    const chapterEntries = (request.chapters?.length ? request.chapters : request.chapter ? [request.chapter] : [])
      .map((chapter) => canonicalizeChapter(subject, chapter))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const subjectStart = selected.length;
    for (const diffBucket of splitDifficulty(subjectBucket.count, request.difficulty)) {
      const where: Prisma.BankQuestionWhereInput = {
        qualityStatus: "VERIFIED_STRICT",
        verified: true,
        subject,
        classLevel: request.classLevel ?? undefined,
        difficulty: diffBucket.difficulty,
        id: exclude.size ? { notIn: [...exclude] } : undefined,
        chapter: chapterEntries.length ? { in: chapterEntries.map((entry) => entry.chapter) } : undefined,
        topic: request.topic ?? undefined,
        source: sourceWhereForRequest(request),
      };
      const pool = await db.bankQuestion.findMany({
        where,
        orderBy: [{ timesServed: "asc" }, { lastServedAt: "asc" }, { createdAt: "asc" }],
        // Variant-heavy imports can place many members of one verified family
        // next to each other. Fetch a wider window so cluster de-duplication
        // still has enough distinct concepts to satisfy the requested bucket.
        take: Math.min(4000, Math.max(diffBucket.count * 40, 400)),
      });
      const orderedPool = shuffle(pool.filter((row) => isStrictlyServeableBankRow(row)))
        .sort((a, b) => bankQualityRank(a) - bankQualityRank(b) || a.timesServed - b.timesServed);
      const picked = takeFromCandidatePool(orderedPool, diffBucket.count, selectionState);
      selected.push(...picked);
      audit?.quotas.push({
        subject,
        requested: diffBucket.count,
        selected: picked.length,
        classLevel: request.classLevel ?? null,
        chapter: chapterEntries.length ? chapterEntries.map((entry) => entry.chapter).join(", ") : undefined,
      });
    }

    // MIXED describes a target blend, not permission to leave the paper short.
    // Backfill only inside the same selected subject/class/chapter scope; never
    // cross into an unselected chapter or another subject.
    const subjectSelected = selected.length - subjectStart;
    if (request.difficulty === "MIXED" && subjectSelected < subjectBucket.count) {
      const shortfall = subjectBucket.count - subjectSelected;
      const fallbackPool = await db.bankQuestion.findMany({
        where: {
          qualityStatus: "VERIFIED_STRICT",
          verified: true,
          subject,
          classLevel: request.classLevel ?? undefined,
          id: exclude.size ? { notIn: [...exclude] } : undefined,
          chapter: chapterEntries.length ? { in: chapterEntries.map((entry) => entry.chapter) } : undefined,
          topic: request.topic ?? undefined,
          source: sourceWhereForRequest(request),
        },
        orderBy: [{ timesServed: "asc" }, { lastServedAt: "asc" }, { createdAt: "asc" }],
        take: Math.min(4000, Math.max(shortfall * 40, 400)),
      });
      const orderedFallbackPool = shuffle(fallbackPool.filter((row) => isStrictlyServeableBankRow(row)))
        .sort((a, b) => bankQualityRank(a) - bankQualityRank(b) || a.timesServed - b.timesServed);
      const fallback = takeFromCandidatePool(orderedFallbackPool, shortfall, selectionState);
      selected.push(...fallback);
      audit?.quotas.push({
        subject,
        requested: shortfall,
        selected: fallback.length,
        classLevel: request.classLevel ?? null,
        chapter: chapterEntries.length ? chapterEntries.map((entry) => entry.chapter).join(", ") : undefined,
        fallback: true,
      });
      if (fallback.length < shortfall) {
        pushWarning(audit, `${subject} selected scope is short by ${shortfall - fallback.length} strict question(s).`);
      }
    }
  }

  if (selected.length) {
    await db.bankQuestion.updateMany({
      where: { id: { in: selected.map((row) => row.id) } },
      data: { timesServed: { increment: 1 }, lastServedAt: new Date() },
    });
  }

  if (audit) audit.selected = selected.length;

  return selected.map((row, index) => bankRowToPracticeQuestion(row, request.startIndex + index + 1));
}

export async function writeBackBankStats(questions: PracticeQuestion[], answerMap: Map<string, number | null>) {
  const withBankIds = questions.filter((question) => question.bankId);
  await Promise.all(
    withBankIds.map((question) => {
      const chosen = answerMap.get(question.id);
      if (chosen === null || chosen === undefined) return Promise.resolve();
      return db.bankQuestion.update({
        where: { id: question.bankId },
        data: chosen === question.correctIndex ? { timesCorrect: { increment: 1 } } : { timesWrong: { increment: 1 } },
      });
    }),
  );
}

function bankRowToValidated(row: BankQuestion): ValidatedBankQuestion {
  const options = Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : [];
  return {
    subject: row.subject as NeetSubject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    topic: row.topic,
    source: row.source as BankSource,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty as PracticeDifficulty,
    question: cleanQuestionText(row.question),
    options,
    correctIndex: row.correctIndex,
    explanation: cleanQuestionText(row.explanation),
    optionExplanations: Array.isArray(row.optionExplanationsJson) ? cleanQuestionOptions(row.optionExplanationsJson) : [],
    verified: row.verified,
    contentHash: row.contentHash,
  };
}

export async function verifyBankQuestions(questions: ValidatedBankQuestion[]) {
  if (!questions.length) return { kept: [], verified: 0, unverified: 0, rejected: 0, model: null as string | null };
  const payload = questions.map((question, index) => ({
    id: `q${index + 1}`,
    subject: question.subject,
    question: question.question,
    options: question.options,
  }));
  const result = await chatWithAI(
    [
      {
        role: "system",
        content: "You are an expert NEET examiner solving questions independently. Respond only with valid JSON. Never include markdown fences.",
      },
      {
        role: "user",
        content: `Solve each MCQ below independently and carefully. Respond with a JSON array: [{ "id": "q1", "answerIndex": 0-3, "confident": true|false }]. Set confident=false if the question is ambiguous, has no single correct option, or you are unsure.\n\n${JSON.stringify(payload)}`,
      },
    ],
    2400,
    0.1,
    BANK_AI_TIMEOUT_MS,
    BANK_AI_MODELS,
  );
  const solved = extractJsonArray<{ id: string; answerIndex: number; confident?: boolean }>(result.content) ?? [];
  const solvedMap = new Map(solved.map((entry) => [String(entry.id), entry]));
  const kept: ValidatedBankQuestion[] = [];
  let verified = 0;
  let unverified = 0;
  let rejected = 0;
  questions.forEach((question, index) => {
    const solution = solvedMap.get(`q${index + 1}`);
    if (!solution) {
      rejected += 1;
      return;
    }
    const agrees = Number(solution.answerIndex) === question.correctIndex;
    if (agrees && solution.confident !== false) {
      verified += 1;
      kept.push({ ...question, verified: true });
    } else if (agrees) {
      unverified += 1;
      kept.push({ ...question, verified: false });
    } else {
      rejected += 1;
    }
  });
  return { kept, verified, unverified, rejected, model: result.model };
}

export async function verifyUnverifiedBankQuestions(limit = 8) {
  const rows = await db.bankQuestion.findMany({ where: { verified: false }, orderBy: { createdAt: "asc" }, take: limit });
  const verification = await verifyBankQuestions(rows.map(bankRowToValidated));
  const keepHashes = new Set(verification.kept.map((row) => row.contentHash));
  const verifiedHashes = new Set(verification.kept.filter((row) => row.verified).map((row) => row.contentHash));
  const deleted = rows.filter((row) => !keepHashes.has(row.contentHash));
  if (verifiedHashes.size) {
    await db.bankQuestion.updateMany({ where: { contentHash: { in: [...verifiedHashes] } }, data: { verified: true } });
  }
  if (deleted.length) {
    await db.bankQuestion.deleteMany({ where: { id: { in: deleted.map((row) => row.id) } } });
  }
  return { checked: rows.length, verified: verifiedHashes.size, deleted };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fillLimit(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.round(numeric)) : fallback;
}

function chapterKey(subject: string, chapter: string) {
  return `${subject}::${chapter}`;
}

function subjectDisplayFromInput(input: unknown): NeetSubject | null {
  const text = String(input ?? "").trim();
  if (!text) return null;
  return normalizeSubject(text);
}

async function pickFillTargets(options: FillQuestionBankOptions) {
  const subject = subjectDisplayFromInput(options.subject);
  const explicitChapter = String(options.chapter ?? "").trim();
  if (subject && explicitChapter) {
    const canonical = canonicalizeChapter(subject, explicitChapter);
    if (!canonical) throw new Error(`Chapter "${explicitChapter}" is not canonicalizable for ${subject}`);
    return [canonical];
  }

  const strictCounts = await db.bankQuestion.groupBy({
    by: ["subject", "chapter"],
    where: { qualityStatus: "VERIFIED_STRICT", verified: true },
    _count: { _all: true },
  });
  const countMap = new Map(strictCounts.map((row) => [chapterKey(row.subject, row.chapter), row._count._all]));
  const candidates = CHAPTERS.filter((entry) => !subject || entry.subject === subject);
  return candidates.sort((a, b) => {
    const aCount = countMap.get(chapterKey(a.subject, a.chapter)) ?? 0;
    const bCount = countMap.get(chapterKey(b.subject, b.chapter)) ?? 0;
    return aCount / BANK_CHAPTER_QUOTA - bCount / BANK_CHAPTER_QUOTA || a.subject.localeCompare(b.subject) || a.chapter.localeCompare(b.chapter);
  });
}

function buildBankGenerationPrompt(target: { subject: NeetSubject; classLevel: string; chapter: string }, count: number, avoidStems: string[]) {
  return [
    "Produce original NEET UG single-correct MCQs for a strict question bank.",
    "Respond with a valid JSON array only. Begin your reply with '['. Do not include planning notes, markdown fences, or explanations outside JSON.",
    `Subject: ${target.subject}. Class: ${target.classLevel}. Chapter: "${target.chapter}". Stay strictly inside this NCERT chapter.`,
    `Produce EXACTLY ${count} questions. Use current NEET UG standard: NCERT-grounded, single-correct, assertion/reason, statement, match/list and calculation traps where natural. Do not claim a question is a real PYQ unless you are reproducing it exactly; prefer source "AI" or "INSTITUTE".`,
    `Required JSON object keys: subject, classLevel, chapter, topic, source, sourceRef, difficulty, questionForm, question, options, correctIndex, explanation, optionExplanations.`,
    `Allowed source values: AI, INSTITUTE, NCERT, PLATFORM. Allowed difficulty values: EASY, MODERATE, TOUGH. options must be exactly four strings and exactly one option must be correct.`,
    `Use LaTeX inline math for physics/chemistry. explanation must show the complete solution or governing concept. For every non-numerical question, optionExplanations must contain exactly four concise entries explaining why each option is correct or incorrect; for numerical questions it may be an empty array when the worked solution already disproves the distractors. Keep stems under 110 words and options under 22 words. If a graph/table/diagram is required, describe all needed data in text; never write "as shown in figure" unless an actual visual asset URL is provided.`,
    `Quality bar: no vague coaching filler, no copied-looking placeholders, no more than one correct option, no "all of these" unless it is the only defensible answer, and every distractor must test a real NEET misconception.`,
    avoidStems.length ? `Do not repeat these stems:\n${avoidStems.map((stem) => `- ${stem.slice(0, 90).replace(/\s+/g, " ")}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function recentChapterStems(subject: NeetSubject, chapter: string) {
  const rows = await db.bankQuestion.findMany({
    where: { subject, chapter },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: { question: true },
  });
  return rows.map((row) => cleanQuestionText(row.question));
}

type BlindSolve = { id?: unknown; answerIndex?: unknown; confident?: unknown; ambiguous?: unknown };
type StrictCritique = {
  id?: unknown;
  valid?: unknown;
  syllabusAligned?: unknown;
  explanationCorrect?: unknown;
  distractorsPlausible?: unknown;
  optionExplanationsAccurate?: unknown;
  numerical?: unknown;
  difficulty?: unknown;
  reason?: unknown;
};

async function solveBlindForStrictCheck(questions: ValidatedBankQuestion[], models: string[]) {
  const payload = questions.map((question, index) => ({
    id: `q${index + 1}`,
    subject: question.subject,
    chapter: question.chapter,
    question: question.question,
    options: question.options,
    visualSpec: question.visualMetaJson ?? null,
  }));
  const result = await chatWithAI(
    [
      {
        role: "system",
        content: "You are a senior NEET UG examiner. Solve independently. Respond only with a valid JSON array. Never include markdown fences.",
      },
      {
        role: "user",
        content: `Blind-solve each single-correct MCQ. Do not trust any stored key. Return [{ "id": "q1", "answerIndex": 0-3, "confident": true|false, "ambiguous": true|false }]. Set confident=false or ambiguous=true if wording is invalid, data is missing, or more than one option fits.\n\n${JSON.stringify(payload)}`,
      },
    ],
    3200,
    0.05,
    BANK_AI_TIMEOUT_MS,
    models,
  );
  return {
    model: result.model,
    solved: extractJsonArray<BlindSolve>(result.content) ?? [],
  };
}

function isConfidentSolve(entry: BlindSolve | undefined) {
  const answerIndex = Number(entry?.answerIndex);
  return entry?.confident !== false && entry?.ambiguous !== true && Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3;
}

async function critiqueForStrictCheck(
  questions: Array<{ id: string; question: ValidatedBankQuestion; consensusAnswer: number }>,
) {
  const payload = questions.map(({ id, question, consensusAnswer }) => ({
    id,
    subject: question.subject,
    classLevel: question.classLevel,
    chapter: question.chapter,
    difficulty: question.difficulty,
    question: question.question,
    options: question.options,
    consensusAnswer,
    explanation: question.explanation,
    optionExplanations: question.optionExplanations,
    visualSpec: question.visualMetaJson ?? null,
  }));
  const result = await chatWithAI(
    [
      {
        role: "system",
        content: "You are a meticulous NEET UG/JEE Main science assessment editor. Audit independently and reject any questionable item. Return only a valid JSON array.",
      },
      {
        role: "user",
        content: `Audit every candidate. Physics and Chemistry may reach JEE Main conceptual/calculation toughness but must stay within the stated NEET/NCERT syllabus; Biology must be NCERT-faithful. Return [{ "id":"q1", "valid":true|false, "syllabusAligned":true|false, "explanationCorrect":true|false, "distractorsPlausible":true|false, "optionExplanationsAccurate":true|false, "numerical":true|false, "difficulty":"EASY|MODERATE|TOUGH", "reason":"brief" }]. Mark valid=false for ambiguity, multiple/no correct options, missing data, factual error, giveaway or duplicate options, implausible distractors, or a misleading explanation. For non-numerical items, require four option explanations that justify the correct choice and reject each distractor.\n\n${JSON.stringify(payload)}`,
      },
    ],
    4200,
    0.05,
    BANK_AI_TIMEOUT_MS,
    BANK_SECOND_PASS_MODELS,
  );
  return { model: result.model, critiques: extractJsonArray<StrictCritique>(result.content) ?? [] };
}

async function strictVerifyGeneratedQuestions(questions: ValidatedBankQuestion[]) {
  if (!questions.length) return { kept: [] as ValidatedBankQuestion[], rejected: 0, models: [] as string[] };
  const first = await solveBlindForStrictCheck(questions, BANK_MODELS);
  await sleep(400);
  const second = await solveBlindForStrictCheck(questions, BANK_SECOND_PASS_MODELS);
  const firstMap = new Map(first.solved.map((entry) => [String(entry.id), entry]));
  const secondMap = new Map(second.solved.map((entry) => [String(entry.id), entry]));

  const consensus: Array<{ id: string; question: ValidatedBankQuestion; consensusAnswer: number }> = [];
  questions.forEach((question, index) => {
    const id = `q${index + 1}`;
    const a = firstMap.get(id);
    const b = secondMap.get(id);
    if (!isConfidentSolve(a) || !isConfidentSolve(b)) return;
    const firstAnswer = Number(a?.answerIndex);
    const secondAnswer = Number(b?.answerIndex);
    if (firstAnswer === secondAnswer) consensus.push({ id, question, consensusAnswer: firstAnswer });
  });
  const critic = consensus.length ? await critiqueForStrictCheck(consensus) : { model: "", critiques: [] as StrictCritique[] };
  const criticMap = new Map(critic.critiques.map((entry) => [String(entry.id), entry]));

  const kept: ValidatedBankQuestion[] = [];
  let rejected = 0;

  questions.forEach((question, index) => {
    const id = `q${index + 1}`;
    const a = firstMap.get(id);
    const b = secondMap.get(id);
    if (!isConfidentSolve(a) || !isConfidentSolve(b)) {
      rejected += 1;
      return;
    }
    const firstAnswer = Number(a?.answerIndex);
    const secondAnswer = Number(b?.answerIndex);
    if (firstAnswer !== secondAnswer) {
      rejected += 1;
      return;
    }
    const critique = criticMap.get(id);
    const criticPass =
      critique?.valid === true &&
      critique?.syllabusAligned === true &&
      critique?.explanationCorrect === true &&
      critique?.distractorsPlausible === true &&
      critique?.optionExplanationsAccurate === true;
    const hasRequiredOptionRationales = critique?.numerical === true || question.optionExplanations.length === 4;
    if (!criticPass || !hasRequiredOptionRationales) {
      rejected += 1;
      return;
    }
    const auditedDifficulty = String(critique?.difficulty ?? "").toUpperCase() as PracticeDifficulty;
    kept.push({
      ...question,
      correctIndex: firstAnswer,
      difficulty: DIFFICULTIES.has(auditedDifficulty) ? auditedDifficulty : question.difficulty,
      verified: true,
      verifierRuns: {
        method: "AUTOMATED_DOUBLE_BLIND_PLUS_CRITIC",
        version: "ai-gate-v2",
        checkedAt: new Date().toISOString(),
        generatedKey: question.correctIndex,
        first: { model: first.model, result: a },
        second: { model: second.model, result: b },
        critic: { model: critic.model, result: critique },
      },
    });
  });

  return { kept, rejected, models: [first.model, second.model, critic.model].filter(Boolean) };
}

async function generateBankCandidates(target: { subject: NeetSubject; classLevel: string; chapter: string }, count: number) {
  const avoid = await recentChapterStems(target.subject, target.chapter);
  const result = await chatWithAI(
    [
      {
        role: "system",
        content: "You are a precise NEET UG question setter. Respond only with a valid JSON array of objects.",
      },
      { role: "user", content: buildBankGenerationPrompt(target, count, avoid) },
    ],
    8000,
    0.45,
    BANK_AI_TIMEOUT_MS,
    BANK_MODELS,
  );
  const raw = extractJsonArray<RawBankQuestion>(result.content) ?? [];
  const valid: ValidatedBankQuestion[] = [];
  let invalid = 0;
  for (const row of raw) {
    const parsed = validateBankQuestion(
      {
        ...row,
        subject: target.subject,
        classLevel: target.classLevel,
        chapter: target.chapter,
        source: row.source ?? "AI",
        sourceRef: row.sourceRef ?? "Institute test-series standard",
      },
      false,
    );
    if (parsed.question) {
      valid.push({
        ...parsed.question,
        provenanceJson: {
          origin: "AI_ORIGINAL",
          generatorModel: result.model,
          generatedAt: new Date().toISOString(),
          policy: "neet-jee-main-science-v2",
        },
      });
    } else invalid += 1;
  }
  return { valid, invalid, model: result.model };
}

export async function fillQuestionBank(options: FillQuestionBankOptions = {}) {
  const requested = fillLimit(options.count ?? options.maxQuestions, 100);
  const maxQuestions = fillLimit(options.maxQuestions ?? options.count, requested);
  const timeBudgetMs = Math.max(5000, Number(options.timeBudgetMs ?? 120000));
  const startedAt = Date.now();
  const targets = await pickFillTargets(options);
  const jobs: Array<{ id: string; subject: string; chapter: string; inserted: number; rejected: number; status: string }> = [];
  const importBatch = `strict-fill-${new Date().toISOString().slice(0, 10)}`;

  let inserted = 0;
  let verifiedInserted = 0;
  let rejected = 0;
  let batches = 0;
  let lastModel: string | null = null;
  let targetIndex = 0;

  while (inserted < maxQuestions && Date.now() - startedAt < timeBudgetMs && targets.length) {
    const target = targets[targetIndex % targets.length];
    targetIndex += 1;
    const remaining = maxQuestions - inserted;
    const batchSize = Math.min(12, fillLimit(options.batchSize, 8), remaining);
    const job = await db.bankFillJob.create({
      data: {
        subject: target.subject,
        chapter: target.chapter,
        requested: batchSize,
        status: "RUNNING",
      },
    });

    try {
      const candidates = await generateBankCandidates(target, batchSize);
      lastModel = candidates.model;
      rejected += candidates.invalid;
      const verified = await strictVerifyGeneratedQuestions(candidates.valid);
      rejected += verified.rejected;
      lastModel = verified.models.filter(Boolean).join("; ") || lastModel;

      const report = await insertBankQuestions(verified.kept, {
        trusted: true,
        importBatch,
        verificationMethod: "AUTOMATED_DOUBLE_BLIND_PLUS_CRITIC",
      });
      if (verified.kept.length) {
        await db.bankQuestion.updateMany({
          where: { contentHash: { in: verified.kept.map((row) => row.contentHash) } },
          data: {
            verified: true,
            qualityStatus: "VERIFIED_STRICT",
            qualityScore: 0.98,
            verifiedAt: new Date(),
            verifierModel: lastModel,
            verificationMethod: "AUTOMATED_DOUBLE_BLIND_PLUS_CRITIC",
            verificationVersion: "ai-gate-v2",
            rejectReason: null,
          },
        });
      }

      inserted += report.inserted;
      verifiedInserted += report.inserted;
      batches += 1;
      await db.bankFillJob.update({
        where: { id: job.id },
        data: {
          inserted: report.inserted,
          rejected: candidates.invalid + verified.rejected + report.duplicate,
          status: "DONE",
          model: lastModel,
        },
      });
      jobs.push({ id: job.id, subject: target.subject, chapter: target.chapter, inserted: report.inserted, rejected: candidates.invalid + verified.rejected + report.duplicate, status: "DONE" });
    } catch (error) {
      await db.bankFillJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000),
          model: lastModel,
        },
      });
      jobs.push({ id: job.id, subject: target.subject, chapter: target.chapter, inserted: 0, rejected: batchSize, status: "FAILED" });
      rejected += batchSize;
      if (String(error).includes("RATE_LIMITED") || /429|503|quota/i.test(String(error))) break;
    }

    if (inserted >= requested && !options.all) break;
    if (Date.now() - startedAt + 1500 < timeBudgetMs) await sleep(1200);
  }

  return {
    requested: Math.min(requested, maxQuestions),
    inserted,
    verifiedInserted,
    rejected,
    batches,
    jobs,
    model: lastModel,
    strictOnly: true,
  };
}

type ExistingQuestionEnrichment = {
  id?: unknown;
  correctIndex?: unknown;
  difficulty?: unknown;
  explanation?: unknown;
  optionExplanations?: unknown;
};

async function enrichExistingQuestionBatch(rows: BankQuestion[]) {
  const payload = rows.map((row, index) => ({
    id: `q${index + 1}`,
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    difficulty: row.difficulty,
    question: cleanQuestionText(row.question),
    options: Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : [],
  }));
  const result = await chatWithAI(
    [
      {
        role: "system",
        content: "You are a senior NEET UG solution editor. Work from first principles, do not trust stored answer keys, and return only a valid JSON array.",
      },
      {
        role: "user",
        content: `Solve and enrich each existing MCQ without changing its stem or options. Physics/Chemistry may be JEE Main toughness while remaining inside NEET syllabus; Biology must remain NCERT-faithful. Return [{ "id":"q1", "correctIndex":0, "difficulty":"EASY|MODERATE|TOUGH", "explanation":"complete worked solution or concept", "optionExplanations":["why A is correct/incorrect","why B is correct/incorrect","why C is correct/incorrect","why D is correct/incorrect"] }]. Always provide exactly four specific option explanations, including for numerical questions. If an item is impossible or ambiguous, omit it.\n\n${JSON.stringify(payload)}`,
      },
    ],
    6200,
    0.1,
    BANK_AI_TIMEOUT_MS,
    BANK_MODELS,
  );
  return { model: result.model, rows: extractJsonArray<ExistingQuestionEnrichment>(result.content) ?? [] };
}

export async function upgradeQuestionBankToAutomatedV2(options: UpgradeQuestionBankOptions = {}) {
  const limit = Math.max(1, Math.min(10_000, Math.round(options.limit ?? 100)));
  const batchSize = Math.max(1, Math.min(12, Math.round(options.batchSize ?? 6)));
  const delayMs = Math.max(0, Math.round(options.delayMs ?? 800));
  const statuses = options.statuses?.length ? options.statuses : ["VERIFIED_STRICT", "UNVERIFIED", "NEEDS_REVIEW"];
  const rows = await db.bankQuestion.findMany({
    where: {
      qualityStatus: { in: statuses },
      OR: [{ verificationVersion: null }, { verificationVersion: { not: "ai-gate-v2" } }],
      isDiagramBased: false,
      isGraphBased: false,
    },
    orderBy: [{ verified: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  let upgraded = 0;
  let needsReview = 0;
  let malformed = 0;
  let batches = 0;
  const models = new Set<string>();

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const structurallyValid = batch.filter((row) => {
      const choices = Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : [];
      const normalized = choices.map((choice) => choice.toLocaleLowerCase().replace(/\s+/g, " ").trim());
      return choices.length === 4 && new Set(normalized).size === 4 && !isLowQualityQuestionText(cleanQuestionText(row.question));
    });
    malformed += batch.length - structurallyValid.length;
    const enrichment = structurallyValid.length ? await enrichExistingQuestionBatch(structurallyValid) : { model: "", rows: [] as ExistingQuestionEnrichment[] };
    if (enrichment.model) models.add(enrichment.model);
    const enrichmentMap = new Map(enrichment.rows.map((entry) => [String(entry.id), entry]));
    const candidates: ValidatedBankQuestion[] = [];

    structurallyValid.forEach((row, index) => {
      const enriched = enrichmentMap.get(`q${index + 1}`);
      const parsed = validateBankQuestion({
        subject: row.subject,
        classLevel: row.classLevel,
        chapter: row.chapter,
        topic: row.topic,
        source: row.source,
        sourceRef: row.sourceRef,
        difficulty: enriched?.difficulty ?? row.difficulty,
        question: row.question,
        options: row.optionsJson,
        correctIndex: enriched?.correctIndex,
        explanation: enriched?.explanation,
        optionExplanations: enriched?.optionExplanations,
        verified: false,
      });
      if (!parsed.question || parsed.question.optionExplanations.length !== 4) return;
      candidates.push(parsed.question);
    });

    const checked = await strictVerifyGeneratedQuestions(candidates);
    checked.models.forEach((model) => models.add(model));
    const passing = new Map(checked.kept.map((question) => [question.contentHash, question]));

    for (const row of batch) {
      const question = passing.get(row.contentHash);
      if (question) {
        upgraded += 1;
        if (!options.dryRun) {
          await db.bankQuestion.update({
            where: { id: row.id },
            data: {
              correctIndex: question.correctIndex,
              difficulty: question.difficulty,
              explanation: question.explanation,
              optionExplanationsJson: question.optionExplanations as unknown as Prisma.InputJsonValue,
              verified: true,
              qualityStatus: "VERIFIED_STRICT",
              qualityScore: 0.98,
              verifiedAt: new Date(),
              rejectedAt: null,
              verifierModel: checked.models.join("; "),
              verifierRuns: question.verifierRuns as Prisma.InputJsonValue,
              verificationMethod: "AUTOMATED_DOUBLE_BLIND_PLUS_CRITIC",
              verificationVersion: "ai-gate-v2",
              selectionKey: row.selectionKey ?? row.contentHash,
              rejectReason: null,
            },
          });
        }
      } else {
        needsReview += 1;
        if (!options.dryRun) {
          await db.bankQuestion.update({
            where: { id: row.id },
            data: {
              verified: false,
              qualityStatus: "NEEDS_REVIEW",
              qualityScore: 0.35,
              verificationMethod: "AUTOMATED_V2_FAILED",
              verificationVersion: "ai-gate-v2-failed",
              rejectReason: "Automated v2 enrichment or independent verification did not reach consensus; excluded from practice tests.",
            },
          });
        }
      }
    }
    batches += 1;
    if (offset + batchSize < rows.length && delayMs) await sleep(delayMs);
  }

  return { checked: rows.length, upgraded, needsReview, malformed, batches, dryRun: Boolean(options.dryRun), models: [...models] };
}

async function generateVisualBankCandidates(target: { subject: NeetSubject; classLevel: string; chapter: string }, count: number) {
  const avoid = await recentChapterStems(target.subject, target.chapter);
  const messages = [
      {
        role: "system" as const,
        content: "You create precise, original NEET UG visual MCQs and machine-renderable scientific diagrams. Return only a valid JSON array.",
      },
      {
        role: "user" as const,
        content: `Create exactly ${count} original visual single-correct MCQs for ${target.subject}, Class ${target.classLevel}, chapter "${target.chapter}". Physics/Chemistry may reach JEE Main toughness; Biology must be NCERT-faithful. Every item must genuinely require its visual.

Return objects with: subject, classLevel, chapter, topic, source:"AI", sourceRef:"Original visual - automated strict pipeline", difficulty, questionForm:"VISUAL", question, options (four), correctIndex (0-3), explanation, optionExplanations (exactly four), and visualSpec.

visualSpec must use exactly one safe schema:
1. {"kind":"CARTESIAN_GRAPH","title":"...","xLabel":"...","yLabel":"...","xMin":0,"xMax":10,"yMin":0,"yMax":10,"series":[{"label":"...","points":[[0,0],[1,2]]}]}
2. {"kind":"LABELLED_DIAGRAM","title":"...","nodes":[{"id":"a","label":"...","x":0-100,"y":0-100,"shape":"CIRCLE|RECT"}],"edges":[{"from":"a","to":"b","label":"..."}]}

The visual data, key, worked explanation, and all four option rationales must agree exactly. Use clean UTF-8 and LaTeX for formulas. No copyrighted figures, image URLs, hidden details, vague "as above" text, or decorative-only visuals.${avoid.length ? `\nAvoid repeating these stems:\n${avoid.map((stem) => `- ${stem.slice(0, 90)}`).join("\n")}` : ""}`,
      },
    ];
  let result = await chatWithAI(
    messages,
    8000,
    0.35,
    BANK_AI_TIMEOUT_MS,
    BANK_MODELS,
  );
  let raw = extractJsonArray<RawBankQuestion>(result.content) ?? [];
  if (!raw.length) {
    result = await chatWithAI(messages, 8000, 0.3, BANK_AI_TIMEOUT_MS, BANK_SECOND_PASS_MODELS);
    raw = extractJsonArray<RawBankQuestion>(result.content) ?? [];
  }
  const candidates: ValidatedBankQuestion[] = [];
  const renders = new Map<string, NonNullable<ReturnType<typeof renderQuestionVisualSvg>>>();
  let invalid = Math.max(0, count - raw.length);
  const invalidReasons: string[] = [];
  if (!raw.length) invalidReasons.push("generator returned no parseable visual questions");
  for (const row of raw) {
    const rendered = renderQuestionVisualSvg(row.visualSpec);
    const rawDifficulty = String(row.difficulty ?? "MODERATE").toUpperCase();
    const normalizedDifficulty = rawDifficulty === "HARD" || rawDifficulty === "DIFFICULT"
      ? "TOUGH"
      : rawDifficulty === "MEDIUM" || !DIFFICULTIES.has(rawDifficulty as PracticeDifficulty)
        ? "MODERATE"
        : rawDifficulty;
    const parsed = validateBankQuestion({
      ...row,
      subject: target.subject,
      classLevel: target.classLevel,
      chapter: target.chapter,
      source: "AI",
      sourceRef: "Original visual - automated strict pipeline",
      difficulty: normalizedDifficulty,
      isDiagramBased: rendered?.kind === "DIAGRAM",
      isGraphBased: rendered?.kind === "GRAPH",
      visualAssetKind: rendered?.kind,
      visualAssetAlt: rendered?.alt,
      visualMetaJson: rendered?.normalized,
    });
    if (!rendered || !parsed.question || parsed.question.optionExplanations.length !== 4) {
      invalid += 1;
      if (invalidReasons.length < 4) invalidReasons.push(!rendered ? "visualSpec could not be rendered" : parsed.reason ?? "four option explanations are required");
      continue;
    }
    candidates.push({
      ...parsed.question,
      provenanceJson: {
        origin: "AI_ORIGINAL_VISUAL",
        generatorModel: result.model,
        generatedAt: new Date().toISOString(),
        renderer: "safe-svg-v1",
      },
    });
    renders.set(parsed.question.contentHash, rendered);
  }
  return { candidates, renders, invalid, invalidReasons, model: result.model };
}

export async function fillVisualQuestionBank(options: FillVisualQuestionBankOptions = {}) {
  const requested = Math.max(1, Math.min(10_000, Math.round(options.count ?? 20)));
  const batchSize = Math.max(1, Math.min(8, Math.round(options.batchSize ?? 4)));
  const timeBudgetMs = Math.max(30_000, options.timeBudgetMs ?? 10 * 60_000);
  const targets = await pickFillTargets({ subject: options.subject, chapter: options.chapter });
  const startedAt = Date.now();
  let inserted = 0;
  let rejected = 0;
  let batches = 0;
  let targetIndex = 0;
  const models = new Set<string>();
  const invalidReasons = new Set<string>();
  const importBatch = `visual-strict-${new Date().toISOString().slice(0, 10)}`;

  while (inserted < requested && Date.now() - startedAt < timeBudgetMs && targets.length) {
    const target = targets[targetIndex % targets.length];
    targetIndex += 1;
    const generated = await generateVisualBankCandidates(target, Math.min(batchSize, requested - inserted));
    models.add(generated.model);
    generated.invalidReasons.forEach((reason) => invalidReasons.add(reason));
    rejected += generated.invalid;
    const checked = await strictVerifyGeneratedQuestions(generated.candidates);
    checked.models.forEach((model) => models.add(model));
    rejected += checked.rejected;
    const ready: ValidatedBankQuestion[] = [];
    for (const question of checked.kept) {
      const rendered = generated.renders.get(question.contentHash);
      if (!rendered) {
        rejected += 1;
        continue;
      }
      const { asset } = await storeQuestionVisualAsset(rendered);
      ready.push({
        ...question,
        visualAssetId: asset.id,
        visualAssetUrl: `/api/practice/visual/${asset.id}`,
        visualAssetAlt: rendered.alt,
        visualAssetKind: rendered.kind,
        visualMetaJson: rendered.normalized,
      });
    }
    const report = await insertBankQuestions(ready, {
      trusted: false,
      importBatch,
      verificationMethod: "PENDING_RENDERED_VISUAL_REVIEW",
    });
    if (ready.length) {
      await db.bankQuestion.updateMany({
        where: { contentHash: { in: ready.map((question) => question.contentHash) } },
        data: {
          qualityStatus: "NEEDS_REVIEW",
          verified: false,
          qualityScore: null,
          verifiedAt: null,
          verificationMethod: "PENDING_RENDERED_VISUAL_REVIEW",
          verificationVersion: "ai-gate-v3-render-required",
          verifierModel: checked.models.join("; "),
        },
      });
    }
    inserted += report.inserted;
    rejected += report.duplicate;
    batches += 1;
    if (report.inserted === 0 && generated.candidates.length === 0) break;
    if (inserted < requested) await sleep(800);
  }

  return { requested, inserted, rejected, batches, models: [...models], invalidReasons: [...invalidReasons], importBatch, strictOnly: true, renderer: "safe-svg-v1" };
}
