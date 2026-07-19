import { randomUUID } from "node:crypto";

import { Prisma, type PracticeTest } from "@prisma/client";

import { extractJsonArray } from "@/lib/ai-json";
import { db } from "@/lib/db";
import {
  NEET_FULL_SUBJECT_COUNTS,
  NEET_FULL_SUBJECTS,
  NEET_FULL_TEST_DURATION_MINUTES,
  NEET_FULL_TEST_QUESTIONS,
  NEET_MAX_PRACTICE_DURATION_MINUTES,
} from "@/lib/neet-exam-policy";
import { AI_MODELS, chatWithAI } from "@/lib/openrouter";
import { assembleQuestionsFromBank, fillQuestionBank, writeBackBankStats, type BankAssemblyAudit } from "@/lib/question-bank";
import { cleanQuestionOptions, cleanQuestionText } from "@/lib/text-cleanup";
import { buildDistributionAudit, TREND_BLUEPRINT_VERSION, TREND_FULL_TEMPLATE } from "@/lib/trend-blueprint";

/**
 * Practice Arena — the question-paper engine.
 *
 * Papers are generated in verified batches so a 50–180 question test never
 * outruns a single request:
 *   1. a generation pass writes a batch of questions with a strict source mix —
 *      NEET UG PYQs first, then JEE Main PYQs (Physics/Chemistry only), then
 *      coaching test-series style (Allen/Aakash/PW/Motion), then platform-style,
 *      then AI-original — steered toward her live weak zones,
 *   2. a separate verification pass re-solves every question blind (no answer
 *      shown); any question where the solver disagrees with the keyed answer is
 *      dropped, so a wrong key can't reach her.
 *
 * Submission grades on the NTA scheme (+4 / −1 / 0) and auto-feeds both the
 * TestRecord table and the Error Log (wrong + skipped questions with the
 * correct answer and reasoning) — the same pipelines the Review Agent,
 * Rank Predictor, and Morning Command already read.
 */

export const PRACTICE_BATCH_SIZE = 5;
const PRACTICE_AI_TIMEOUT_MS = 300000;

// Runtime generation is disabled below, but retain the cost-controlled fallback
// lane for explicit maintenance: Flash-Lite -> 2.5 Flash -> 3.5 Flash.
const PRACTICE_MODELS = [AI_MODELS.lowCost, AI_MODELS.reliable, AI_MODELS.quality];
export const PRACTICE_MIN_QUESTIONS = 10;
export const PRACTICE_MAX_QUESTIONS = NEET_FULL_TEST_QUESTIONS;
export const PRACTICE_DEFAULT_AI_FRESH_PERCENT = 0;
export const PRACTICE_MAX_AI_FRESH_PERCENT = 0;
export const PRACTICE_MAX_AI_FRESH_QUESTIONS = 0;

export const PRACTICE_SUBJECTS = ["physics", "chemistry", "botany", "zoology"] as const;
export type PracticeSubjectSlug = (typeof PRACTICE_SUBJECTS)[number];

const SUBJECT_NAMES: Record<PracticeSubjectSlug, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  botany: "Botany",
  zoology: "Zoology",
};

export type PracticeMode = "FULL_LENGTH" | "SECTIONAL" | "UNIT" | "SUBJECT" | "CHAPTER" | "TOPIC" | "PYQ_YEAR";
export type PracticeSource = "NEET_PYQ" | "JEE_PYQ" | "INSTITUTE" | "PLATFORM" | "NCERT" | "AI";
export type PracticeDifficulty = "EASY" | "MODERATE" | "TOUGH";

export type PracticeQuestion = {
  id: string;
  bankId?: string;
  subject: string; // display name
  chapter: string;
  topic: string | null;
  source: PracticeSource;
  sourceRef: string;
  difficulty: PracticeDifficulty;
  question: string; // markdown + LaTeX ($...$)
  options: string[]; // exactly 4
  correctIndex: number; // private until completed
  explanation: string; // private until completed
  optionExplanations?: string[]; // private until completed; one rationale per option
  verified: boolean;
  visualAssetUrl?: string | null;
  visualAssetAlt?: string | null;
  visualAssetKind?: string | null;
  visualMeta?: unknown;
};

export type PracticeAnswer = { id: string; optionIndex: number | null };
export const PRACTICE_MISTAKE_TAGS = ["GUESS_WORK", "ELIMINATION_WORK", "NOT_STUDIED", "SILLY_MISTAKE", "CUSTOM"] as const;
export type PracticeMistakeTag = (typeof PRACTICE_MISTAKE_TAGS)[number];
export type CBTQuestionStatus = "NOT_VISITED" | "NOT_ANSWERED" | "ANSWERED" | "MARKED_FOR_REVIEW" | "ANSWERED_MARKED_FOR_REVIEW";

export type CBTSubmitType = "MANUAL" | "AUTO" | "TIME_UP";
export type CBTAutoSubmitReason = "TAB_SWITCH" | "FULLSCREEN_EXIT" | "BACK_NAVIGATION" | "RELOAD" | "WINDOW_BLUR" | "ROUTE_LEAVE" | "PAUSE_LIMIT" | "TIME_UP";

export type PracticeResult = {
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTakenSeconds: number | null;
  subjectScores: { subject: string; score: number; maxScore: number; correct: number; wrong: number; skipped: number }[];
};

export type PracticeConfig = {
  mode: PracticeMode;
  subject?: PracticeSubjectSlug | null;
  chapter?: string | null;
  topic?: string | null;
  pyqYear?: string | null;
  classLevel?: string | null;
  subjects?: PracticeSubjectSlug[] | null;
  chapters?: string[] | null;
  questionCount: number;
  aiFreshPercent?: number | null;
  durationMinutes?: number | null;
  difficulty: "MIXED" | PracticeDifficulty;
};

export type PracticeSubmitMeta = {
  submitType?: CBTSubmitType;
  autoSubmitReason?: CBTAutoSubmitReason | null;
  questionStatuses?: Record<string, CBTQuestionStatus>;
  currentQuestionIndex?: number;
  remainingSeconds?: number;
  pauseLogs?: unknown[];
  securityEvents?: unknown[];
  totalActiveSeconds?: number;
  totalPausedSeconds?: number;
};

type WeakZone = { subject: string; chapter: string | null; topic: string | null; wrong: number };

const SOURCE_LABELS: Record<PracticeSource, string> = {
  NEET_PYQ: "NEET UG PYQ",
  JEE_PYQ: "JEE Main PYQ",
  INSTITUTE: "Institute series",
  PLATFORM: "Platform standard",
  NCERT: "NCERT",
  AI: "AI original",
};

export function practiceSourceLabel(source: PracticeSource) {
  return SOURCE_LABELS[source] ?? source;
}

export function normalizeAiFreshPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PRACTICE_DEFAULT_AI_FRESH_PERCENT;
  return Math.max(0, Math.min(PRACTICE_MAX_AI_FRESH_PERCENT, Math.round(numeric)));
}

export function practiceAiFreshQuestionCount(questionCount: number, aiFreshPercent: number) {
  const target = Math.round((questionCount * aiFreshPercent) / 100);
  return Math.max(0, Math.min(PRACTICE_MAX_AI_FRESH_QUESTIONS, target));
}

// ---------------------------------------------------------------------------
// Test creation
// ---------------------------------------------------------------------------

async function snapshotWeakZones(): Promise<WeakZone[]> {
  const recent = await db.errorLogQuestion.findMany({
    where: { outcome: "WRONG" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { subject: true, chapter: true, topic: true },
  });

  const map = new Map<string, WeakZone>();
  for (const question of recent) {
    const key = `${question.subject}::${question.chapter ?? ""}::${question.topic ?? ""}`;
    const entry = map.get(key) ?? { subject: question.subject, chapter: question.chapter, topic: question.topic, wrong: 0 };
    entry.wrong += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.wrong - a.wrong).slice(0, 16);
}

function buildTitle(config: PracticeConfig) {
  if (config.mode === "FULL_LENGTH") return `Full-length mock · ${config.questionCount} Qs`;
  if (config.mode === "PYQ_YEAR") return `NEET ${config.pyqYear} PYQ session · ${config.questionCount} Qs`;
  if (config.mode === "SECTIONAL") return `Class ${config.classLevel} sectional · ${config.questionCount} Qs`;
  if (config.mode === "UNIT") return `Class ${config.classLevel} custom unit · ${config.questionCount} Qs`;
  const subject = config.subject ? SUBJECT_NAMES[config.subject] : "Mixed";
  if (config.mode === "SUBJECT") return `${subject} sectional · ${config.questionCount} Qs`;
  if (config.mode === "CHAPTER") return `${subject} — ${config.chapter} · ${config.questionCount} Qs`;
  return `${subject} — ${config.topic} · ${config.questionCount} Qs`;
}

function isOfficialNeetPaperMode(mode: PracticeMode | string) {
  return mode === "FULL_LENGTH" || mode === "PYQ_YEAR";
}

function normalizePracticeQuestionCount(config: PracticeConfig) {
  if (isOfficialNeetPaperMode(config.mode)) return NEET_FULL_TEST_QUESTIONS;
  return Math.max(PRACTICE_MIN_QUESTIONS, Math.min(PRACTICE_MAX_QUESTIONS, Math.round(config.questionCount)));
}

function normalizePracticeDuration(config: PracticeConfig, questionCount: number) {
  if (isOfficialNeetPaperMode(config.mode)) return NEET_FULL_TEST_DURATION_MINUTES;
  const requested = Number(config.durationMinutes);
  const fallback = Math.min(NEET_MAX_PRACTICE_DURATION_MINUTES, questionCount);
  if (!Number.isFinite(requested)) return fallback;
  return Math.max(1, Math.min(NEET_MAX_PRACTICE_DURATION_MINUTES, Math.round(requested)));
}

export class InsufficientStrictStockError extends Error {
  readonly code = "INSUFFICIENT_STRICT_STOCK";
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "InsufficientStrictStockError";
    this.details = details;
  }
}

export async function createPracticeTest(config: PracticeConfig, userId = "misti") {
  const count = normalizePracticeQuestionCount(config);
  const aiFreshPercent = normalizeAiFreshPercent(config.aiFreshPercent);
  const durationMinutes = normalizePracticeDuration(config, count);
  const weakZones = await snapshotWeakZones();
  const testSeed = randomUUID();
  const filters = {
    classLevel: config.classLevel ?? null,
    subjects: config.subjects?.length ? config.subjects : config.subject ? [config.subject] : null,
    chapters: config.chapters?.length ? config.chapters : config.chapter ? [config.chapter] : null,
    topic: config.topic ?? null,
    pyqYear: config.pyqYear ?? null,
  };

  const created = await db.practiceTest.create({
    data: {
      userId,
      title: buildTitle({ ...config, questionCount: count }),
      mode: config.mode,
      subject: config.subject ?? null,
      chapter: config.chapter ?? null,
      topic: config.topic ?? null,
      pyqYear: config.pyqYear ?? null,
      questionCount: count,
      aiFreshPercent,
      durationMinutes,
      difficulty: config.difficulty,
      status: "GENERATING",
      filtersJson: filters as unknown as Prisma.InputJsonValue,
      questionsJson: [] as unknown as Prisma.InputJsonValue,
      weakZonesJson: weakZones as unknown as Prisma.InputJsonValue,
      testSeed,
      blueprintVersion: TREND_BLUEPRINT_VERSION,
      paperTemplate: TREND_FULL_TEMPLATE,
    },
  });

  const progress = await generateNextBatch(created.id, { allowRuntimeTopUp: false });
  if (progress.status !== "READY") {
    await db.practiceTest.delete({ where: { id: created.id } }).catch(() => undefined);
    throw new InsufficientStrictStockError(
      `The strict verified bank can supply ${progress.generated}/${progress.target} questions for this exact selection. No out-of-scope or unverified questions were used.`,
      progress,
    );
  }

  return db.practiceTest.findUniqueOrThrow({ where: { id: created.id } });
}

// ---------------------------------------------------------------------------
// Batch generation + blind verification
// ---------------------------------------------------------------------------

function subjectPlanForBatch(test: PracticeTest, batchSize: number, existing: PracticeQuestion[]): string[] {
  if (test.subject) return Array(batchSize).fill(SUBJECT_NAMES[test.subject as PracticeSubjectSlug] ?? test.subject);

  // Full syllabus / PYQ year: keep the NEET 45/45/45/45 subject balance across the paper.
  const counts = new Map<string, number>(Object.values(SUBJECT_NAMES).map((name) => [name, 0]));
  for (const question of existing) counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1);

  const plan: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    const next = [...counts.entries()].sort((a, b) => a[1] - b[1])[0];
    plan.push(next[0]);
    counts.set(next[0], next[1] + 1);
  }
  return plan;
}

function sourcePlanLine(test: PracticeTest, plan: string[]) {
  if (test.mode === "PYQ_YEAR") {
    return `Runtime generation is forbidden for PYQ mode. Only authenticated, question-numbered NEET UG ${test.pyqYear} rows imported from an official paper and answer key may be used.`;
  }
  const bioCount = plan.filter((subject) => subject === "Botany" || subject === "Zoology").length;
  return [
    `SOURCE POLICY: create original questions only; never fabricate or paraphrase a PYQ.`,
    `Use source "AI" and sourceRef "Original - automated strict pipeline".`,
    bioCount === plan.length
      ? `Biology must be directly NCERT-faithful and NEET UG standard.`
      : `Physics and Chemistry may use JEE Main-level conceptual and calculation toughness while staying inside the NEET syllabus.`,
  ].join("\n");
}

function difficultyLine(difficulty: string) {
  if (difficulty === "MIXED") return `Difficulty mix: ~30% EASY, ~45% MODERATE, ~25% TOUGH.`;
  return `Difficulty: every question ${difficulty}.`;
}

function buildGenerationPrompt(test: PracticeTest, batchSize: number, existing: PracticeQuestion[], weakZones: WeakZone[]) {
  const plan = subjectPlanForBatch(test, batchSize, existing);
  const planCounts = plan.reduce<Record<string, number>>((acc, subject) => ({ ...acc, [subject]: (acc[subject] ?? 0) + 1 }), {});
  const scope =
    test.mode === "CHAPTER"
      ? `Restrict every question to the chapter "${test.chapter}".`
      : test.mode === "TOPIC"
        ? `Restrict every question to the topic "${test.topic}"${test.chapter ? ` (chapter "${test.chapter}")` : ""}.`
        : `Cover the full NEET UG syllabus scope for the listed subjects (NCERT class 11 + 12).`;

  // Plain-text bullets, not a JSON array; a JSON string list here teaches the
  // model to mimic that flat shape and break the output schema.
  const avoid = existing.slice(-24).map((question) => `- ${question.question.slice(0, 70).replace(/\s+/g, " ")}`).join("\n");

  return [
    `You are the question-setter for a NEET UG practice paper. Produce EXACTLY ${batchSize} single-correct MCQs as a JSON array. NTA standard: 4 options, one correct, +4/-1 marking.`,
    `IMPORTANT: Do NOT write planning notes, thoughts, or analysis. Begin your reply with "[" and output only the JSON array.`,
    `Subject plan for this batch (follow exactly): ${Object.entries(planCounts).map(([subject, count]) => `${subject}: ${count}`).join(", ")}.`,
    scope,
    sourcePlanLine(test, plan),
    difficultyLine(test.difficulty),
    weakZones.length
      ? `STUDENT WEAK ZONES (bias ~30% of applicable questions toward these, matching the scope): ${weakZones.map((zone) => `${zone.subject}/${zone.chapter ?? "?"}${zone.topic ? `/${zone.topic}` : ""} (${zone.wrong} wrong)`).join("; ")}.`
      : "",
    `FORMAT RULES:
1. Respond with a valid JSON array ONLY. No markdown fences, no prose, no wrapper object.
2. Each item: { "subject": "Physics|Chemistry|Botany|Zoology", "chapter": "exact NCERT chapter", "topic": "specific topic", "source": "AI", "sourceRef": "Original - automated strict pipeline", "difficulty": "EASY|MODERATE|TOUGH", "question": "string", "options": ["A","B","C","D"], "correctIndex": 0-3, "explanation": "complete solution", "optionExplanations": ["why A", "why B", "why C", "why D"] }
3. Write all math/chemistry in LaTeX: inline $...$. Use \\times for multiplication. Plain text for biology.
4. Options must be plausible, mutually exclusive, similar length. Exactly one correct.
5. Use current NEET style, not generic coaching filler: include statement-based, Assertion-Reason, Match/List, table/data and calculation-trap questions where natural. State every table, graph, diagram, assertion, list, or data set fully inside the question text unless a real visualAssetUrl exists.
6. The correctIndex MUST be verifiably correct - solve each question yourself before keying it.
7. Write clean UTF-8 text only. For equations prefer LaTeX commands like \\times, \\Delta, \\leq, \\geq, \\to, \\mu, and \\pi. Never output broken encoding artifacts or unreadable copied symbols.
8. BE COMPACT: keep each question under 110 words, each option under 22 words, each explanation under 65 words. The whole array must stay well under 3000 tokens.
9. Every distractor must test a real NEET misconception. optionExplanations must specifically explain why every choice is correct or incorrect. Avoid "all of these" and "none of these" unless the other three options make it uniquely defensible.
10. Every array item MUST be a complete JSON object wrapped in { } with all the keys from rule 2.${avoid ? `\n11. Do not repeat these already-used questions:\n${avoid}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type RawQuestion = Partial<PracticeQuestion> & { options?: unknown };

function validateBatch(raw: RawQuestion[] | null, startIndex: number): PracticeQuestion[] {
  if (!Array.isArray(raw)) return [];
  const subjects = new Set(Object.values(SUBJECT_NAMES));
  const sources = new Set<PracticeSource>(["NEET_PYQ", "JEE_PYQ", "INSTITUTE", "PLATFORM", "NCERT", "AI"]);
  const difficulties = new Set<PracticeDifficulty>(["EASY", "MODERATE", "TOUGH"]);

  const valid: PracticeQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const options = Array.isArray(item.options) ? cleanQuestionOptions(item.options) : [];
    const correctIndex = Number(item.correctIndex);
    if (
      !item.question ||
      options.length !== 4 ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3 ||
      !subjects.has(String(item.subject))
    )
      continue;

    valid.push({
      id: `q${startIndex + valid.length + 1}`,
      subject: String(item.subject),
      chapter: String(item.chapter ?? "General"),
      topic: item.topic ? String(item.topic) : null,
      source: sources.has(item.source as PracticeSource) ? (item.source as PracticeSource) : "AI",
      sourceRef: cleanQuestionText(item.sourceRef ?? "Original"),
      difficulty: difficulties.has(item.difficulty as PracticeDifficulty) ? (item.difficulty as PracticeDifficulty) : "MODERATE",
      question: cleanQuestionText(item.question),
      options,
      correctIndex,
      explanation: cleanQuestionText(item.explanation),
      verified: false,
      visualAssetUrl: null,
      visualAssetAlt: null,
      visualAssetKind: null,
      visualMeta: null,
    });
  }
  return valid;
}

function normalizePaperStem(question: PracticeQuestion) {
  return `${question.question} ${question.options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function hasUsableQuestionShape(question: PracticeQuestion) {
  const options = cleanQuestionOptions(question.options);
  return (
    cleanQuestionText(question.question).length > 0 &&
    options.length === 4 &&
    Number.isInteger(question.correctIndex) &&
    question.correctIndex >= 0 &&
    question.correctIndex <= 3 &&
    cleanQuestionText(question.explanation).length > 0 &&
    !((question.visualAssetKind || question.visualAssetUrl || question.visualAssetAlt) && !question.visualAssetUrl)
  );
}

function normalizeGeneratedPaper(test: PracticeTest, questions: PracticeQuestion[]) {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const deduped: PracticeQuestion[] = [];

  for (const question of questions) {
    if (!hasUsableQuestionShape(question)) {
      warnings.push(`Dropped malformed question candidate from ${question.subject}/${question.chapter}.`);
      continue;
    }
    const stem = normalizePaperStem(question);
    if (seen.has(stem)) {
      warnings.push(`Dropped duplicate question candidate from ${question.subject}/${question.chapter}.`);
      continue;
    }
    seen.add(stem);
    deduped.push(question);
  }

  if (!isOfficialNeetPaperMode(test.mode) || test.questionCount !== NEET_FULL_TEST_QUESTIONS) {
    return { questions: deduped, warnings };
  }

  const counts = new Map<string, number>();
  const balanced: PracticeQuestion[] = [];
  for (const question of deduped) {
    const subject = question.subject as keyof typeof NEET_FULL_SUBJECT_COUNTS;
    const cap = NEET_FULL_SUBJECT_COUNTS[subject];
    if (!cap) {
      warnings.push(`Dropped out-of-paper subject "${question.subject}" from official NEET paper.`);
      continue;
    }
    const current = counts.get(question.subject) ?? 0;
    if (current >= cap) {
      warnings.push(`Held back extra ${question.subject} question to preserve 45/45/45/45 NEET balance.`);
      continue;
    }
    counts.set(question.subject, current + 1);
    balanced.push(question);
  }

  return { questions: balanced, warnings };
}

function buildPracticePaperQualityGate(test: PracticeTest, questions: PracticeQuestion[]) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const malformed = questions.filter((question) => !hasUsableQuestionShape(question)).length;
  if (malformed) blockers.push(`${malformed} malformed question(s) remain in the paper.`);

  const duplicateCount = questions.length - new Set(questions.map(normalizePaperStem)).size;
  if (duplicateCount) blockers.push(`${duplicateCount} duplicate question stem(s) remain in the paper.`);

  const unverified = questions.filter((question) => !question.verified).length;
  if (unverified) warnings.push(`${unverified} question(s) are usable but not strict-bank verified.`);

  if (isOfficialNeetPaperMode(test.mode)) {
    if (questions.length !== NEET_FULL_TEST_QUESTIONS) {
      blockers.push(`Official NEET mock needs exactly ${NEET_FULL_TEST_QUESTIONS} questions; assembled ${questions.length}.`);
    }
    for (const subject of NEET_FULL_SUBJECTS) {
      const actual = questions.filter((question) => question.subject === subject).length;
      const expected = NEET_FULL_SUBJECT_COUNTS[subject];
      if (actual !== expected) blockers.push(`${subject} must have ${expected} questions; assembled ${actual}.`);
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    strictVerifiedCount: questions.length - unverified,
    unverifiedCount: unverified,
  };
}

/**
 * Blind verification: the solver sees questions WITHOUT the key and answers
 * independently. Questions where solver and key disagree are dropped — a wrong
 * answer key must never reach the student.
 */
async function verifyBatch(questions: PracticeQuestion[]): Promise<PracticeQuestion[]> {
  if (!questions.length) return [];

  const payload = questions.map((question) => ({
    id: question.id,
    subject: question.subject,
    question: question.question,
    options: question.options,
  }));

  try {
    const result = await chatWithAI(
      [
        {
          role: "system",
          content:
            "You are an expert NEET examiner solving questions independently. Respond only with valid JSON. Never include markdown fences.",
        },
        {
          role: "user",
          content: `Solve each MCQ below independently and carefully. Respond with a JSON array: [{ "id": "q1", "answerIndex": 0-3, "confident": true|false }]. Set confident=false if the question is ambiguous, has no single correct option, or you are unsure.\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      2400,
      0.1,
      PRACTICE_AI_TIMEOUT_MS,
      PRACTICE_MODELS,
    );

    const solved = extractJsonArray<{ id: string; answerIndex: number; confident?: boolean }>(result.content);
    if (!solved) return questions; // verification unavailable → keep batch, flagged unverified

    const solvedMap = new Map(solved.map((entry) => [String(entry.id), entry]));
    const kept: PracticeQuestion[] = [];
    for (const question of questions) {
      const solution = solvedMap.get(question.id);
      if (!solution) {
        kept.push(question); // solver skipped it — keep, unverified
        continue;
      }
      const agrees = Number(solution.answerIndex) === question.correctIndex;
      const confident = solution.confident !== false;
      if (agrees && confident) kept.push({ ...question, verified: true });
      else if (agrees) kept.push({ ...question, verified: false });
      // disagreement → dropped entirely
    }
    return kept;
  } catch (error) {
    console.warn("[practice-engine] verification pass failed; keeping batch unverified.", error);
    return questions;
  }
}

export async function generateNextBatch(testId: string, options: { allowRuntimeTopUp?: boolean } = {}) {
  const test = await db.practiceTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("Practice test not found");
  if (test.status !== "GENERATING") {
    const questions = test.questionsJson as unknown as PracticeQuestion[];
    return { status: test.status, generated: questions.length, target: test.questionCount, added: 0 };
  }

  let existing = test.questionsJson as unknown as PracticeQuestion[];
  const initialGeneratedCount = existing.length;
  let model = test.model;
  const assemblyAudits: BankAssemblyAudit[] = [];
  const generationWarnings: string[] = [];
  const strictFillReports: unknown[] = [];
  const allowRuntimeTopUp = options.allowRuntimeTopUp === true;
  const aiFreshPercent = normalizeAiFreshPercent(test.aiFreshPercent);
  const aiFreshCount = practiceAiFreshQuestionCount(test.questionCount, aiFreshPercent);
  const bankTarget = Math.max(0, test.questionCount - aiFreshCount);

  const addBankQuestions = async (desiredCount: number) => {
    if (desiredCount <= 0) return [] as PracticeQuestion[];
    const excludeBankIds = existing.map((question) => question.bankId).filter((id): id is string => Boolean(id));
    const audit: BankAssemblyAudit = { mode: test.mode, requested: desiredCount, selected: 0, quotas: [], warnings: [] };
    const bankQuestions = await assembleQuestionsFromBank({
      mode: test.mode as PracticeMode,
      subject: test.subject as PracticeSubjectSlug | null,
      subjects: ((test.filtersJson as { subjects?: PracticeSubjectSlug[] } | null)?.subjects ?? undefined),
      classLevel: ((test.filtersJson as { classLevel?: string } | null)?.classLevel ?? undefined),
      chapter: test.chapter,
      chapters: ((test.filtersJson as { chapters?: string[] } | null)?.chapters ?? undefined),
      topic: test.topic,
      pyqYear: test.pyqYear,
      questionCount: test.questionCount,
      difficulty: test.difficulty as PracticeConfig["difficulty"],
      desiredCount,
      startIndex: existing.length,
      excludeBankIds,
      existingQuestions: existing,
      testSeed: test.testSeed ?? test.id,
      audit,
    });
    assemblyAudits.push(audit);
    if (bankQuestions.length) {
      existing = [...existing, ...bankQuestions];
      model = bankQuestions.length >= test.questionCount ? "question-bank" : `question-bank+${model ?? "ai"}`;
    }
    return bankQuestions;
  };

  const requestStrictTopUp = async (shortfall: number) => {
    if (shortfall <= 0) return;
    try {
      const filters = test.filtersJson as { subjects?: PracticeSubjectSlug[]; chapters?: string[] } | null;
      const singleChapter = test.chapter ?? (filters?.chapters?.length === 1 ? filters.chapters[0] : undefined);
      const singleSubject = test.subject ?? (filters?.subjects?.length === 1 ? filters.subjects[0] : undefined);
      const report = await fillQuestionBank({
        subject: singleSubject ?? undefined,
        chapter: singleChapter ?? undefined,
        all: !singleChapter,
        count: Math.min(10, Math.max(5, shortfall)),
        maxQuestions: Math.min(15, Math.max(5, shortfall * 2)),
        timeBudgetMs: 110000,
      });
      strictFillReports.push(report);
      if (report.inserted <= 0) {
        generationWarnings.push(`Strict bank top-up produced no new verified rows for a shortfall of ${shortfall}.`);
      } else {
        model = `${model ?? "question-bank"}+strict-fill`;
      }
    } catch (error) {
      console.warn("[practice-engine] strict bank top-up failed.", error);
      generationWarnings.push(`Strict bank top-up failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const existingBankCount = existing.map((question) => question.bankId).filter(Boolean).length;
  if (bankTarget > existingBankCount) {
    const neededFromBank = bankTarget - existingBankCount;
    if (neededFromBank > 0) {
      let bankQuestions = await addBankQuestions(neededFromBank);
      if (bankQuestions.length < neededFromBank) {
        const shortfall = neededFromBank - bankQuestions.length;
        generationWarnings.push(`Strict bank shortage before top-up: needed ${neededFromBank}, found ${bankQuestions.length}.`);
        if (allowRuntimeTopUp) await requestStrictTopUp(shortfall);
        bankQuestions = await addBankQuestions(shortfall);
        if (bankQuestions.length < shortfall) {
          generationWarnings.push(`Strict bank still short by ${shortfall - bankQuestions.length} after top-up.`);
        }
      }
    }
  }

  const remaining = test.questionCount - existing.length;
  const existingLiveAiCount = existing.filter((question) => !question.bankId).length;
  const liveAiRemaining = Math.max(0, aiFreshCount - existingLiveAiCount);
  const batchSize = Math.min(PRACTICE_BATCH_SIZE, Math.max(remaining, 0), liveAiRemaining);
  const weakZones = (test.weakZonesJson as unknown as WeakZone[]) ?? [];

  let added: PracticeQuestion[] = [];

  if (batchSize > 0) {
    try {
      const messages = [
        {
          role: "system" as const,
          content:
            "You are a precise NEET UG question paper setter. Respond only with a valid JSON array of objects. Never include markdown fences. Accuracy of answer keys is non-negotiable.",
        },
        { role: "user" as const, content: buildGenerationPrompt(test, batchSize, existing, weakZones) },
      ];

      let candidates: PracticeQuestion[] = [];
      // First use the cost-controlled lane; final retry uses 3.5 Flash only.
      for (const lane of [PRACTICE_MODELS, [AI_MODELS.quality]]) {
        const result = await chatWithAI(messages, 12000, 0.4, PRACTICE_AI_TIMEOUT_MS, lane);
        model = result.model;
        candidates = validateBatch(extractJsonArray<RawQuestion>(result.content), existing.length);
        if (candidates.length) break;
        console.warn(
          `[practice-engine] ${result.model} batch produced no valid questions. Raw head: ${result.content.slice(0, 300)} ... tail: ${result.content.slice(-120)}`,
        );
      }
      added = await verifyBatch(candidates);
    } catch (error) {
      console.warn("[practice-engine] live AI batch failed; filling the remaining paper from bank.", error);
    }
  }

  if (added.length) existing = [...existing, ...added];

  const stillNeeded = test.questionCount - existing.length;
  if (stillNeeded > 0) {
    let fallbackBankQuestions = await addBankQuestions(stillNeeded);
    if (fallbackBankQuestions.length < stillNeeded) {
      const shortfall = stillNeeded - fallbackBankQuestions.length;
      if (allowRuntimeTopUp) await requestStrictTopUp(shortfall);
      fallbackBankQuestions = await addBankQuestions(shortfall);
      if (fallbackBankQuestions.length < shortfall) {
        generationWarnings.push(`Question assembly is waiting for ${shortfall - fallbackBankQuestions.length} more strict verified row(s).`);
      }
    }
    if (batchSize > 0 && added.length < batchSize) {
      model = `${model ?? "ai"}+bank-fallback`;
    }
  }

  const normalizedPaper = normalizeGeneratedPaper(test, existing);
  existing = normalizedPaper.questions;
  generationWarnings.push(...normalizedPaper.warnings);

  const done = existing.length >= test.questionCount;
  // On completion, re-index to unique sequential ids. Bank + AI-fresh assembly can
  // otherwise collide ids (two "q50"), which corrupts the answer map and the review.
  // Safe because the exam only ever uses the READY snapshot.
  const questions = done ? existing.map((question, index) => ({ ...question, id: `q${index + 1}` })) : existing;
  const qualityGate = buildPracticePaperQualityGate(test, questions);
  const ready = done && qualityGate.ready;
  const distributionAudit = buildDistributionAudit(questions, {
    blueprintWarnings: [...assemblyAudits.flatMap((audit) => audit.warnings), ...generationWarnings, ...qualityGate.blockers, ...qualityGate.warnings],
    assemblyAudits: strictFillReports.length ? [...assemblyAudits, { strictFillReports }] : assemblyAudits,
    qualityGate,
  });

  const updated = await db.practiceTest.update({
    where: { id: test.id },
    data: {
      questionsJson: questions as unknown as Prisma.InputJsonValue,
      status: ready ? "READY" : "GENERATING",
      model,
      blueprintVersion: TREND_BLUEPRINT_VERSION,
      paperTemplate: TREND_FULL_TEMPLATE,
      distributionAuditJson: distributionAudit as unknown as Prisma.InputJsonValue,
      blueprintWarningsJson: distributionAudit.warnings as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    status: updated.status,
    generated: questions.length,
    target: test.questionCount,
    added: questions.length - initialGeneratedCount,
    retryAfterMs: ready ? 0 : 60000,
    waitingForStrictStock: !done && generationWarnings.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Grading + auto-feed into TestRecord and Error Log
// ---------------------------------------------------------------------------

function gradeTest(questions: PracticeQuestion[], answers: PracticeAnswer[], timeTakenSeconds: number | null): PracticeResult {
  const answerMap = new Map(answers.map((answer) => [answer.id, answer.optionIndex]));
  const subjectAgg = new Map<string, { score: number; maxScore: number; correct: number; wrong: number; skipped: number }>();

  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const question of questions) {
    const entry = subjectAgg.get(question.subject) ?? { score: 0, maxScore: 0, correct: 0, wrong: 0, skipped: 0 };
    entry.maxScore += 4;
    const chosen = answerMap.get(question.id);
    if (chosen === null || chosen === undefined) {
      skipped += 1;
      entry.skipped += 1;
    } else if (chosen === question.correctIndex) {
      score += 4;
      correct += 1;
      entry.score += 4;
      entry.correct += 1;
    } else {
      score -= 1;
      wrong += 1;
      entry.score -= 1;
      entry.wrong += 1;
    }
    subjectAgg.set(question.subject, entry);
  }

  const maxScore = questions.length * 4;
  return {
    score,
    maxScore,
    percentage: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
    correct,
    wrong,
    skipped,
    timeTakenSeconds,
    subjectScores: [...subjectAgg.entries()].map(([subject, entry]) => ({ subject, ...entry })),
  };
}

const ERROR_DIFFICULTY: Record<PracticeDifficulty, string> = { EASY: "EASY", MODERATE: "MEDIUM", TOUGH: "HARD" };

export async function submitPracticeTest(testId: string, answers: PracticeAnswer[], timeTakenSeconds: number | null, meta: PracticeSubmitMeta = {}) {
  const test = await db.practiceTest.findUnique({ where: { id: testId } });
  if (!test) throw new Error("Practice test not found");
  if (test.status === "COMPLETED") throw new Error("This test is already submitted");
  if (!["READY", "RUNNING", "PAUSED"].includes(test.status)) throw new Error("This test is still generating");

  const questions = test.questionsJson as unknown as PracticeQuestion[];
  const result = gradeTest(questions, answers, timeTakenSeconds);
  const answerMap = new Map(answers.map((answer) => [answer.id, answer.optionIndex]));
  const now = new Date();

  const subjectScore = (name: string) => result.subjectScores.find((entry) => entry.subject === name)?.score ?? null;
  const isFullLength = test.mode === "FULL_LENGTH" || test.mode === "PYQ_YEAR" || test.mode === "SECTIONAL";

  const subjectRow = test.subject ? await db.subject.findUnique({ where: { slug: test.subject } }) : null;

  // 1. Error log — every wrong and skipped question, with the key and reasoning.
  const errorLogTest = await db.errorLogTest.create({
    data: {
      testName: test.title,
      testType: test.mode === "PYQ_YEAR" ? "PYQ" : isFullLength ? "FLT" : "SECTIONAL",
      questionCount: questions.length,
      takenAt: now,
      notes: `Auto-logged from Practice Arena (${test.id}).`,
      questions: {
        create: questions
          .map((question, index) => ({ question, index }))
          .filter(({ question }) => answerMap.get(question.id) !== question.correctIndex)
          .map(({ question, index }) => {
            const chosen = answerMap.get(question.id);
            const attempted = chosen !== null && chosen !== undefined;
            return {
              questionNumber: index + 1,
              questionSummary: question.question.slice(0, 600),
              subject: question.subject,
              chapter: question.chapter,
              topic: question.topic,
              attemptStatus: attempted ? "ATTEMPTED" : "SKIPPED",
              outcome: attempted ? "WRONG" : "UNMARKED",
              correctAnswer: `(${String.fromCharCode(65 + question.correctIndex)}) ${question.options[question.correctIndex]}`.slice(0, 600),
              whyCorrect: question.explanation.slice(0, 1200),
              whereLacked: attempted ? `Chose (${String.fromCharCode(65 + (chosen as number))}) ${question.options[chosen as number] ?? ""}`.slice(0, 600) : "Left blank",
              difficulty: ERROR_DIFFICULTY[question.difficulty],
              notes: `${practiceSourceLabel(question.source)} · ${question.sourceRef}`.slice(0, 300),
            };
          }),
      },
    },
  });

  // 2. Test record — feeds dashboard, Rank Predictor, Review Agent, NEET-GURU.
  const testRecord = await db.testRecord.create({
    data: {
      subjectId: subjectRow?.id ?? null,
      testType: isFullLength ? "FULL_LENGTH" : "SECTIONAL",
      testName: test.title,
      score: result.score,
      maxScore: result.maxScore,
      percentage: result.percentage,
      institute: "Practice Arena (AI)",
      correctCount: result.correct,
      wrongCount: result.wrong,
      skippedCount: result.skipped,
      negativeMarksLost: result.wrong,
      physicsScore: isFullLength ? subjectScore("Physics") : null,
      chemistryScore: isFullLength ? subjectScore("Chemistry") : null,
      botanyScore: isFullLength ? subjectScore("Botany") : null,
      zoologyScore: isFullLength ? subjectScore("Zoology") : null,
      difficultyLevel: test.difficulty,
      linkedErrorLogTestId: errorLogTest.id,
      takenAt: now,
      notes: `Practice Arena auto-record. ${result.correct}C/${result.wrong}W/${result.skipped}S in ${questions.length} questions.`,
    },
  });

  await writeBackBankStats(questions, answerMap);

  await db.practiceQuestionReview.createMany({
    data: questions.map((question, index) => {
      const selectedIndex = answerMap.get(question.id);
      const outcome = selectedIndex === null || selectedIndex === undefined
        ? "SKIPPED"
        : selectedIndex === question.correctIndex
          ? "CORRECT"
          : "WRONG";
      return {
        testId: test.id,
        questionId: question.id,
        questionNumber: index + 1,
        bankQuestionId: question.bankId ?? null,
        subject: question.subject,
        chapter: question.chapter,
        topic: question.topic,
        selectedIndex: selectedIndex ?? null,
        correctIndex: question.correctIndex,
        outcome,
        reviewComplete: outcome === "CORRECT",
      };
    }),
    skipDuplicates: true,
  });

  const updated = await db.practiceTest.update({
    where: { id: test.id },
    data: {
      status: "COMPLETED",
      answersJson: answers as unknown as Prisma.InputJsonValue,
      questionStatusesJson: (meta.questionStatuses ?? test.questionStatusesJson ?? null) as Prisma.InputJsonValue,
      currentQuestionIndex: Number.isInteger(meta.currentQuestionIndex) ? Number(meta.currentQuestionIndex) : test.currentQuestionIndex,
      remainingSeconds: Number.isFinite(Number(meta.remainingSeconds)) ? Math.max(0, Math.round(Number(meta.remainingSeconds))) : test.remainingSeconds,
      pauseLogsJson: (meta.pauseLogs ?? test.pauseLogsJson ?? null) as Prisma.InputJsonValue,
      // Camera-proctoring events and images are intentionally ephemeral. The
      // browser sends them directly to the mail route after submission.
      securityEventsJson: Prisma.JsonNull,
      submitType: meta.submitType ?? "MANUAL",
      autoSubmitReason: meta.autoSubmitReason ?? null,
      totalActiveSeconds: Number.isFinite(Number(meta.totalActiveSeconds)) ? Math.max(0, Math.round(Number(meta.totalActiveSeconds))) : (timeTakenSeconds ?? null),
      totalPausedSeconds: Number.isFinite(Number(meta.totalPausedSeconds)) ? Math.max(0, Math.round(Number(meta.totalPausedSeconds))) : null,
      resultJson: result as unknown as Prisma.InputJsonValue,
      testRecordId: testRecord.id,
      errorLogTestId: errorLogTest.id,
      completedAt: now,
    },
  });

  return { test: updated, result };
}

export async function createPracticeReattempt(testId: string, userId: string) {
  const source = await db.practiceTest.findFirst({ where: { id: testId, userId } });
  if (!source) throw new Error("Practice test not found");
  if (source.status !== "COMPLETED") throw new Error("Only a completed test can be re-attempted");

  const filters = source.filtersJson && typeof source.filtersJson === "object" && !Array.isArray(source.filtersJson)
    ? source.filtersJson as Record<string, unknown>
    : {};
  const rootAttemptId = typeof filters.reattemptRootId === "string" ? filters.reattemptRootId : source.id;
  const titleBase = source.title.replace(/\s+-\s+Re-attempt(?:\s+\d+)?$/i, "").trim();
  const sourceQuestions = Array.isArray(source.questionsJson)
    ? source.questionsJson as unknown as PracticeQuestion[]
    : [];
  const bankQuestionIds = [...new Set(sourceQuestions.map((question) => question.bankId).filter((id): id is string => Boolean(id)))];

  return db.$transaction(async (tx) => {
    const relatedAttempts = await tx.practiceTest.findMany({
      where: { userId },
      select: { filtersJson: true },
    });
    const previousAttempts = relatedAttempts.filter((entry) => {
      const entryFilters = entry.filtersJson && typeof entry.filtersJson === "object" && !Array.isArray(entry.filtersJson)
        ? entry.filtersJson as Record<string, unknown>
        : {};
      return entryFilters.reattemptRootId === rootAttemptId;
    }).length;

    const created = await tx.practiceTest.create({
      data: {
        userId,
        title: `${titleBase} - Re-attempt ${previousAttempts + 1}`,
        mode: source.mode,
        subject: source.subject,
        chapter: source.chapter,
        topic: source.topic,
        pyqYear: source.pyqYear,
        questionCount: source.questionCount,
        aiFreshPercent: 0,
        durationMinutes: source.durationMinutes,
        difficulty: source.difficulty,
        status: "READY",
        filtersJson: {
          ...filters,
          reattemptRootId: rootAttemptId,
          reattemptOf: source.id,
          reattemptNumber: previousAttempts + 1,
        } as Prisma.InputJsonValue,
        questionsJson: source.questionsJson as Prisma.InputJsonValue,
        weakZonesJson: source.weakZonesJson ?? undefined,
        remainingSeconds: source.durationMinutes * 60,
        testSeed: `${source.testSeed ?? source.id}:reattempt:${Date.now()}`,
        blueprintVersion: source.blueprintVersion,
        paperTemplate: source.paperTemplate,
        distributionAuditJson: source.distributionAuditJson ?? undefined,
        blueprintWarningsJson: source.blueprintWarningsJson ?? undefined,
        model: "DATABASE_REATTEMPT",
      },
    });

    if (bankQuestionIds.length) {
      await tx.bankQuestion.updateMany({
        where: { id: { in: bankQuestionIds } },
        data: { timesServed: { increment: 1 }, lastServedAt: new Date() },
      });
    }
    return created;
  });
}

export async function deletePracticeTestRecord(testId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const test = await tx.practiceTest.findFirst({
      where: { id: testId, userId },
      select: { id: true, testRecordId: true, errorLogTestId: true, questionsJson: true },
    });
    if (!test) throw new Error("Practice test not found");

    const reviews = await tx.practiceQuestionReview.findMany({
      where: { testId: test.id, bankQuestionId: { not: null } },
      select: { bankQuestionId: true, outcome: true },
    });
    const bankDeltas = new Map<string, { served: number; correct: number; wrong: number }>();
    const questions = Array.isArray(test.questionsJson)
      ? test.questionsJson as unknown as PracticeQuestion[]
      : [];
    for (const question of questions) {
      if (!question.bankId) continue;
      const delta = bankDeltas.get(question.bankId) ?? { served: 0, correct: 0, wrong: 0 };
      delta.served += 1;
      bankDeltas.set(question.bankId, delta);
    }
    for (const review of reviews) {
      if (!review.bankQuestionId) continue;
      const delta = bankDeltas.get(review.bankQuestionId) ?? { served: 0, correct: 0, wrong: 0 };
      // Legacy attempts may have reviews but no bank IDs embedded in questionsJson.
      if (!bankDeltas.has(review.bankQuestionId)) delta.served += 1;
      if (review.outcome === "CORRECT") delta.correct += 1;
      if (review.outcome === "WRONG") delta.wrong += 1;
      bankDeltas.set(review.bankQuestionId, delta);
    }

    const deltaGroups = new Map<string, { ids: string[]; served: number; correct: number; wrong: number }>();
    for (const [bankQuestionId, delta] of bankDeltas) {
      const key = `${delta.served}:${delta.correct}:${delta.wrong}`;
      const group = deltaGroups.get(key) ?? { ids: [], ...delta };
      group.ids.push(bankQuestionId);
      deltaGroups.set(key, group);
    }

    // A test normally collapses into only three grouped statements (correct,
    // wrong, skipped). This avoids an interactive TiDB round-trip per question,
    // which could expire the transaction for 50-180 question papers.
    for (const group of deltaGroups.values()) {
      await tx.bankQuestion.updateMany({
        where: {
          id: { in: group.ids },
          timesServed: { gte: group.served },
          timesCorrect: { gte: group.correct },
          timesWrong: { gte: group.wrong },
        },
        data: {
          timesServed: { decrement: group.served },
          timesCorrect: { decrement: group.correct },
          timesWrong: { decrement: group.wrong },
        },
      });
    }

    await tx.practiceTest.delete({ where: { id: test.id } });
    if (test.testRecordId) await tx.testRecord.deleteMany({ where: { id: test.testRecordId } });
    if (test.errorLogTestId) await tx.errorLogTest.deleteMany({ where: { id: test.errorLogTestId } });

    return { deletedTestId: test.id, reversedQuestionStats: reviews.length };
  });
}

export async function getPracticeQuestionReviews(testId: string) {
  return db.practiceQuestionReview.findMany({
    where: { testId },
    orderBy: { questionNumber: "asc" },
  });
}

export async function savePracticeQuestionReview(input: {
  testId: string;
  questionId: string;
  mistakeTag: PracticeMistakeTag | null;
  customMistakeText?: string | null;
}) {
  const tag = input.mistakeTag;
  if (tag && !PRACTICE_MISTAKE_TAGS.includes(tag)) throw new Error("Unknown mistake tag");
  const customText = cleanQuestionText(input.customMistakeText).slice(0, 1200) || null;
  if (tag === "CUSTOM" && !customText) throw new Error("Describe the custom mistake before saving");

  const review = await db.practiceQuestionReview.findUnique({
    where: { testId_questionId: { testId: input.testId, questionId: input.questionId } },
  });
  if (!review) throw new Error("Question review not found");

  const reviewComplete = review.outcome === "CORRECT" || Boolean(tag);
  const updated = await db.practiceQuestionReview.update({
    where: { id: review.id },
    data: {
      mistakeTag: tag,
      customMistakeText: tag === "CUSTOM" ? customText : null,
      reviewComplete,
    },
  });

  if (review.outcome !== "CORRECT") {
    const errorQuestion = await db.errorLogQuestion.findFirst({
      where: {
        test: { notes: { contains: input.testId } },
        questionNumber: review.questionNumber,
      },
      orderBy: { createdAt: "desc" },
    });
    if (errorQuestion) {
      await db.errorLogQuestion.update({
        where: { id: errorQuestion.id },
        data: {
          solveMethod: tag === "GUESS_WORK" ? "GUESS" : tag === "ELIMINATION_WORK" ? "ELIMINATION" : errorQuestion.solveMethod,
          notStudied: tag === "NOT_STUDIED",
          reasonTags: tag ? [tag] : [],
          whereLacked: customText ?? errorQuestion.whereLacked,
        },
      });
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Client sanitization
// ---------------------------------------------------------------------------

export function sanitizePracticeTest(test: PracticeTest, includeQuestions = true) {
  const questions = (test.questionsJson as unknown as PracticeQuestion[]) ?? [];
  const completed = test.status === "COMPLETED";

  return {
    id: test.id,
    folderId: test.folderId,
    title: test.title,
    mode: test.mode,
    subject: test.subject,
    chapter: test.chapter,
    topic: test.topic,
    pyqYear: test.pyqYear,
    questionCount: test.questionCount,
    generatedCount: questions.length,
    aiFreshPercent: test.aiFreshPercent,
    durationMinutes: test.durationMinutes,
    filters: test.filtersJson,
    difficulty: test.difficulty,
    status: test.status,
    model: test.model,
    blueprintVersion: test.blueprintVersion,
    paperTemplate: test.paperTemplate,
    distributionAudit: completed ? (test.distributionAuditJson as unknown) : null,
    blueprintWarnings: test.blueprintWarningsJson as unknown,
    createdAt: test.createdAt,
    startedAt: test.startedAt,
    completedAt: test.completedAt,
    proctorConsentAt: test.proctorConsentAt,
    proctorReportSentAt: test.proctorReportSentAt,
    proctorReportStatus: test.proctorReportStatus,
    testRecordId: test.testRecordId,
    errorLogTestId: test.errorLogTestId,
    result: completed ? (test.resultJson as unknown as PracticeResult | null) : null,
    answers: (test.answersJson as unknown as PracticeAnswer[] | null) ?? null,
    questionStatuses: (test.questionStatusesJson as unknown as Record<string, CBTQuestionStatus> | null) ?? null,
    currentQuestionIndex: test.currentQuestionIndex,
    remainingSeconds: test.remainingSeconds,
    pauseLogs: (test.pauseLogsJson as unknown as unknown[] | null) ?? null,
    securityEvents: (test.securityEventsJson as unknown as unknown[] | null) ?? null,
    submitType: test.submitType,
    autoSubmitReason: test.autoSubmitReason,
    totalActiveSeconds: test.totalActiveSeconds,
    totalPausedSeconds: test.totalPausedSeconds,
    questions: includeQuestions
      ? questions.map((question) => ({
          id: question.id,
          subject: question.subject,
          chapter: question.chapter,
          topic: question.topic,
          source: question.source,
          sourceRef: cleanQuestionText(question.sourceRef),
          difficulty: question.difficulty,
          question: cleanQuestionText(question.question),
          options: cleanQuestionOptions(question.options),
          verified: question.verified,
          visualAssetUrl: question.visualAssetUrl ?? null,
          visualAssetAlt: question.visualAssetAlt ? cleanQuestionText(question.visualAssetAlt) : null,
          visualAssetKind: question.visualAssetKind ?? null,
          visualMeta: question.visualMeta ?? null,
          // The key and reasoning unlock only after submission.
          correctIndex: completed ? question.correctIndex : null,
          explanation: completed ? cleanQuestionText(question.explanation) : null,
          optionExplanations: completed ? cleanQuestionOptions(question.optionExplanations ?? []) : null,
        }))
      : undefined,
  };
}

export type SanitizedPracticeTest = ReturnType<typeof sanitizePracticeTest>;
