import type { PracticeQuestionReview, PracticeTest, Prisma } from "@prisma/client";

import { extractJson } from "@/lib/ai-json";
import { db } from "@/lib/db";
import { chatWithAI } from "@/lib/openrouter";
import type { PracticeQuestion, PracticeResult } from "@/lib/practice-engine";

const ANALYSIS_MODELS = ["gemma-4-31b-it", "gemma-4-26b-a4b-it", "gemini-2.5-flash", "gemini-3.5-flash"];

function percent(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function wilson(successes: number, total: number, z = 1.96) {
  if (!total) return { low: 0, high: 0 };
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { low: Number((Math.max(0, center - margin) * 100).toFixed(1)), high: Number((Math.min(1, center + margin) * 100).toFixed(1)) };
}

type Bucket = { name: string; total: number; correct: number; wrong: number; skipped: number; posteriorMastery: number; confidence95: { low: number; high: number }; priority: number };

function buildBuckets(reviews: PracticeQuestionReview[], keyFor: (review: PracticeQuestionReview) => string): Bucket[] {
  const map = new Map<string, { total: number; correct: number; wrong: number; skipped: number }>();
  for (const review of reviews) {
    const name = keyFor(review) || "Unmapped";
    const row = map.get(name) ?? { total: 0, correct: 0, wrong: 0, skipped: 0 };
    row.total += 1;
    if (review.outcome === "CORRECT") row.correct += 1;
    else if (review.outcome === "WRONG") row.wrong += 1;
    else row.skipped += 1;
    map.set(name, row);
  }
  return [...map.entries()].map(([name, row]) => {
    const attempted = row.correct + row.wrong;
    // Beta(2,2) prior prevents tiny one-question buckets from looking certain.
    const posteriorMastery = Number((((row.correct + 2) / (attempted + 4)) * 100).toFixed(1));
    const priority = Number((((row.wrong + row.skipped * 0.7) / Math.max(1, row.total)) * Math.min(1, row.total / 8) * 100).toFixed(1));
    return { name, ...row, posteriorMastery, confidence95: wilson(row.correct, attempted), priority };
  }).sort((a, b) => b.priority - a.priority || b.total - a.total);
}

export function buildPracticeDeterministicAnalysis(test: PracticeTest, reviews: PracticeQuestionReview[]) {
  const questions = Array.isArray(test.questionsJson) ? test.questionsJson as unknown as PracticeQuestion[] : [];
  const result = test.resultJson as unknown as PracticeResult | null;
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const attempted = reviews.filter((review) => review.outcome !== "SKIPPED").length;
  const correct = reviews.filter((review) => review.outcome === "CORRECT").length;
  const wrong = reviews.filter((review) => review.outcome === "WRONG").length;
  const skipped = reviews.length - attempted;
  const difficulty = buildBuckets(reviews, (review) => questionById.get(review.questionId)?.difficulty ?? "UNMAPPED");
  const mistakeTags = [...reviews.reduce((map, review) => {
    if (review.mistakeTag) map.set(review.mistakeTag, (map.get(review.mistakeTag) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].map(([tag, count]) => ({ tag, count, shareOfMisses: percent(count, wrong + skipped) })).sort((a, b) => b.count - a.count);
  const quartileSize = Math.max(1, Math.ceil(reviews.length / 4));
  const quartiles = Array.from({ length: 4 }, (_, index) => {
    const rows = reviews.slice(index * quartileSize, (index + 1) * quartileSize);
    const attemptedRows = rows.filter((review) => review.outcome !== "SKIPPED");
    return { quartile: index + 1, questions: rows.length, accuracy: percent(attemptedRows.filter((review) => review.outcome === "CORRECT").length, attemptedRows.length) };
  }).filter((row) => row.questions);
  const confidence = wilson(correct, attempted);
  return {
    version: "practice-stat-v1",
    generatedAt: new Date().toISOString(),
    test: { id: test.id, title: test.title, mode: test.mode, questions: reviews.length, durationMinutes: test.durationMinutes },
    overview: {
      score: result?.score ?? null,
      maxScore: result?.maxScore ?? null,
      accuracy: percent(correct, attempted),
      confidence95: confidence,
      correct,
      wrong,
      skipped,
      attempted,
      completionRate: percent(attempted, reviews.length),
      activeSeconds: test.totalActiveSeconds ?? result?.timeTakenSeconds ?? null,
      secondsPerAttempt: attempted ? Math.round((test.totalActiveSeconds ?? result?.timeTakenSeconds ?? 0) / attempted) : null,
    },
    subjects: buildBuckets(reviews, (review) => review.subject),
    chapters: buildBuckets(reviews, (review) => `${review.subject} · ${review.chapter}`),
    difficulty,
    mistakeTags,
    quartiles,
    staminaDelta: quartiles.length > 1 ? Number((quartiles[quartiles.length - 1].accuracy - quartiles[0].accuracy).toFixed(1)) : 0,
    evidenceLimits: [
      reviews.some((review) => !review.reviewComplete) ? "Some wrong/skipped questions have no mistake reflection yet." : null,
      reviews.length < 30 ? "This is a small sample; chapter conclusions have wide uncertainty." : null,
    ].filter(Boolean),
  };
}

type Narrative = { headline: string; strengths: string[]; priorities: string[]; recurringMistakes: string[]; nextTestPlan: string[]; caution: string };

export async function generatePracticePerformanceAnalysis(testId: string, userId: string) {
  const test = await db.practiceTest.findFirst({ where: { id: testId, userId, status: "COMPLETED" }, include: { reviews: { orderBy: { questionNumber: "asc" } } } });
  if (!test) throw new Error("Completed practice test not found");
  const deterministic = buildPracticeDeterministicAnalysis(test, test.reviews);
  let narrative: Narrative | null = null;
  let model: string | null = null;
  let error: string | null = null;
  try {
    const response = await chatWithAI([
      { role: "system", content: "You are a careful NEET UG performance coach. Use only the supplied computed evidence. Do not recalculate scores, invent causes, diagnose health, or overstate tiny samples. Return valid JSON only." },
      { role: "user", content: `Interpret this deterministic practice-test analysis for Misti. Keep each item specific, short, and actionable. Respect confidence intervals and evidenceLimits.\n\n${JSON.stringify(deterministic)}\n\nReturn exactly: {"headline":"...","strengths":["..."],"priorities":["..."],"recurringMistakes":["..."],"nextTestPlan":["..."],"caution":"..."}` },
    ], 1800, 0.2, 45000, ANALYSIS_MODELS);
    narrative = extractJson<Narrative>(response.content);
    model = response.model;
    if (!narrative) error = "The model returned an unreadable narrative; deterministic analysis is still complete.";
  } catch (analysisError) {
    error = analysisError instanceof Error ? analysisError.message.slice(0, 1000) : "AI narrative unavailable";
  }
  return db.practicePerformanceAnalysis.create({
    data: {
      testId: test.id,
      userId,
      deterministicJson: deterministic as unknown as Prisma.InputJsonValue,
      narrativeJson: narrative ? narrative as unknown as Prisma.InputJsonValue : undefined,
      model,
      status: narrative ? "READY" : "DETERMINISTIC_ONLY",
      error,
    },
  });
}
