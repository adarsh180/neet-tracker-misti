import { createHash } from "node:crypto";

import type { BankQuestion, Prisma } from "@prisma/client";

import { CHAPTERS, canonicalizeChapter, normalizeSubject, type NeetSubject } from "../data/syllabus/neet-chapters";
import { extractJsonArray } from "./ai-json";
import { db } from "./db";
import { AI_MODELS, chatWithAI } from "./openrouter";
import type { PracticeDifficulty, PracticeQuestion, PracticeSource, PracticeSubjectSlug } from "./practice-engine";

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
};

export type BankInsertReport = {
  total: number;
  valid: number;
  inserted: number;
  duplicate: number;
  invalid: { index: number; reason: string }[];
};

const SOURCES = new Set<BankSource>(["NEET_PYQ", "JEE_PYQ", "INSTITUTE", "PLATFORM", "NCERT", "AI"]);
const DIFFICULTIES = new Set<PracticeDifficulty>(["EASY", "MODERATE", "TOUGH"]);
const SUBJECT_NAMES: Record<PracticeSubjectSlug, NeetSubject> = {
  physics: "Physics",
  chemistry: "Chemistry",
  botany: "Botany",
  zoology: "Zoology",
};

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

  const options = coerceOptions(raw);
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

  const questionText = String(raw.question ?? "").trim();
  if (!questionText) return { question: null, reason: "question is required" };

  const explanation = String(raw.explanation ?? "").trim();
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
  const options = Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [];
  return {
    id: `q${questionNumber}`,
    bankId: row.id,
    subject: row.subject,
    chapter: row.chapter,
    topic: row.topic,
    source: row.source as PracticeSource,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty as PracticeDifficulty,
    question: row.question,
    options,
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    verified: row.verified || row.qualityStatus === "VERIFIED_STRICT",
  };
}

function bankQualityRank(row: BankQuestion) {
  if (row.qualityStatus === "VERIFIED_STRICT") return 0;
  if (row.verified) return 1;
  if (row.qualityStatus === "NEEDS_REVIEW") return 3;
  return 2;
}

export async function assembleQuestionsFromBank(request: {
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
}): Promise<PracticeQuestion[]> {
  const selected: BankQuestion[] = [];
  const exclude = new Set(request.excludeBankIds ?? []);
  const subjects = request.subjects?.length
    ? request.subjects
    : request.subject
      ? [request.subject]
      : (["physics", "chemistry", "botany", "zoology"] as PracticeSubjectSlug[]);

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
    }
  }

  if (selected.length) {
    await db.bankQuestion.updateMany({
      where: { id: { in: selected.map((row) => row.id) } },
      data: { timesServed: { increment: 1 }, lastServedAt: new Date() },
    });
  }

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
  const options = Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [];
  return {
    subject: row.subject as NeetSubject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    topic: row.topic,
    source: row.source as BankSource,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty as PracticeDifficulty,
    question: row.question,
    options,
    correctIndex: row.correctIndex,
    explanation: row.explanation,
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
