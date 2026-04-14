import type { Task, TaskAgentTrigger } from "@prisma/client";
import { db } from "@/lib/db";
import { buildAIContext } from "@/lib/ai-context-builder";
import { chatWithAI } from "@/lib/openrouter";

type TaskWithSubject = Task & {
  subject: { id: string; name: string; slug: string; color: string } | null;
};

type SubjectDiagnostic = {
  subjectId: string;
  subjectName: string;
  completionPct: number;
  last30Hours: number;
  last30Questions: number;
  avgQuestionsPerActiveDay: number;
  avgTestPercentage: number | null;
  pendingRevisions: number;
  overdueReviews: number;
  topErrorTypes: string[];
  lastStudyDate: string | null;
  daysSinceStudy: number | null;
  isUntouchedForLong: boolean;
};

type TaskAnalytics = {
  today: string;
  strongestSubject: SubjectDiagnostic | null;
  weakestSubject: SubjectDiagnostic | null;
  neglectedSubjects: SubjectDiagnostic[];
  dueRevisionSubjects: SubjectDiagnostic[];
  relevantSubject: SubjectDiagnostic | null;
  recommendedQuestions: number | null;
  recommendedMinutes: number | null;
  workloadReason: string[];
};

function daysBetween(date: Date, today = new Date()) {
  return Math.floor((today.getTime() - date.getTime()) / 86400000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTriggerInstruction(trigger: TaskAgentTrigger) {
  switch (trigger) {
    case "START":
      return "The user is starting this task now. Give a fast launch brief, first checkpoint, and precise workload target only if supported by the data provided.";
    case "FINISH":
      return "The user just finished this task. Evaluate what that completion likely fixes, what still remains weak, and the smartest next step.";
    case "SKIP":
      return "The user skipped this task. Explain the cost using the evidence provided, then propose the best recovery move with zero guilt and zero fluff.";
    case "MANUAL":
    default:
      return "The user explicitly opened the task copilot. Give practical, concrete, evidence-backed guidance for this task right now.";
  }
}

async function buildTaskAnalytics(task: TaskWithSubject): Promise<TaskAnalytics> {
  const today = new Date();
  const last30Days = new Date(today.getTime() - 30 * 86400000);

  const [subjects, topics, dailyGoals, testRecords, errorPatterns] = await Promise.all([
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.topic.findMany({
      select: {
        id: true,
        subjectId: true,
        isCompleted: true,
        nextReviewDate: true,
        revisions: { select: { id: true } },
      },
    }),
    db.dailyGoal.findMany({
      where: { date: { gte: last30Days } },
      select: {
        subjectId: true,
        date: true,
        hoursStudied: true,
        questionsSolved: true,
      },
    }),
    db.testRecord.findMany({
      where: { subjectId: { not: null } },
      select: {
        subjectId: true,
        percentage: true,
        takenAt: true,
      },
      orderBy: { takenAt: "desc" },
      take: 40,
    }),
    db.errorPattern.findMany({
      select: {
        subjectId: true,
        errorType: true,
        frequency: true,
      },
      orderBy: { frequency: "desc" },
      take: 20,
    }),
  ]);

  const diagnostics: SubjectDiagnostic[] = subjects.map((subject) => {
    const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
    const subjectGoals = dailyGoals.filter((goal) => goal.subjectId === subject.id);
    const subjectTests = testRecords.filter((test) => test.subjectId === subject.id);
    const subjectErrors = errorPatterns
      .filter((pattern) => pattern.subjectId === subject.id)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);

    const totalTopics = subjectTopics.length;
    const completedTopics = subjectTopics.filter((topic) => topic.isCompleted).length;
    const activeDays = new Set(subjectGoals.map((goal) => goal.date.toISOString().slice(0, 10))).size;
    const lastStudy = subjectGoals.sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.date ?? null;
    const pendingRevisions = subjectTopics.filter(
      (topic) => topic.isCompleted && topic.revisions.length === 0
    ).length;
    const overdueReviews = subjectTopics.filter(
      (topic) => topic.nextReviewDate && topic.nextReviewDate <= today
    ).length;
    const avgTestPercentage = subjectTests.length
      ? Number((subjectTests.reduce((sum, test) => sum + test.percentage, 0) / subjectTests.length).toFixed(1))
      : null;

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      completionPct: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0,
      last30Hours: Number(subjectGoals.reduce((sum, goal) => sum + goal.hoursStudied, 0).toFixed(1)),
      last30Questions: subjectGoals.reduce((sum, goal) => sum + goal.questionsSolved, 0),
      avgQuestionsPerActiveDay:
        activeDays > 0
          ? Math.round(subjectGoals.reduce((sum, goal) => sum + goal.questionsSolved, 0) / activeDays)
          : 0,
      avgTestPercentage,
      pendingRevisions,
      overdueReviews,
      topErrorTypes: subjectErrors.map((pattern) => `${pattern.errorType} (${pattern.frequency})`),
      lastStudyDate: lastStudy?.toISOString() ?? null,
      daysSinceStudy: lastStudy ? daysBetween(lastStudy, today) : null,
      isUntouchedForLong: !lastStudy || daysBetween(lastStudy, today) >= 8,
    };
  });

  const strongestSubject = [...diagnostics].sort(
    (a, b) =>
      (b.avgTestPercentage ?? b.completionPct) - (a.avgTestPercentage ?? a.completionPct)
  )[0] ?? null;

  const weakestSubject = [...diagnostics].sort((a, b) => {
    const scoreA = (a.avgTestPercentage ?? a.completionPct) - a.pendingRevisions - a.overdueReviews;
    const scoreB = (b.avgTestPercentage ?? b.completionPct) - b.pendingRevisions - b.overdueReviews;
    return scoreA - scoreB;
  })[0] ?? null;

  const neglectedSubjects = diagnostics
    .filter((subject) => subject.isUntouchedForLong)
    .sort((a, b) => (b.daysSinceStudy ?? 999) - (a.daysSinceStudy ?? 999));

  const dueRevisionSubjects = diagnostics
    .filter((subject) => subject.pendingRevisions > 0 || subject.overdueReviews > 0)
    .sort((a, b) => (b.pendingRevisions + b.overdueReviews) - (a.pendingRevisions + a.overdueReviews));

  const relevantSubject =
    (task.subjectId ? diagnostics.find((subject) => subject.subjectId === task.subjectId) : null) ??
    weakestSubject;

  let recommendedQuestions: number | null = null;
  let recommendedMinutes: number | null = task.plannedMinutes ?? null;
  const workloadReason: string[] = [];

  if (relevantSubject) {
    const baseQuestions = clamp(relevantSubject.avgQuestionsPerActiveDay || 45, 30, 140);
    let adjustedQuestions = baseQuestions;

    if ((relevantSubject.avgTestPercentage ?? 100) < 75) {
      adjustedQuestions += 20;
      workloadReason.push(`avg test score in ${relevantSubject.subjectName} is below 75%`);
    }
    if ((relevantSubject.daysSinceStudy ?? 0) >= 8) {
      adjustedQuestions += 15;
      workloadReason.push(`${relevantSubject.subjectName} has been untouched for ${relevantSubject.daysSinceStudy} days`);
    }
    if (relevantSubject.pendingRevisions + relevantSubject.overdueReviews >= 4) {
      adjustedQuestions += 10;
      workloadReason.push(`${relevantSubject.subjectName} has revision backlog and due reviews`);
    }
    if (relevantSubject.topErrorTypes.length > 0) {
      workloadReason.push(`top errors are ${relevantSubject.topErrorTypes.join(", ")}`);
    }

    recommendedQuestions = clamp(Math.round(adjustedQuestions / 5) * 5, 30, 220);

    if (!recommendedMinutes) {
      const baseMinutes = relevantSubject.last30Hours > 0
        ? Math.round((relevantSubject.last30Hours / 30) * 60)
        : 75;
      recommendedMinutes = clamp(baseMinutes + (recommendedQuestions >= 100 ? 20 : 0), 45, 180);
    }
  }

  return {
    today: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today),
    strongestSubject,
    weakestSubject,
    neglectedSubjects,
    dueRevisionSubjects,
    relevantSubject,
    recommendedQuestions,
    recommendedMinutes,
    workloadReason,
  };
}

function buildTaskPrompt(
  task: TaskWithSubject,
  trigger: TaskAgentTrigger,
  analytics: TaskAnalytics,
  userNote?: string
) {
  const taskPayload = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    plannedMinutes: task.plannedMinutes,
    actualMinutes: task.actualMinutes,
    dueDate: task.dueDate,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    skippedAt: task.skippedAt,
    subject: task.subject,
  };

  return [
    "You are Task Copilot inside a premium NEET-UG preparation workspace.",
    "This guidance must be strictly data-backed. Do not hallucinate. Do not invent subject weaknesses, progress, or targets.",
    "If the provided evidence is insufficient for a numeric target, explicitly say the data is insufficient instead of guessing.",
    "Any recommended question count or study duration must be justified using the analytics provided below.",
    buildTriggerInstruction(trigger),
    "Return Markdown with exactly these sections:",
    "## Snapshot",
    "## Data basis",
    "## Recommended workload",
    "## Action",
    "## Why this matters",
    "## Suggested next moves",
    "In 'Suggested next moves', provide exactly 3 short bullet points.",
    userNote ? `User note: ${userNote}` : "User note: none provided.",
    `Task JSON:\n${JSON.stringify(taskPayload, null, 2)}`,
    `Task analytics JSON:\n${JSON.stringify(analytics, null, 2)}`,
  ].join("\n\n");
}

export async function generateTaskAgentResponse(
  task: TaskWithSubject,
  trigger: TaskAgentTrigger,
  userNote?: string
) {
  const [context, analytics] = await Promise.all([buildAIContext(), buildTaskAnalytics(task)]);

  const systemPrompt = [
    "You are an elite NEET-UG task execution copilot for a single student targeting AIIMS Delhi or AIIMS Rishikesh MBBS.",
    "You must behave like a highly constrained personal coach, not a generic chatbot.",
    "Never claim you know something unless it appears in the provided context or analytics.",
    "When recommending workload, explicitly anchor it to the evidence: neglected subjects, revision backlog, due SRS reviews, error patterns, test weakness, recent study history, and exam target.",
    "Stay concise, but show the reasoning behind every recommendation.",
    `Student context:\n${JSON.stringify({
      student: context.student,
      subjects: context.subjects.map((subject) => ({
        name: subject.name,
        completion: subject.totalTopics > 0 ? Math.round((subject.completedTopics / subject.totalTopics) * 100) : 0,
        pendingRevisions: subject.pendingRevisions,
        totalQuestionsInTopics: subject.totalQuestionsInTopics,
      })),
      last7DaysSummary: context.last7DaysSummary,
      recentTests: context.recentTests,
      errorAnalysis: context.errorAnalysis,
      srsTopicsDue: context.srsTopicsDue,
      overallCompletion: context.overallCompletion,
      consistencyStreak: context.consistencyStreak,
      performanceScore: context.performanceScore,
      moodSummary: context.moodSummary,
    }, null, 2)}`,
  ].join("\n\n");

  const prompt = buildTaskPrompt(task, trigger, analytics, userNote);

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    1500,
    0.25
  );

  return {
    prompt,
    response: result.content,
    model: result.model,
  };
}
