import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAIContext, buildSystemPrompt, type AIContext } from "@/lib/ai-context-builder";
import { chatWithAI } from "@/lib/openrouter";
import { getPrivateSession } from "@/lib/server-auth";
import { isPrismaConnectionError } from "@/lib/prisma-errors";

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
  bluffFlags: string[];
  weeklyPlan: string;
  overallAnalysis: string;
  strictMessage: string;
};

const SUBJECT_MAX_MARKS: Record<string, number> = {
  Physics: 180,
  Chemistry: 180,
  Botany: 180,
  Zoology: 180,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function estimateRank(score: number) {
  if (score >= 700) return 50;
  if (score >= 680) return 250;
  if (score >= 660) return 500;
  if (score >= 620) return 7000;
  if (score >= 580) return 20000;
  if (score >= 540) return 50000;
  if (score >= 500) return 100000;
  if (score >= 450) return 200000;
  if (score >= 400) return 400000;
  return 900000;
}

function getSubjectLevel(context: AIContext, subjectName: string) {
  const subject = context.subjects.find((item) => item.name.toLowerCase() === subjectName.toLowerCase());
  if (!subject || subject.totalTopics === 0) return 0;

  const completionSignal = (subject.completedTopics / subject.totalTopics) * 55;
  const questionSignal = Math.min(subject.totalQuestionsInTopics / 800, 1) * 20;
  const revisionSignal = clamp(10 - subject.pendingRevisions * 2, 0, 10);
  const subjectTests = context.recentTests.filter((test) => test.subjectName === subjectName);
  const testSignal = subjectTests.length
    ? (subjectTests.reduce((sum, test) => sum + test.percentage, 0) / subjectTests.length) * 0.15
    : 0;

  return Math.round(clamp(completionSignal + questionSignal + revisionSignal + testSignal, 0, 100));
}

function buildDeterministicRankAnalysis(context: AIContext, reason: unknown): RankAnalysis {
  const subjectNames = Object.keys(SUBJECT_MAX_MARKS);
  const subjectBreakdown = subjectNames.map((subject) => {
    const currentLevel = getSubjectLevel(context, subject);
    const gap = 90 - currentLevel;

    return {
      subject,
      currentLevel,
      targetLevel: 90,
      priority: gap >= 35 || currentLevel < 55 ? "HIGH" as const : gap >= 18 ? "MEDIUM" as const : "LOW" as const,
    };
  });

  const completionBasedScore = subjectBreakdown.reduce(
    (sum, subject) => sum + (subject.currentLevel / 100) * (SUBJECT_MAX_MARKS[subject.subject] || 180),
    0
  );
  const recentTestScore = context.recentTests.length
    ? context.recentTests.reduce((sum, test) => sum + (test.score / Math.max(test.maxScore, 1)) * 720, 0) / context.recentTests.length
    : null;
  const currentScore = Math.round(clamp(
    recentTestScore === null ? completionBasedScore * 0.9 : recentTestScore * 0.65 + completionBasedScore * 0.35,
    0,
    720
  ));
  const dataUnavailable = context.dataHealth?.databaseAvailable === false;
  const band = dataUnavailable ? 90 : context.recentTests.length ? 35 : 60;
  const predictedScoreMin = Math.round(clamp(currentScore - band, 0, 720));
  const predictedScoreMax = Math.round(clamp(currentScore + band, 0, 720));
  const confidence = dataUnavailable
    ? 12
    : Math.round(clamp(30 + context.recentTests.length * 5 + context.last7DaysSummary.activeDays * 3 + context.consistencyStreak * 2, 20, 82));
  const bluffFlags = [
    ...(dataUnavailable ? ["Live tracker database was unreachable, so study logs and tests could not be verified."] : []),
    ...(context.recentTests.length === 0 ? ["No recent test records are available, so rank confidence is low."] : []),
  ];
  const failureReason = reason instanceof Error ? reason.message.split("\n")[0] : String(reason);

  return {
    currentScore,
    predictedScoreMin,
    predictedScoreMax,
    predictedRankMin: estimateRank(predictedScoreMax),
    predictedRankMax: estimateRank(predictedScoreMin),
    confidence,
    aimsRishikeshGap: Math.max(0, 660 - predictedScoreMax),
    aimsDelhiGap: Math.max(0, 700 - predictedScoreMax),
    subjectBreakdown,
    bluffFlags,
    weeklyPlan: "Use this fallback plan until the AI service is healthy: take one full syllabus diagnostic test, review every wrong answer the same day, assign two high-priority subject blocks daily, and log study hours plus questions so the next prediction can use real evidence.",
    overallAnalysis: `Google AI Studio did not return a usable response (${failureReason}), so this is a deterministic fallback based on the tracker context currently available to the app. It preserves the rank predictor flow, but it should be treated as lower confidence than the normal AI analysis.`,
    strictMessage: dataUnavailable
      ? "The database and AI model are both unavailable right now, so do not treat this as a final rank prediction. Fix connectivity, log real test data, and rerun."
      : "The AI model failed, so this fallback is useful for direction only. Your real accountability still comes from full-length tests, logged revision, and subject-wise error review.",
  };
}

function parseRankAnalysis(content: string): RankAnalysis {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]) as RankAnalysis;
}

export async function POST() {
  try {
    const session = await getPrivateSession();
    if (!session) return NextResponse.json({ error: "Private session required" }, { status: 401 });

    const context = await buildAIContext(session.userId);
    const systemPrompt = buildSystemPrompt(context, "rank");

    const databaseNotice = context.dataHealth?.databaseAvailable === false
      ? "\n\nImportant: The live tracker database is currently unreachable. Treat this as a provisional, low-confidence analysis based only on safe defaults. Clearly say that the real study logs, test records, and completion data could not be loaded, and do not pretend this is a complete data-backed prediction."
      : "";

    const analysisPrompt = `Based on all the data provided about Divyani, perform a comprehensive NEET rank prediction analysis. Include:

1. Estimated NEET score range (out of 720)
2. Predicted rank range
3. Subject-wise strength/weakness analysis
4. Comparison with AIIMS Delhi cutoff (~700+ score, rank ~50) and AIIMS Rishikesh (~660+, rank ~200-500)
5. Time remaining vs. preparation gap analysis  
6. Specific weekly action plan to close the gap
7. Bluff check: flag any inconsistencies between claimed progress and actual data

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
      ], 4096, 0.5, 90000);

      parsed = parseRankAnalysis(res.content);
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
