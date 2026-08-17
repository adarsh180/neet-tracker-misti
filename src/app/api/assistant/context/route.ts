import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [subjects, tasks, tests, actions, goalDates, testStats] = await Promise.all([
    db.subject.findMany({
      select: {
        name: true,
        slug: true,
        color: true,
        topics: { select: { isCompleted: true, questionsSolved: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.task.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        plannedMinutes: true,
        subject: { select: { name: true, color: true } },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    db.testRecord.findMany({
      select: { id: true, testName: true, percentage: true, takenAt: true, testType: true },
      orderBy: { takenAt: "desc" },
      take: 4,
    }),
    db.assistantAction.findMany({
      where: { userId: session.userId },
      select: { id: true, kind: true, utterance: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    db.dailyGoal.findMany({ select: { date: true }, orderBy: { date: "desc" } }),
    db.testRecord.aggregate({ _count: { _all: true }, _avg: { percentage: true } }),
  ]);

  const activeDays = [...new Set(goalDates.map((goal) => goal.date.toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  for (let index = 0; index < activeDays.length; index += 1) {
    const expected = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
    if (activeDays[index] !== expected) break;
    streak += 1;
  }

  const subjectProgress = subjects.map((subject) => {
    const total = subject.topics.length;
    const completed = subject.topics.filter((topic) => topic.isCompleted).length;
    return {
      name: subject.name,
      slug: subject.slug,
      color: subject.color,
      completed,
      total,
      percentage: total ? Math.round((completed / total) * 100) : 0,
      questions: subject.topics.reduce((sum, topic) => sum + topic.questionsSolved, 0),
    };
  });
  const totalTopics = subjectProgress.reduce((sum, subject) => sum + subject.total, 0);
  const completedTopics = subjectProgress.reduce((sum, subject) => sum + subject.completed, 0);
  const pending = tasks.filter((task) => task.status !== "DONE" && task.status !== "SKIPPED");
  const plannedTests = pending.filter((task) => /test|mock|pyq|sectional/i.test(task.title));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    todayPlan: pending.slice(0, 4),
    completedTaskCount: tasks.filter((task) => task.status === "DONE").length,
    visibleTaskCount: tasks.length,
    progress: {
      completedTopics,
      totalTopics,
      percentage: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0,
      subjects: subjectProgress,
    },
    weakSubjects: [...subjectProgress].sort((a, b) => a.percentage - b.percentage).slice(0, 3),
    upcomingTests: plannedTests.slice(0, 3),
    recentTests: tests,
    recentActions: actions,
    stats: {
      streak,
      testCount: testStats._count._all,
      avgPercentage: testStats._avg.percentage ? Math.round(testStats._avg.percentage) : 0,
      avgScore: testStats._avg.percentage ? Math.round((testStats._avg.percentage / 100) * 720) : 0,
    },
  });
}
