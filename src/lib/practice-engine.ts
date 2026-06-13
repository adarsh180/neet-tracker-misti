import { randomUUID } from "node:crypto";

import type { PracticeTest, Prisma } from "@prisma/client";

import { extractJsonArray } from "@/lib/ai-json";
import { db } from "@/lib/db";
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

// gemma-4-26b-a4b finishes long question batches reliably; 31b consistently
// times out on them, so it rides second here instead of burning the budget.
const PRACTICE_MODELS = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.emergencyFallback];
export const PRACTICE_MIN_QUESTIONS = 50;
export const PRACTICE_MAX_QUESTIONS = 180;
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
  verified: boolean;
  visualAssetUrl?: string | null;
  visualAssetAlt?: string | null;
  visualAssetKind?: string | null;
  visualMeta?: unknown;
};

export type PracticeAnswer = { id: string; optionIndex: number | null };
export type CBTQuestionStatus = "NOT_VISITED" | "NOT_ANSWERED" | "ANSWERED" | "MARKED_FOR_REVIEW" | "ANSWERED_MARKED_FOR_REVIEW";

export type CBTSubmitType = "MANUAL" | "AUTO" | "TIME_UP";
export type CBTAutoSubmitReason = "TAB_SWITCH" | "FULLSCREEN_EXIT" | "BACK_NAVIGATION" | "RELOAD" | "WINDOW_BLUR" | "ROUTE_LEAVE" | "TIME_UP";

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
  const subject = config.subject ? SUBJECT_NAMES[config.subject] : "Mixed";
  if (config.mode === "SUBJECT") return `${subject} sectional · ${config.questionCount} Qs`;
  if (config.mode === "CHAPTER") return `${subject} — ${config.chapter} · ${config.questionCount} Qs`;
  return `${subject} — ${config.topic} · ${config.questionCount} Qs`;
}

export async function createPracticeTest(config: PracticeConfig) {
  const count = Math.max(PRACTICE_MIN_QUESTIONS, Math.min(PRACTICE_MAX_QUESTIONS, Math.round(config.questionCount)));
  const aiFreshPercent = normalizeAiFreshPercent(config.aiFreshPercent);
  const durationMinutes = Math.max(1, Math.min(180, Math.round(config.durationMinutes ?? count)));
  const weakZones = await snapshotWeakZones();
  const testSeed = randomUUID();
  const filters = {
    classLevel: config.classLevel ?? null,
    subjects: config.subjects?.length ? config.subjects : config.subject ? [config.subject] : null,
    chapters: config.chapters?.length ? config.chapters : config.chapter ? [config.chapter] : null,
    topic: config.topic ?? null,
    pyqYear: config.pyqYear ?? null,
  };

  return db.practiceTest.create({
    data: {
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
}

// ---------------------------------------------------------------------------
// Batch generation + blind verification
// ---------------------------------------------------------------------------

function subjectPlanForBatch(test: PracticeTest, batchSize: number, existing: PracticeQuestion[]): string[] {
  if (test.subject) return Array(batchSize).fill(SUBJECT_NAMES[test.subject as PracticeSubjectSlug] ?? test.subject);

  // Full syllabus / PYQ year: keep the NEET 25/25/25/25 balance across the paper.
  const targetPerSubject = Math.ceil(test.questionCount / 4);
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
    return `Every question MUST be a real NEET UG ${test.pyqYear} previous-year question (source "NEET_PYQ", sourceRef "NEET ${test.pyqYear}"). Reproduce the actual exam questions faithfully.`;
  }
  const bioCount = plan.filter((subject) => subject === "Botany" || subject === "Zoology").length;
  return [
    `SOURCE PRIORITY (strict order, label each question):`,
    `1. "NEET_PYQ" — real NEET UG previous-year questions from the last 20+ years (1998–2025). Use for ~50% of the batch. sourceRef like "NEET 2019".`,
    bioCount === plan.length
      ? `2. (JEE_PYQ not applicable — biology batch.)`
      : `2. "JEE_PYQ" — real JEE Main PYQs, ONLY for Physics/Chemistry, single-correct only. ~20%. sourceRef like "JEE Main 2021 (26 Aug Shift 1)".`,
    `3. "INSTITUTE" — questions in the exact style and standard of Allen, Aakash, Physics Wallah, or Motion test series. ~15%. sourceRef like "Allen test-series standard".`,
    `4. "PLATFORM" — questions matching standard problems found on legitimate prep platforms. ~10%.`,
    `5. "AI" — original questions you compose, strictly inside NCERT class 11–12 syllabus. ~5%. sourceRef "Original".`,
    `If you are not CERTAIN of a PYQ's exact wording and answer, do NOT fake it — use a lower-priority source label instead. Never mislabel.`,
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

  // Plain-text bullets, NOT a JSON array — a JSON string list here teaches the
  // model to mimic that flat shape and break the output schema.
  const avoid = existing.slice(-24).map((question) => `• ${question.question.slice(0, 70).replace(/\s+/g, " ")}`).join("\n");

  return [
    `You are the question-setter for a NEET UG practice paper. Produce EXACTLY ${batchSize} single-correct MCQs as a JSON array. NTA standard: 4 options, one correct, +4/−1 marking.`,
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
2. Each item: { "subject": "Physics|Chemistry|Botany|Zoology", "chapter": "exact NCERT chapter", "topic": "specific topic", "source": "NEET_PYQ|JEE_PYQ|INSTITUTE|PLATFORM|NCERT|AI", "sourceRef": "string", "difficulty": "EASY|MODERATE|TOUGH", "question": "string", "options": ["A","B","C","D"], "correctIndex": 0-3, "explanation": "1-3 short sentences on why the key is right" }
3. Write all math/chemistry in LaTeX: inline $...$. Use \\times for multiplication. Plain text for biology.
4. Options must be plausible, mutually exclusive, similar length. Exactly one correct.
5. Assertion-Reason and Match-the-column formats are allowed (state them fully in the question text).
6. The correctIndex MUST be verifiably correct — solve each question yourself before keying it.
7. Write clean UTF-8 text only. For equations prefer LaTeX commands like \\times, \\Delta, \\leq, \\geq, \\to, \\mu, and \\pi. Never output broken encoding artifacts or unreadable copied symbols.
8. BE COMPACT: keep each question under 90 words, each option under 18 words, each explanation under 45 words. The whole array must stay well under 3000 tokens.
9. Every array item MUST be a complete JSON object wrapped in { } with all the keys from rule 2.${avoid ? `\n10. Do not repeat these already-used questions:\n${avoid}` : ""}`,
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

export async function generateNextBatch(testId: string) {
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
        await requestStrictTopUp(shortfall);
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
      // Attempt 1: gemma-4 lane. Attempt 2: flash, which is more schema-reliable,
      // when the first response can't be parsed into valid questions.
      for (const lane of [PRACTICE_MODELS, [AI_MODELS.emergencyFallback]]) {
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
      await requestStrictTopUp(shortfall);
      fallbackBankQuestions = await addBankQuestions(shortfall);
      if (fallbackBankQuestions.length < shortfall) {
        generationWarnings.push(`Question assembly is waiting for ${shortfall - fallbackBankQuestions.length} more strict verified row(s).`);
      }
    }
    if (batchSize > 0 && added.length < batchSize) {
      model = `${model ?? "ai"}+bank-fallback`;
    }
  }

  const done = existing.length >= test.questionCount;
  // On completion, re-index to unique sequential ids. Bank + AI-fresh assembly can
  // otherwise collide ids (two "q50"), which corrupts the answer map and the review.
  // Safe because the exam only ever uses the READY snapshot.
  const questions = done ? existing.map((question, index) => ({ ...question, id: `q${index + 1}` })) : existing;
  const distributionAudit = buildDistributionAudit(questions, {
    blueprintWarnings: [...assemblyAudits.flatMap((audit) => audit.warnings), ...generationWarnings],
    assemblyAudits: strictFillReports.length ? [...assemblyAudits, { strictFillReports }] : assemblyAudits,
  });

  const updated = await db.practiceTest.update({
    where: { id: test.id },
    data: {
      questionsJson: questions as unknown as Prisma.InputJsonValue,
      status: done ? "READY" : "GENERATING",
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
    retryAfterMs: done ? 0 : 60000,
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
    percentage: maxScore ? Math.round((Math.max(score, 0) / maxScore) * 1000) / 10 : 0,
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

  const updated = await db.practiceTest.update({
    where: { id: test.id },
    data: {
      status: "COMPLETED",
      answersJson: answers as unknown as Prisma.InputJsonValue,
      questionStatusesJson: (meta.questionStatuses ?? test.questionStatusesJson ?? null) as Prisma.InputJsonValue,
      currentQuestionIndex: Number.isInteger(meta.currentQuestionIndex) ? Number(meta.currentQuestionIndex) : test.currentQuestionIndex,
      remainingSeconds: Number.isFinite(Number(meta.remainingSeconds)) ? Math.max(0, Math.round(Number(meta.remainingSeconds))) : test.remainingSeconds,
      pauseLogsJson: (meta.pauseLogs ?? test.pauseLogsJson ?? null) as Prisma.InputJsonValue,
      securityEventsJson: (meta.securityEvents ?? test.securityEventsJson ?? null) as Prisma.InputJsonValue,
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

// ---------------------------------------------------------------------------
// Client sanitization
// ---------------------------------------------------------------------------

export function sanitizePracticeTest(test: PracticeTest, includeQuestions = true) {
  const questions = (test.questionsJson as unknown as PracticeQuestion[]) ?? [];
  const completed = test.status === "COMPLETED";

  return {
    id: test.id,
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
        }))
      : undefined,
  };
}

export type SanitizedPracticeTest = ReturnType<typeof sanitizePracticeTest>;
