import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAIContext, buildSystemPrompt, type AIContext } from "@/lib/ai-context-builder";
import { chatWithAI } from "@/lib/openrouter";
import { getPrivateSession } from "@/lib/server-auth";
import { isPrismaConnectionError } from "@/lib/prisma-errors";
import {
  MISTI_PREVIOUS_ATTEMPTS,
  estimateCalibratedRank,
  getPreviousAttemptSummary,
  getRankCalibrationPromptSummary,
} from "@/lib/neet-rank-calibration";
import {
  buildChapterRankIntelligence,
  getRankIntelligencePromptSummary,
  type ChapterRankSignal,
  type SubjectRankSignal,
} from "@/lib/neet-rank-intelligence";

type RankAnalysis = {
  currentScore: number;
  predictedScoreMin: number;
  predictedScoreMax: number;
  predictedRankMin: number;
  predictedRankMax: number;
  confidence: number;
  aimsRishikeshGap: number;
  aimsDelhiGap: number;
  subjectBreakdown: {
    subject: string;
    currentLevel: number;
    targetLevel: number;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }[];
  chapterFocus?: ChapterRankSignal[];
  subjectExamSignals?: SubjectRankSignal[];
  sourceNotes?: string[];
  bluffFlags: string[];
  weeklyPlan: string;
  overallAnalysis: string;
  strictMessage: string;
};

type SubjectName = "Physics" | "Chemistry" | "Botany" | "Zoology";

const SUBJECT_NAMES: SubjectName[] = ["Physics", "Chemistry", "Botany", "Zoology"];

const NEET_TOTAL_MARKS = 720;
const SUBJECT_MAX_MARKS: Record<SubjectName, number> = {
  Physics: 180,
  Chemistry: 180,
  Botany: 180,
  Zoology: 180,
};
const SUBJECT_TOTAL_MARKS = SUBJECT_NAMES.reduce((sum, subject) => sum + SUBJECT_MAX_MARKS[subject], 0);

const AIIMS_RISHIKESH_SCORE_TARGET = 660;
const AIIMS_DELHI_SCORE_TARGET = 700;

const FULL_TEST_PATTERNS = /\b(full|flt|aits|mock|real|neet)\b/i;

type DeterministicEvidence = {
  subjectBreakdown: RankAnalysis["subjectBreakdown"];
  currentScore: number;
  predictedScoreMin: number;
  predictedScoreMax: number;
  predictedRankMin: number;
  predictedRankMax: number;
  confidence: number;
  band: number;
  fullLengthTests: number;
  partialTests: number;
  dataUnavailable: boolean;
  scoreModelNote: string;
  rankCalibrationNote: string;
  previousAttempts: ReturnType<typeof getPreviousAttemptSummary>;
  chapterFocus: ChapterRankSignal[];
  subjectExamSignals: SubjectRankSignal[];
  sourceNotes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function estimateRank(score: number) {
  return estimateCalibratedRank(clamp(score, 0, NEET_TOTAL_MARKS)).rank;
}

function getSubjectLevel(context: AIContext, subjectName: string) {
  const subject = context.subjects.find((item) => item.name.toLowerCase() === subjectName.toLowerCase());
  if (!subject || subject.totalTopics === 0) return 0;

  const completionSignal = (subject.completedTopics / subject.totalTopics) * 35;
  const questionSignal = Math.min(subject.totalQuestionsInTopics / 900, 1) * 18;
  const revisionSignal = clamp(12 - subject.pendingRevisions * 1.4, 0, 12);
  const subjectTests = context.recentTests.filter((test) => test.subjectName === subjectName);
  const testSignal = subjectTests.length
    ? weightedAverage(subjectTests.map((test, index) => ({
        value: clamp(test.percentage, 0, 100),
        weight: Math.max(1, 10 - index),
      }))) * 0.3
    : 0;
  const dailySubjectWork = context.recentDailyGoals.filter((goal) => goal.subjectName === subjectName);
  const recentWorkSignal = clamp(
    dailySubjectWork.reduce((sum, goal) => sum + goal.hoursStudied * 0.7 + goal.questionsSolved / 25, 0),
    0,
    5
  );
  const errorPenalty = clamp(
    (context.errorAnalysis || [])
      .filter((error) => error.subject === subjectName)
      .reduce((sum, error) => sum + error.frequency, 0) * 0.8,
    0,
    10
  );

  return Math.round(clamp(completionSignal + questionSignal + revisionSignal + testSignal + recentWorkSignal - errorPenalty, 0, 100));
}

function weightedAverage(items: { value: number; weight: number }[]) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function isFullLengthTest(test: AIContext["recentTests"][number]) {
  if (!test.subjectName) return true;
  if (test.maxScore >= 500) return true;
  return FULL_TEST_PATTERNS.test(`${test.testType} ${test.testName}`);
}

function normalizedNeetScore(test: AIContext["recentTests"][number]) {
  return clamp((test.score / Math.max(test.maxScore, 1)) * NEET_TOTAL_MARKS, 0, NEET_TOTAL_MARKS);
}

function reliabilityWeight(level: string | null | undefined) {
  if (level === "HIGH") return 1.15;
  if (level === "LOW") return 0.7;
  return 1;
}

function difficultyAdjustment(level: string | null | undefined) {
  if (level === "HARD") return 1.04;
  if (level === "EASY") return 0.97;
  return 1;
}

function adjustedNeetScore(test: AIContext["recentTests"][number]) {
  return clamp(normalizedNeetScore(test) * difficultyAdjustment(test.difficultyLevel), 0, NEET_TOTAL_MARKS);
}

function hasDetailedRankSignals(test: AIContext["recentTests"][number]) {
  return [
    test.correctCount,
    test.wrongCount,
    test.skippedCount,
    test.guessedCount,
    test.negativeMarksLost,
    test.staminaDecay,
    test.physicsScore,
    test.chemistryScore,
    test.botanyScore,
    test.zoologyScore,
    test.physicsTimeMinutes,
    test.chemistryTimeMinutes,
    test.botanyTimeMinutes,
    test.zoologyTimeMinutes,
    test.difficultyLevel,
    test.reliabilityLevel,
    test.linkedErrorLogTestId,
  ].some((value) => value !== null && value !== undefined && value !== "");
}

function hasAllSectionScores(test: AIContext["recentTests"][number]) {
  return [test.physicsScore, test.chemistryScore, test.botanyScore, test.zoologyScore]
    .every((value) => typeof value === "number" && Number.isFinite(value));
}

function testRiskPenalty(test: AIContext["recentTests"][number]) {
  const guessPenalty = Math.min(test.guessedCount ?? 0, 40) * 0.25;
  const negativePenalty = Math.min(test.negativeMarksLost ?? 0, 120) * 0.08;
  const staminaPenalty = Math.max(0, (test.staminaDecay ?? 0) - 6) * 2.5;
  return guessPenalty + negativePenalty + staminaPenalty;
}

function getLatestValidatedAttemptScore() {
  return MISTI_PREVIOUS_ATTEMPTS[MISTI_PREVIOUS_ATTEMPTS.length - 1]?.score ?? null;
}

function getHistoricalScoreFloor(hasFullLengthEvidence: boolean, hasPartialEvidence: boolean, dataUnavailable: boolean) {
  if (hasFullLengthEvidence) return 0;

  const latestValidatedAttemptScore = getLatestValidatedAttemptScore();
  if (latestValidatedAttemptScore === null) return 0;

  const regressionAllowance = dataUnavailable ? 130 : hasPartialEvidence ? 90 : 100;
  return clamp(latestValidatedAttemptScore - regressionAllowance, 0, NEET_TOTAL_MARKS);
}

function buildDeterministicEvidence(context: AIContext): DeterministicEvidence {
  const rankIntelligence = buildChapterRankIntelligence(context);

  const subjectBreakdown = SUBJECT_NAMES.map((subject) => {
    const smartSubject = rankIntelligence.subjectSignals.find((item) => item.subject === subject);
    const currentLevel = smartSubject?.mastery ?? getSubjectLevel(context, subject);
    const gap = 90 - currentLevel;

    return {
      subject,
      currentLevel,
      targetLevel: 90,
      priority: smartSubject?.priority ?? (gap >= 35 || currentLevel < 55 ? "HIGH" as const : gap >= 18 ? "MEDIUM" as const : "LOW" as const),
    };
  });

  const skillBasedNeetScore = rankIntelligence.smartScore || subjectBreakdown.reduce((sum, subject) => {
    const maxRaw = SUBJECT_MAX_MARKS[subject.subject as SubjectName];
    return sum + (subject.currentLevel / 100) * maxRaw;
  }, 0);

  const fullLengthTests = context.recentTests.filter(isFullLengthTest);
  const partialTests = context.recentTests.filter((test) => !isFullLengthTest(test));
  const fullTestScore = fullLengthTests.length
    ? weightedAverage(fullLengthTests.map((test, index) => ({
        value: adjustedNeetScore(test),
        weight: Math.max(1, 12 - index * 2) * reliabilityWeight(test.reliabilityLevel),
      })))
    : null;
  const partialTestScore = partialTests.length
    ? weightedAverage(partialTests.map((test, index) => ({
        value: adjustedNeetScore(test),
        weight: Math.max(1, 8 - index) * reliabilityWeight(test.reliabilityLevel),
      })))
    : null;
  const latestValidatedAttemptScore = getLatestValidatedAttemptScore();
  const attemptAdjustedSkillScore = latestValidatedAttemptScore === null
    ? skillBasedNeetScore
    : skillBasedNeetScore * 0.35 + latestValidatedAttemptScore * 0.65;

  const dataUnavailable = context.dataHealth?.databaseAvailable === false;
  const rawCurrentScore = Math.round(clamp(
    fullTestScore !== null
      ? fullTestScore * 0.72 + skillBasedNeetScore * 0.28
      : partialTestScore !== null
        ? partialTestScore * 0.4 + skillBasedNeetScore * 0.25 + (latestValidatedAttemptScore ?? skillBasedNeetScore) * 0.35
        : attemptAdjustedSkillScore * 0.82,
    0,
    NEET_TOTAL_MARKS
  ));
  const currentScore = Math.round(clamp(
    fullTestScore !== null
      ? rawCurrentScore
      : Math.max(rawCurrentScore, (latestValidatedAttemptScore ?? rawCurrentScore) - (partialTestScore !== null ? 55 : 35)),
    0,
    NEET_TOTAL_MARKS
  ));

  const detailedTestSignals = context.recentTests.filter(hasDetailedRankSignals).length;
  const sectionScoreTests = context.recentTests.filter(hasAllSectionScores).length;
  const linkedErrorLogTests = context.recentTests.filter((test) => test.linkedErrorLogTestId).length;
  const recentRiskPenalty = context.recentTests.slice(0, 5).reduce((sum, test) => sum + testRiskPenalty(test), 0);
  const baseBand = dataUnavailable
    ? 110
    : fullLengthTests.length >= 3
      ? 30
      : fullLengthTests.length === 2
        ? 42
        : fullLengthTests.length === 1
          ? 55
          : partialTests.length
            ? 68
            : 88;
  const band = Math.round(clamp(
    baseBand -
      context.last7DaysSummary.activeDays * 1.8 -
      Math.min(context.consistencyStreak, 7) -
      sectionScoreTests * 7 -
      detailedTestSignals * 2 +
      recentRiskPenalty * 0.35,
    22,
    115
  ));
  const historicalScoreFloor = getHistoricalScoreFloor(fullLengthTests.length > 0, partialTests.length > 0, dataUnavailable);
  const predictedScoreMin = Math.round(clamp(Math.max(currentScore - band, historicalScoreFloor), 0, NEET_TOTAL_MARKS));
  const predictedScoreMax = Math.round(clamp(Math.max(currentScore + band, predictedScoreMin + 30), 0, NEET_TOTAL_MARKS));

  const uncappedConfidence = dataUnavailable
    ? 12
    : 24 +
      fullLengthTests.length * 14 +
      partialTests.length * 4 +
      detailedTestSignals * 5 +
      sectionScoreTests * 8 +
      linkedErrorLogTests * 4 +
      context.last7DaysSummary.activeDays * 3 +
      Math.min(context.consistencyStreak, 10) * 2 +
      Math.min((context.errorAnalysis || []).length, 6) -
      Math.min(Math.round(recentRiskPenalty / 4), 10);
  const confidenceCap = dataUnavailable
    ? 15
    : fullLengthTests.length === 0
      ? (partialTests.length ? 58 : 35)
      : fullLengthTests.length < 3
        ? 78
        : 88;
  const confidence = Math.round(clamp(uncappedConfidence, 12, confidenceCap));

  return {
    subjectBreakdown,
    currentScore,
    predictedScoreMin,
    predictedScoreMax,
    predictedRankMin: estimateRank(predictedScoreMax),
    predictedRankMax: estimateRank(predictedScoreMin),
    confidence,
    band,
    fullLengthTests: fullLengthTests.length,
    partialTests: partialTests.length,
    dataUnavailable,
    scoreModelNote: `NEET score model: Physics 180, Chemistry 180, Botany 180, Zoology 180, total ${SUBJECT_TOTAL_MARKS}. Skill score is now chapter-weighted using PYQ/ROI priors, logged completion, question depth, revision health, tests, and error logs. All score fields are clamped to ${NEET_TOTAL_MARKS}.`,
    rankCalibrationNote: "Ranks are estimated from source-backed NEET marks-vs-rank anchors from 2016-2025, with recent years weighted more heavily and 2024 down-weighted as anomalous.",
    previousAttempts: getPreviousAttemptSummary(),
    chapterFocus: rankIntelligence.chapterSignals.slice(0, 12),
    subjectExamSignals: rankIntelligence.subjectSignals,
    sourceNotes: rankIntelligence.sourceNotes,
  };
}

function buildDeterministicRankAnalysis(context: AIContext, reason: unknown): RankAnalysis {
  const evidence = buildDeterministicEvidence(context);
  const bluffFlags = [
    ...(evidence.dataUnavailable ? ["Live tracker database was unreachable, so study logs and tests could not be verified."] : []),
    ...(context.recentTests.length === 0 ? ["No recent test records are available, so rank confidence is intentionally capped low."] : []),
    ...(evidence.fullLengthTests === 0 && evidence.partialTests > 0 ? ["Only partial or subject-wise tests are available, so the 720-score estimate is extrapolated."] : []),
    "Previous validated NEET attempt marks are a hard historical anchor: 2023 = 192, 2024 = 296, 2025 = 322, 2026 = 410.",
  ];
  const failureReason = reason instanceof Error ? reason.message.split("\n")[0] : String(reason);

  return {
    currentScore: evidence.currentScore,
    predictedScoreMin: evidence.predictedScoreMin,
    predictedScoreMax: evidence.predictedScoreMax,
    predictedRankMin: evidence.predictedRankMin,
    predictedRankMax: evidence.predictedRankMax,
    confidence: evidence.confidence,
    aimsRishikeshGap: Math.max(0, AIIMS_RISHIKESH_SCORE_TARGET - evidence.predictedScoreMax),
    aimsDelhiGap: Math.max(0, AIIMS_DELHI_SCORE_TARGET - evidence.predictedScoreMax),
    subjectBreakdown: evidence.subjectBreakdown,
    chapterFocus: evidence.chapterFocus,
    subjectExamSignals: evidence.subjectExamSignals,
    sourceNotes: evidence.sourceNotes,
    bluffFlags,
    weeklyPlan: `Use this fallback plan until the AI service is healthy: take one full syllabus diagnostic test out of 720, review every wrong answer the same day, and attack these chapter bottlenecks first: ${evidence.chapterFocus.slice(0, 5).map((item) => `${item.subject} ${item.chapter}`).join(", ") || "highest-damage chapters from the tracker"}. Log study hours plus questions so the next prediction can use real evidence.`,
    overallAnalysis: `Google AI Studio did not return a usable response (${failureReason}), so this is a deterministic fallback based on the tracker context currently available to the app. ${evidence.scoreModelNote} Rank is recomputed from the score range, not invented by the model.`,
    strictMessage: evidence.dataUnavailable
      ? "The database and AI model are both unavailable right now, so do not treat this as a final rank prediction. Fix connectivity, log real test data, and rerun."
      : "The AI model failed, so this fallback is useful for direction only. Your real accountability still comes from full-length tests, logged revision, and subject-wise error review.",
  };
}

function parseRankAnalysis(content: string): RankAnalysis {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]) as RankAnalysis;
}

function safeNumber(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safePriority(value: unknown, fallback: "HIGH" | "MEDIUM" | "LOW") {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : fallback;
}

function normalizeRankAnalysis(modelOutput: RankAnalysis, context: AIContext): RankAnalysis {
  const evidence = buildDeterministicEvidence(context);
  const output = modelOutput || ({} as RankAnalysis);

  const currentScore = Math.round(clamp(
    safeNumber(output.currentScore, evidence.currentScore),
    Math.max(0, evidence.currentScore - 35),
    Math.min(NEET_TOTAL_MARKS, evidence.currentScore + 35)
  ));
  let predictedScoreMin = Math.round(clamp(safeNumber(output.predictedScoreMin, evidence.predictedScoreMin), 0, NEET_TOTAL_MARKS));
  let predictedScoreMax = Math.round(clamp(safeNumber(output.predictedScoreMax, evidence.predictedScoreMax), 0, NEET_TOTAL_MARKS));

  if (predictedScoreMin > predictedScoreMax) {
    [predictedScoreMin, predictedScoreMax] = [predictedScoreMax, predictedScoreMin];
  }

  const maxAllowedBand = evidence.band + 30;
  const historicalScoreFloor = getHistoricalScoreFloor(evidence.fullLengthTests > 0, evidence.partialTests > 0, evidence.dataUnavailable);
  predictedScoreMin = Math.round(clamp(predictedScoreMin, Math.max(historicalScoreFloor, evidence.currentScore - maxAllowedBand), Math.min(NEET_TOTAL_MARKS, evidence.currentScore + maxAllowedBand)));
  predictedScoreMax = Math.round(clamp(predictedScoreMax, Math.max(0, evidence.currentScore - maxAllowedBand), Math.min(NEET_TOTAL_MARKS, evidence.currentScore + maxAllowedBand)));
  predictedScoreMax = Math.max(predictedScoreMax, Math.min(NEET_TOTAL_MARKS, predictedScoreMin + 30));
  if (predictedScoreMin > predictedScoreMax) {
    [predictedScoreMin, predictedScoreMax] = [predictedScoreMax, predictedScoreMin];
  }

  const confidence = Math.round(clamp(safeNumber(output.confidence, evidence.confidence), 0, evidence.confidence));
  const modelFlags = Array.isArray(output.bluffFlags)
    ? output.bluffFlags.filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0)
    : [];
  const guardFlags = [
    evidence.dataUnavailable ? "Live tracker database was unreachable, so this prediction cannot verify real logs." : "",
    evidence.fullLengthTests === 0 ? "No recent full-length 720-mark test is available; confidence is capped by design." : "",
    evidence.scoreModelNote,
    "Validated real NEET attempts are enforced as a historical anchor: 2023 = 192, 2024 = 296, 2025 = 322, 2026 = 410.",
  ].filter(Boolean);

  return {
    currentScore,
    predictedScoreMin,
    predictedScoreMax,
    predictedRankMin: estimateRank(predictedScoreMax),
    predictedRankMax: estimateRank(predictedScoreMin),
    confidence,
    aimsRishikeshGap: Math.max(0, AIIMS_RISHIKESH_SCORE_TARGET - predictedScoreMax),
    aimsDelhiGap: Math.max(0, AIIMS_DELHI_SCORE_TARGET - predictedScoreMax),
    subjectBreakdown: evidence.subjectBreakdown.map((fallbackSubject) => {
      const modelSubject = output.subjectBreakdown?.find((item) => item.subject === fallbackSubject.subject);
      const currentLevel = Math.round(clamp(safeNumber(modelSubject?.currentLevel, fallbackSubject.currentLevel), 0, 100));
      const targetLevel = Math.round(clamp(safeNumber(modelSubject?.targetLevel, fallbackSubject.targetLevel), 0, 100));
      return {
        subject: fallbackSubject.subject,
        currentLevel,
        targetLevel,
        priority: safePriority(modelSubject?.priority, fallbackSubject.priority),
      };
    }),
    chapterFocus: evidence.chapterFocus,
    subjectExamSignals: evidence.subjectExamSignals,
    sourceNotes: evidence.sourceNotes,
    bluffFlags: [...new Set([...modelFlags, ...guardFlags])],
    weeklyPlan: safeText(output.weeklyPlan, "Take one full-length 720-mark diagnostic, review all mistakes the same day, and spend the next six days on the two highest-priority subjects with logged question practice."),
    overallAnalysis: safeText(
      output.overallAnalysis,
      `Deterministic prediction used because the model output was incomplete. ${evidence.scoreModelNote} ${evidence.rankCalibrationNote}`
    ),
    strictMessage: safeText(
      output.strictMessage,
      "This prediction is mathematically guarded, but it will become reliable only after repeated full-length 720-mark test data is logged."
    ),
  };
}

export async function POST(request: Request) {
  try {
    const session = await getPrivateSession();
    if (!session) return NextResponse.json({ error: "Private session required" }, { status: 401 });

    const body = await request.json().catch(() => null) as { intent?: string } | null;
    if (body?.intent !== "manual-rank-prediction") {
      return NextResponse.json({ error: "Rank prediction runs only after a manual button click." }, { status: 400 });
    }

    const context = await buildAIContext(session.userId, {
      includeWellness: false,
      includeScreenTime: false,
      includeErrorLogs: true,
    });
    const systemPrompt = buildSystemPrompt(context, "rank");
    const deterministicEvidence = buildDeterministicEvidence(context);
    const rankCalibration = getRankCalibrationPromptSummary();
    const rankIntelligence = getRankIntelligencePromptSummary(buildChapterRankIntelligence(context));

    const databaseNotice = context.dataHealth?.databaseAvailable === false
      ? "\n\nImportant: The live tracker database is currently unreachable. Treat this as a provisional, low-confidence analysis based only on safe defaults. Clearly say that the real study logs, test records, and completion data could not be loaded, and do not pretend this is a complete data-backed prediction."
      : "";

    const analysisPrompt = `Based on all the data provided about Misti, whose original name is Divyani, perform a comprehensive NEET rank prediction analysis. Misti and Divyani are the same person. Never treat them as two students.

Non-negotiable NEET marks schema:
Total NEET UG score is 720.
Physics maximum is 180.
Chemistry maximum is 180.
Botany maximum is 180.
Zoology maximum is 180.
Never use 90 as subject maximum marks in this rank prediction. Never return any score below 0 or above 720.

Deterministic mathematical baseline from the app. You may use your reasoning for prose and bottleneck analysis, but your score range must stay close to this evidence unless the raw context strongly proves otherwise:
${JSON.stringify(deterministicEvidence, null, 2)}

Historical rank calibration available to you:
${JSON.stringify(rankCalibration, null, 2)}

Chapter/topic PYQ and ROI intelligence available to you:
${JSON.stringify(rankIntelligence, null, 2)}

Include:

1. Estimated NEET score range (out of 720)
2. Predicted rank range
3. Subject-wise strength/weakness analysis
4. Comparison with AIIMS Delhi cutoff (~700+ score, rank ~50) and AIIMS Rishikesh (~660+, rank ~200-500)
5. Time remaining vs. preparation gap analysis  
6. Specific weekly action plan to close the gap
7. Bluff check: flag any inconsistencies between claimed progress and actual data

Hallucination guard:
Use logged tests, syllabus progress, revision state, error patterns, study hours, and consistency only.
Use chapter/topic intelligence to rank bottlenecks, but do not treat chapter weightage as official future certainty.
Respect the time-benefit rule: Rotational Motion is medium priority unless there is strong direct test evidence requiring more.
Treat real NEET attempts as a hard historical anchor: 2023 = 192, 2024 = 296, 2025 = 322, 2026 = 410 (her most recent real attempt, taken 2026-06-21, and her best real score so far). Do not claim the current validated baseline is below 410 unless a newer full-length 720-mark test proves collapse.
If evidence is missing, say confidence is low instead of inventing certainty.
Confidence must be evidence-based, never 100, and must be low when no full-length tests exist.
PredictedRankMin must be the better rank from predictedScoreMax. PredictedRankMax must be the worse rank from predictedScoreMin.
Do not invent exact AIR, exact cutoff, exact future paper difficulty, or fake records.

Write without asterisks, dashes, or markdown. Use clean paragraphs. Be precise with numbers. Be strict but constructive.

Return a JSON object with this structure:
{
  "currentScore": 450,
  "predictedScoreMin": 440,
  "predictedScoreMax": 520,
  "predictedRankMin": 15000,
  "predictedRankMax": 40000,
  "confidence": 72,
  "aimsRishikeshGap": 150,
  "aimsDelhiGap": 200,
  "subjectBreakdown": [
    {"subject": "Physics", "currentLevel": 45, "targetLevel": 90, "priority": "HIGH"},
    {"subject": "Chemistry", "currentLevel": 50, "targetLevel": 90, "priority": "HIGH"},
    {"subject": "Botany", "currentLevel": 60, "targetLevel": 90, "priority": "MEDIUM"},
    {"subject": "Zoology", "currentLevel": 55, "targetLevel": 90, "priority": "HIGH"}
  ],
  "bluffFlags": [],
  "weeklyPlan": "Study plan text here",
  "overallAnalysis": "Detailed analysis paragraph here",
  "strictMessage": "Your honest mentor message here"
}${databaseNotice}`;

    let parsed: RankAnalysis;
    let model = "deterministic-fallback";
    let aiFallbackReason: string | undefined;

    try {
      const res = await chatWithAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: analysisPrompt },
      ], 4096, 0.2, 90000);

      parsed = normalizeRankAnalysis(parseRankAnalysis(res.content), context);
      model = res.model;
    } catch (error) {
      aiFallbackReason = error instanceof Error ? error.message : String(error);
      console.warn("[rank-predict] AI generation failed; using deterministic fallback.", error);
      parsed = buildDeterministicRankAnalysis(context, error);
    }

    let historySaved = true;
    try {
      await db.rankPrediction.create({
        data: {
          predictedRank: parsed.predictedRankMin || 999999,
          predictedScore: parsed.predictedScoreMin || 0,
          confidence: parsed.confidence || 0,
          analysisJson: JSON.stringify(parsed),
        },
      });
    } catch (error) {
      if (!isPrismaConnectionError(error)) throw error;
      historySaved = false;
      console.warn("[rank-predict] Prediction generated but history was not saved because the database is unavailable.", error);
    }

    return NextResponse.json({
      ...parsed,
      model,
      aiFallbackReason,
      historySaved,
      dataNotice: context.dataHealth?.databaseAvailable === false ? context.dataHealth.note : undefined,
    });
  } catch (err) {
    console.error("[rank-predict]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getPrivateSession();
    if (!session) return NextResponse.json({ error: "Private session required" }, { status: 401 });

    const predictions = await db.rankPrediction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json(predictions.map((p) => ({
      ...p,
      analysis: JSON.parse(p.analysisJson),
    })));
  } catch (err) {
    if (isPrismaConnectionError(err)) return NextResponse.json([]);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
