import { createHash } from "node:crypto";

import type { BankQuestion, Prisma } from "@prisma/client";

import { CHAPTERS, canonicalizeChapter, normalizeSubject, type NeetSubject } from "../data/syllabus/neet-chapters";
import { extractJsonArray } from "./ai-json";
import { db } from "./db";
import { AI_MODELS, chatWithAI } from "./openrouter";
import type { PracticeDifficulty, PracticeQuestion, PracticeSource, PracticeSubjectSlug } from "./practice-engine";
import { cleanQuestionOptions, cleanQuestionText } from "./text-cleanup";
import { buildTrendAssemblyPlan, shouldUseTrendAssembly } from "./trend-blueprint";

export const BANK_CHAPTER_QUOTA = 2000;
export const BANK_AI_MODELS = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.emergencyFallback];
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

function parseCorrectIndex(input: unknown) {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  const text = String(input ?? "").trim().toUpperCase();
  if (/^[0-3]$/.test(text)) return Number(text);
  if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  return Number.NaN;
}

function coerceOptions(raw: RawBankQuestion) {
  if (Array.isArray(raw.options)) return raw.options.map((option) => String(option ?? "").trim());
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
  if (options.length !== 4 || options.some((option) => !option)) return { question: null, reason: "requires four non-empty options" };

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

  const explanation = cleanQuestionText(raw.explanation);
  if (!explanation) return { question: null, reason: "explanation is required" };

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
    },
  };
}

function toCreateManyInput(row: ValidatedBankQuestion, importBatch?: string): Prisma.BankQuestionCreateManyInput {
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
    verified: row.verified,
    contentHash: row.contentHash,
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
  };
}

export async function insertBankQuestions(rawRows: RawBankQuestion[], options: { trusted?: boolean; importBatch?: string } = {}): Promise<BankInsertReport> {
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
      data: newRows.map((row) => toCreateManyInput(row, options.importBatch)),
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
  const [verified, total, difficulty, source] = await Promise.all([
    db.bankQuestion.groupBy({ by: ["subject", "chapter"], where: { verified: true }, _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter"], _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter", "difficulty"], where: { verified: true }, _count: { _all: true } }),
    db.bankQuestion.groupBy({ by: ["subject", "chapter", "source"], where: { verified: true }, _count: { _all: true } }),
  ]);
  const verifiedMap = new Map(verified.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));
  const totalMap = new Map(total.map((row) => [`${row.subject}::${row.chapter}`, row._count._all]));

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
  if (difficulty !== "MIXED") return [{ difficulty, count: total }];
  const easy = Math.floor(total * 0.3);
  const tough = Math.floor(total * 0.25);
  return [
    { difficulty: "MODERATE" as const, count: total - easy - tough },
    { difficulty: "EASY" as const, count: easy },
    { difficulty: "TOUGH" as const, count: tough },
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
    verified: row.verified || row.qualityStatus === "VERIFIED_STRICT",
  };
}

function bankQualityRank(row: BankQuestion) {
  if (row.qualityStatus === "VERIFIED_STRICT") return 0;
  if (row.verified) return 1;
  if (row.qualityStatus === "NEEDS_REVIEW") return 3;
  return 2;
}

function pushWarning(audit: BankAssemblyAudit | undefined, warning: string) {
  if (!audit || audit.warnings.includes(warning)) return;
  audit.warnings.push(warning);
}

async function selectBankRows(
  where: Prisma.BankQuestionWhereInput,
  requested: number,
  state: { exclude: Set<string>; duplicateClusters: Set<string> },
) {
  if (requested <= 0) return [] as BankQuestion[];
  const pool = await db.bankQuestion.findMany({
    where: {
      ...where,
      id: state.exclude.size ? { notIn: [...state.exclude] } : where.id,
    },
    orderBy: [{ timesServed: "asc" }, { lastServedAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(requested * 10, requested),
  });
  const picked: BankQuestion[] = [];
  for (const row of shuffle(pool.filter((candidate) => !state.exclude.has(candidate.id))).sort((a, b) => bankQualityRank(a) - bankQualityRank(b) || a.timesServed - b.timesServed)) {
    const cluster = row.duplicateClusterId;
    if (cluster && state.duplicateClusters.has(cluster)) continue;
    picked.push(row);
    state.exclude.add(row.id);
    if (cluster) state.duplicateClusters.add(cluster);
    if (picked.length >= requested) break;
  }
  return picked;
}

function subjectChapterCap(subject: NeetSubject, requestedSubjectCount: number) {
  const baseCap = subject === "Physics" || subject === "Chemistry" ? 4 : 6;
  return Math.max(1, Math.ceil((baseCap * Math.max(requestedSubjectCount, 1)) / 45));
}

async function fillSubjectShortfallByChapter(options: {
  subject: NeetSubject;
  classLevel?: string | null;
  requestedSubjectCount: number;
  desiredCount: number;
  selected: BankQuestion[];
  state: { exclude: Set<string>; duplicateClusters: Set<string> };
  audit?: BankAssemblyAudit;
}) {
  const picked: BankQuestion[] = [];
  const cap = subjectChapterCap(options.subject, options.requestedSubjectCount);
  const chapters = CHAPTERS.filter((chapter) => chapter.subject === options.subject && (!options.classLevel || chapter.classLevel === options.classLevel));
  const counts = new Map<string, number>();
  for (const row of options.selected) {
    if (row.subject !== options.subject) continue;
    counts.set(row.chapter, (counts.get(row.chapter) ?? 0) + 1);
  }

  let madeProgress = true;
  while (picked.length < options.desiredCount && madeProgress) {
    madeProgress = false;
    const orderedChapters = [...chapters].sort((a, b) => {
      const countDelta = (counts.get(a.chapter) ?? 0) - (counts.get(b.chapter) ?? 0);
      if (countDelta !== 0) return countDelta;
      return a.chapter.localeCompare(b.chapter);
    });

    for (const chapter of orderedChapters) {
      if (picked.length >= options.desiredCount) break;
      if ((counts.get(chapter.chapter) ?? 0) >= cap) continue;
      const row = await selectBankRows(
        {
          qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET"] },
          subject: options.subject,
          classLevel: options.classLevel ?? undefined,
          chapter: chapter.chapter,
        },
        1,
        options.state,
      );
      if (!row.length) continue;
      picked.push(...row);
      counts.set(chapter.chapter, (counts.get(chapter.chapter) ?? 0) + 1);
      madeProgress = true;
    }
  }

  if (picked.length < options.desiredCount) {
    const remaining = options.desiredCount - picked.length;
    const overflow = await selectBankRows(
      {
        qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET"] },
        subject: options.subject,
        classLevel: options.classLevel ?? undefined,
      },
      remaining,
      options.state,
    );
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
  const state = { exclude: new Set(request.excludeBankIds ?? []), duplicateClusters: new Set<string>() };
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

  for (const subjectQuota of plan.subjects) {
    let subjectPicked = 0;
    for (const chapterQuota of subjectQuota.chapters) {
      let chapterPicked = 0;
      for (const diffBucket of splitDifficulty(chapterQuota.count, request.difficulty)) {
        const baseWhere: Prisma.BankQuestionWhereInput = {
          qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET"] },
          subject: subjectQuota.subject,
          classLevel: request.classLevel ?? undefined,
          chapter: chapterQuota.chapter,
          difficulty: diffBucket.difficulty,
        };
        let picked = await selectBankRows(baseWhere, diffBucket.count, state);
        if (picked.length < diffBucket.count) {
          const shortfall = diffBucket.count - picked.length;
          const fallback = await selectBankRows({ ...baseWhere, difficulty: undefined }, shortfall, state);
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
      const fallback = await fillSubjectShortfallByChapter(
        {
          subject: subjectQuota.subject,
          classLevel: request.classLevel,
          requestedSubjectCount: subjectQuota.count,
          desiredCount: subjectShortfall,
          selected,
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
    const fallback: BankQuestion[] = [];
    for (const subjectQuota of plan.subjects) {
      if (fallback.length >= globalShortfall) break;
      const picked = await fillSubjectShortfallByChapter({
        subject: subjectQuota.subject,
        classLevel: request.classLevel,
        requestedSubjectCount: subjectQuota.count,
        desiredCount: globalShortfall - fallback.length,
        selected: [...selected, ...fallback],
        state,
        audit,
      });
      fallback.push(...picked);
    }
    selected.push(...fallback);
    audit?.quotas.push({ subject: "Any selected subject", classLevel: request.classLevel ?? null, requested: globalShortfall, selected: fallback.length, fallback: true });
    if (fallback.length < globalShortfall) {
      pushWarning(audit, `Global trend fallback could not fill all remaining questions.`);
    }
  }

  if (audit) audit.selected = selected.length;
  return selected.slice(0, request.desiredCount);
}

type BankAssemblyRequest = {
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
    for (const diffBucket of splitDifficulty(subjectBucket.count, request.difficulty)) {
      const where: Prisma.BankQuestionWhereInput = {
        qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET"] },
        subject,
        classLevel: request.classLevel ?? undefined,
        difficulty: diffBucket.difficulty,
        id: exclude.size ? { notIn: [...exclude] } : undefined,
        chapter: chapterEntries.length ? { in: chapterEntries.map((entry) => entry.chapter) } : undefined,
        topic: request.topic ?? undefined,
        source: request.mode === "PYQ_YEAR" ? "NEET_PYQ" : undefined,
        sourceRef: request.mode === "PYQ_YEAR" && request.pyqYear ? { contains: request.pyqYear } : undefined,
      };
      const pool = await db.bankQuestion.findMany({
        where,
        orderBy: [{ timesServed: "asc" }, { lastServedAt: "asc" }, { createdAt: "asc" }],
        take: Math.max(diffBucket.count * 8, diffBucket.count),
      });
      const picked = shuffle(pool.filter((row) => !exclude.has(row.id)))
        .sort((a, b) => bankQualityRank(a) - bankQualityRank(b) || a.timesServed - b.timesServed)
        .slice(0, diffBucket.count);
      picked.forEach((row) => exclude.add(row.id));
      selected.push(...picked);
      audit?.quotas.push({
        subject,
        requested: diffBucket.count,
        selected: picked.length,
        classLevel: request.classLevel ?? null,
        chapter: chapterEntries.length ? chapterEntries.map((entry) => entry.chapter).join(", ") : undefined,
      });
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

export async function fillQuestionBank(_options: Record<string, unknown> = {}) {
  return { requested: 0, inserted: 0, verifiedInserted: 0, rejected: 0, batches: 0, jobs: [], model: null };
}
