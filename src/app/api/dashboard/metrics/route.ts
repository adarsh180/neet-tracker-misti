import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPrismaConnectionError } from "@/lib/prisma-errors";

function getUniqueChapterStats(
  topics: Array<{ chapter: string | null; isCompleted: boolean }>
) {
  const chapterMap = new Map<string, boolean>();

  for (const topic of topics) {
    const chapterName = (topic.chapter || "General Topics").trim();
    const current = chapterMap.get(chapterName) ?? true;
    chapterMap.set(chapterName, current && topic.isCompleted);
  }

  const totalChapters = chapterMap.size;
  const completedChapters = [...chapterMap.values()].filter(Boolean).length;

  return { totalChapters, completedChapters };
}

function getUnavailableMetrics() {
  return {
    studentName: "Misti",
    subjects: [],
    totalTopics: 0,
    completedTopics: 0,
    totalChapters: 0,
    completedChapters: 0,
    overallPct: 0,
    totalStudyHours: 0,
    totalQuestions: 0,
    streak: 0,
    pulse: Array.from({ length: 14 }, () => 0),
    testCount: 0,
    avgTestScore: 0,
    activeDays14: 0,
    recentHours7: 0,
    recentQuestions7: 0,
    momentumScore: 0,
    dataHealth: {
      databaseAvailable: false,
      note: "The live tracker database is currently unreachable, so metrics are temporarily shown as safe defaults.",
    },
  };
}

export async function GET() {
  try {
    const subjects = await db.subject.findMany({
      include: {
        topics: {
          include: { revisions: { orderBy: { revisedAt: "desc" } } },
          orderBy: [{ classLevel: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });

    const now = new Date();
    const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dailyGoals = await db.dailyGoal.findMany({
      where: { date: { gte: thirtyAgo } },
      include: { subject: { select: { id: true } } },
      orderBy: { date: "desc" },
    });

    const testRecords = await db.testRecord.findMany({
      orderBy: { takenAt: "desc" },
      take: 20,
    });

    const subjectStats = subjects.map((sub) => {
      const totalTopics = sub.topics.length;
      const completedTopics = sub.topics.filter((t) => t.isCompleted).length;
      const completionPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
      const totalQuestions = sub.topics.reduce((s, t) => s + t.questionsSolved, 0);
      const { totalChapters, completedChapters } = getUniqueChapterStats(sub.topics);

      const pendingRevisions = sub.topics.filter(
        (t) =>
          t.isCompleted &&
          (t.revisions.length === 0 ||
            !t.revisions.some((r) => r.revisedAt >= sevenAgo))
      ).length;

      const subGoalsLast7 = dailyGoals.filter(
        (g) => g.subjectId === sub.id && new Date(g.date) >= sevenAgo
      );
      const last7DaysHours = subGoalsLast7.reduce((s, g) => s + g.hoursStudied, 0);

      return {
        id: sub.id,
        slug: sub.slug,
        name: sub.name,
        emoji: sub.emoji,
        color: sub.color,
        totalTopics,
        completedTopics,
        totalChapters,
        completedChapters,
        completionPct,
        totalQuestions,
        pendingRevisions,
        last7DaysHours,
      };
    });

    const allGoals = await db.dailyGoal.findMany({ orderBy: { date: "desc" } });
    const totalStudyHours = allGoals.reduce((s, g) => s + g.hoursStudied, 0);
    const totalQuestions = allGoals.reduce((s, g) => s + g.questionsSolved, 0);

    // Streak
    const allDates = [...new Set(allGoals.map((g) => g.date.toISOString().split("T")[0]))].sort().reverse();
    let streak = 0;
    for (let i = 0; i < allDates.length; i++) {
      const expected = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      if (allDates[i] === expected) streak++;
      else break;
    }

    // Pulse: Study hours per day for the last 14 days
    const pulse: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const hours = allGoals
        .filter((g) => g.date.toISOString().split("T")[0] === d)
        .reduce((sum, g) => sum + g.hoursStudied, 0);
      pulse.push(hours);
    }

    const totalTopicsAll = subjectStats.reduce((s, sub) => s + sub.totalTopics, 0);
    const completedTopicsAll = subjectStats.reduce((s, sub) => s + sub.completedTopics, 0);
    const totalChaptersAll = subjectStats.reduce((s, sub) => s + sub.totalChapters, 0);
    const completedChaptersAll = subjectStats.reduce((s, sub) => s + sub.completedChapters, 0);
    const overallPct = totalTopicsAll > 0 ? Math.round((completedTopicsAll / totalTopicsAll) * 100) : 0;
    const activeDays14 = new Set(
      allGoals
        .filter((goal) => goal.date >= sevenAgo)
        .map((goal) => goal.date.toISOString().split("T")[0])
    ).size;
    const recentHours7 = allGoals.filter((goal) => goal.date >= sevenAgo).reduce((sum, goal) => sum + goal.hoursStudied, 0);
    const recentQuestions7 = allGoals.filter((goal) => goal.date >= sevenAgo).reduce((sum, goal) => sum + goal.questionsSolved, 0);

    const avgTestScore =
      testRecords.length > 0
        ? testRecords.reduce((s, t) => s + t.percentage, 0) / testRecords.length
        : 0;
    const momentumScore = Math.round(
      Math.min(
        100,
        overallPct * 0.35 +
          Math.min(activeDays14 / 14, 1) * 25 +
          Math.min(recentHours7 / 42, 1) * 20 +
          Math.min(recentQuestions7 / 1400, 1) * 10 +
          Math.min(avgTestScore, 100) * 0.1
      )
    );

    return NextResponse.json({
      studentName: "Misti",
      subjects: subjectStats,
      totalTopics: totalTopicsAll,
      completedTopics: completedTopicsAll,
      totalChapters: totalChaptersAll,
      completedChapters: completedChaptersAll,
      overallPct,
      totalStudyHours,
      totalQuestions,
      streak,
      pulse,
      testCount: testRecords.length,
      avgTestScore,
      activeDays14,
      recentHours7,
      recentQuestions7,
      momentumScore,
    });
  } catch (err) {
    console.error("[dashboard/metrics]", err);
    if (isPrismaConnectionError(err)) return NextResponse.json(getUnavailableMetrics());
    return NextResponse.json({ error: "Failed to load metrics", details: err }, { status: 500 });
  }
}
