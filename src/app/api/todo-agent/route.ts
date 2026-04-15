import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { TaskPriority } from "@prisma/client";
import { db } from "@/lib/db";
import { chatWithAI } from "@/lib/openrouter";
import { startOfLocalDay } from "@/lib/tasks";
import { createTopicRecord } from "@/lib/topic-manager";
import { refreshTodoWorkspace } from "@/lib/todo-workspace";

type AgentAction =
  | {
      type: "create_topic";
      subjectSlug: string;
      chapter?: string | null;
      topicName: string;
      classLevel?: "11" | "12" | null;
    }
  | {
      type: "create_task";
      title: string;
      description: string;
      priority: TaskPriority;
      subjectSlug?: string | null;
      plannedMinutes?: number | null;
      dueDate?: string | null;
      scopeType?: "TOPIC" | "CHAPTER" | "SUBJECT";
      scopeLabel?: string | null;
    };

type AgentPayload = {
  summary: string;
  actions: AgentAction[];
};

function parseSubjectsFromInstruction(instruction: string, availableSlugs: string[]) {
  const lower = instruction.toLowerCase();
  return availableSlugs.filter((slug) => lower.includes(slug));
}

function buildTodoPlanningContext(
  instruction: string,
  context: {
    student: {
      targetExam: string;
      targetCollege: string;
      daysRemaining: number;
    };
    last7DaysSummary: {
      totalHours: number;
      totalQuestions: number;
      activeDays: number;
      avgHoursPerDay: number;
    };
    overallCompletion: number;
    consistencyStreak: number;
    performanceScore: number;
    strictnessLevel: "VERY_STRICT" | "STRICT" | "MODERATE" | "ENCOURAGING";
    moodSummary: {
      avgEnergy: number;
      avgFocus: number;
      avgStress: number;
      dominantMood: string;
      trend: "improving" | "declining" | "stable" | "unknown";
    };
    subjects: Array<{
      name: string;
      slug: string;
      totalTopics: number;
      completedTopics: number;
      totalQuestionsInTopics: number;
      pendingRevisions: number;
      chapters: Array<{
        name: string;
        completed: number;
        total: number;
        questionsSolved: number;
        revisions: number;
      }>;
    }>;
    recentDailyGoals: Array<{
      date: string;
      subjectName: string;
      hoursStudied: number;
      questionsSolved: number;
    }>;
    recentTests: Array<{
      testName: string;
      testType: string;
      subjectName: string | null;
      percentage: number;
      takenAt: string;
    }>;
    errorAnalysis: Array<{
      subject: string;
      type: string;
      frequency: number;
      notes: string | null;
    }>;
    srsTopicsDue: Array<{
      topic: string;
      subjectSlug: string | null;
    }>;
  },
  boardTasks: Array<{
    title: string;
    description: string | null;
    status: string;
    priority: string;
    plannedMinutes: number | null;
    subject: { slug: string; name: string } | null;
  }>
) {
  const requestedSubjects = parseSubjectsFromInstruction(
    instruction,
    context.subjects.map((subject) => subject.slug)
  );

  const focusedSubjects = (requestedSubjects.length
    ? context.subjects.filter((subject) => requestedSubjects.includes(subject.slug))
    : context.subjects
  ).map((subject) => ({
    name: subject.name,
    slug: subject.slug,
    completionPct:
      subject.totalTopics > 0
        ? Math.round((subject.completedTopics / subject.totalTopics) * 100)
        : 0,
    pendingRevisions: subject.pendingRevisions,
    totalQuestionsInTopics: subject.totalQuestionsInTopics,
    chaptersNeedingAttention: [...subject.chapters]
      .sort((a, b) => {
        const scoreA = (a.completed / Math.max(a.total, 1)) * 100 + a.revisions;
        const scoreB = (b.completed / Math.max(b.total, 1)) * 100 + b.revisions;
        return scoreA - scoreB;
      })
      .slice(0, 4),
  }));

  return {
    student: {
      targetExam: context.student.targetExam,
      targetCollege: context.student.targetCollege,
      daysRemaining: context.student.daysRemaining,
    },
    last7DaysSummary: context.last7DaysSummary,
    overallCompletion: context.overallCompletion,
    consistencyStreak: context.consistencyStreak,
    performanceScore: context.performanceScore,
    strictnessLevel: context.strictnessLevel,
    moodSummary: context.moodSummary,
    subjects: focusedSubjects,
    recentDailyGoals: context.recentDailyGoals.slice(0, 12),
    recentTests: context.recentTests.slice(0, 5),
    errorAnalysis: context.errorAnalysis?.slice(0, 6) ?? [],
    srsTopicsDue: context.srsTopicsDue?.slice(0, 8) ?? [],
    boardSample: boardTasks.slice(0, 16),
  };
}

function getISTDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function computeStrictnessLevel(
  overallPct: number,
  avgTestScore: number,
  streak: number,
  avgStress: number,
  avgEnergy: number,
  performanceScore: number,
  activeDaysLast7: number
) {
  const delhiReady = overallPct >= 95 && avgTestScore >= 98.6 && performanceScore >= 95;
  const rishikeshReady = overallPct >= 85 && avgTestScore >= 95.8 && performanceScore >= 85;

  if (delhiReady) return "MODERATE" as const;

  const isConsistent =
    streak >= 5 ||
    activeDaysLast7 >= 5 ||
    performanceScore >= 70;

  if (rishikeshReady && isConsistent) return "MODERATE" as const;
  if (rishikeshReady) return "STRICT" as const;
  if (isConsistent) return "STRICT" as const;
  if (avgStress >= 8 && avgEnergy <= 3) return "ENCOURAGING" as const;
  return "VERY_STRICT" as const;
}

async function buildTodoAgentContext() {
  const [subjects, allTopics, recentGoals, recentTests, recentMoodEntries, errorPatterns] = await Promise.all([
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.topic.findMany({
      include: {
        revisions: {
          select: { revisedAt: true },
        },
        subject: {
          select: { slug: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.dailyGoal.findMany({
      include: {
        subject: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      take: 30,
    }),
    db.testRecord.findMany({
      include: {
        subject: { select: { name: true } },
      },
      orderBy: { takenAt: "desc" },
      take: 6,
    }),
    db.moodEntry.findMany({
      orderBy: { date: "desc" },
      take: 10,
    }),
    db.errorPattern.findMany({
      include: {
        subject: { select: { name: true } },
      },
      orderBy: { frequency: "desc" },
      take: 8,
    }),
  ]);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7 = recentGoals.filter((goal) => new Date(goal.date) >= sevenDaysAgo);
  const totalAll = allTopics.length;
  const completedAll = allTopics.filter((topic) => topic.isCompleted).length;
  const overallCompletion = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;
  const avgTestScore = recentTests.length > 0
    ? recentTests.reduce((sum, test) => sum + test.percentage, 0) / recentTests.length
    : 0;

  const allDates = [...new Set(recentGoals.map((goal) => goal.date.toISOString().split("T")[0]))].sort().reverse();
  let streak = 0;
  for (let i = 0; i < allDates.length; i++) {
    const expected = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    if (allDates[i] === expected) streak++;
    else break;
  }

  const recentMoods = recentMoodEntries.map((entry) => ({
    date: getISTDateString(entry.date),
    mood: entry.mood,
    energy: entry.energy,
    focus: entry.focus,
    stress: entry.stress,
    note: entry.note,
  }));

  const avgEnergy = recentMoods.length ? Math.round(recentMoods.reduce((sum, mood) => sum + mood.energy, 0) / recentMoods.length) : 5;
  const avgFocus = recentMoods.length ? Math.round(recentMoods.reduce((sum, mood) => sum + mood.focus, 0) / recentMoods.length) : 5;
  const avgStress = recentMoods.length ? Math.round(recentMoods.reduce((sum, mood) => sum + mood.stress, 0) / recentMoods.length) : 5;
  const dominantMood =
    Object.entries(recentMoods.reduce<Record<string, number>>((acc, mood) => {
      acc[mood.mood] = (acc[mood.mood] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || "UNKNOWN";

  let trend: "improving" | "declining" | "stable" | "unknown" = "unknown";
  if (recentMoods.length >= 6) {
    const recent3Avg = recentMoods.slice(0, 3).reduce((sum, mood) => sum + mood.energy + mood.focus, 0) / 6;
    const prev3Avg = recentMoods.slice(3, 6).reduce((sum, mood) => sum + mood.energy + mood.focus, 0) / 6;
    if (recent3Avg > prev3Avg + 0.5) trend = "improving";
    else if (recent3Avg < prev3Avg - 0.5) trend = "declining";
    else trend = "stable";
  }

  const last7DaysSummary = {
    totalHours: last7.reduce((sum, goal) => sum + goal.hoursStudied, 0),
    totalQuestions: last7.reduce((sum, goal) => sum + goal.questionsSolved, 0),
    activeDays: new Set(last7.map((goal) => goal.date.toISOString().split("T")[0])).size,
    avgHoursPerDay: last7.length > 0
      ? parseFloat((last7.reduce((sum, goal) => sum + goal.hoursStudied, 0) / 7).toFixed(1))
      : 0,
  };

  const performanceScore = Math.round(
    (overallCompletion * 0.4) +
    (Math.min(avgTestScore, 100) * 0.35) +
    (Math.min(streak * 3, 15) * 0.1) +
    (Math.min(last7DaysSummary.avgHoursPerDay / 12 * 15, 15) * 0.15)
  );

  const subjectStats = subjects.map((subject) => {
    const subjectTopics = allTopics.filter((topic) => topic.subjectId === subject.id);
    const grouped = subjectTopics.reduce<Record<string, typeof subjectTopics>>((acc, topic) => {
      const chapter = topic.chapter || "General Topics";
      if (!acc[chapter]) acc[chapter] = [];
      acc[chapter].push(topic);
      return acc;
    }, {});

    return {
      name: subject.name,
      slug: subject.slug,
      totalTopics: subjectTopics.length,
      completedTopics: subjectTopics.filter((topic) => topic.isCompleted).length,
      totalQuestionsInTopics: subjectTopics.reduce((sum, topic) => sum + topic.questionsSolved, 0),
      pendingRevisions: subjectTopics.filter(
        (topic) =>
          topic.isCompleted &&
          (topic.revisions.length === 0 ||
            !topic.revisions.some((revision) => new Date(revision.revisedAt) > sevenDaysAgo))
      ).length,
      chapters: Object.entries(grouped).map(([name, topics]) => ({
        name,
        total: topics.length,
        completed: topics.filter((topic) => topic.isCompleted).length,
        questionsSolved: topics.reduce((sum, topic) => sum + topic.questionsSolved, 0),
        revisions: topics.reduce((sum, topic) => sum + topic.revisions.length, 0),
      })),
    };
  });

  return {
    student: {
      targetExam: "NEET UG 2027",
      targetCollege: "AIIMS Delhi (MBBS)",
      daysRemaining: Math.max(0, Math.ceil((new Date("2027-05-02T09:00:00+05:30").getTime() - Date.now()) / 86400000)),
    },
    last7DaysSummary,
    overallCompletion,
    consistencyStreak: streak,
    performanceScore,
    strictnessLevel: computeStrictnessLevel(
      overallCompletion,
      avgTestScore,
      streak,
      avgStress,
      avgEnergy,
      performanceScore,
      last7DaysSummary.activeDays
    ),
    moodSummary: {
      avgEnergy,
      avgFocus,
      avgStress,
      dominantMood,
      trend,
    },
    subjects: subjectStats,
    recentDailyGoals: recentGoals.slice(0, 12).map((goal) => ({
      date: getISTDateString(goal.date),
      subjectName: goal.subject.name,
      hoursStudied: goal.hoursStudied,
      questionsSolved: goal.questionsSolved,
    })),
    recentTests: recentTests.map((test) => ({
      testName: test.testName,
      testType: test.testType,
      subjectName: test.subject?.name ?? null,
      percentage: test.percentage,
      takenAt: getISTDateString(test.takenAt),
    })),
    errorAnalysis: errorPatterns.map((pattern) => ({
      subject: pattern.subject.name,
      type: pattern.errorType,
      frequency: pattern.frequency,
      notes: pattern.notes,
    })),
    srsTopicsDue: allTopics
      .filter((topic) => topic.nextReviewDate && new Date(topic.nextReviewDate) <= new Date())
      .slice(0, 8)
      .map((topic) => ({
        topic: topic.name,
        subjectSlug: topic.subject?.slug ?? null,
      })),
  };
}

function safeJsonParse<T>(input: string) {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function parsePayload(input: string) {
  const direct = safeJsonParse<AgentPayload>(input);
  if (direct) return direct;

  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    return safeJsonParse<AgentPayload>(fenced.trim());
  }

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return safeJsonParse<AgentPayload>(input.slice(start, end + 1));
  }

  return null;
}

async function generateAgentPayload(prompt: string) {
  const result = await chatWithAI(
    [
      {
        role: "system",
        content: "Return valid JSON only. No markdown fences. No prose outside the JSON object.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    1600,
    0.2,
    20000
  );

  const payload = parsePayload(result.content);
  if (payload) {
    return { payload, model: result.model };
  }

  const repair = await chatWithAI(
    [
      {
        role: "user",
        content: `Convert this into valid JSON only using the required shape.\n\nRequired shape:\n{"summary":"short summary","actions":[{"type":"create_topic","subjectSlug":"physics|chemistry|botany|zoology","chapter":"string or null","topicName":"string","classLevel":"11|12|null"},{"type":"create_task","title":"string","description":"string","priority":"LOW|MEDIUM|HIGH|CRITICAL","subjectSlug":"physics|chemistry|botany|zoology|null","plannedMinutes":60,"dueDate":"YYYY-MM-DD or null","scopeType":"TOPIC|CHAPTER|SUBJECT","scopeLabel":"string or null"}]}\n\nInput:\n${result.content}`,
      },
    ],
    1600,
    0.1,
    16000
  );

  const repairedPayload = parsePayload(repair.content);
  if (!repairedPayload) {
    throw new Error("AI response could not be converted into valid todo actions.");
  }

  return { payload: repairedPayload, model: repair.model };
}

export async function POST(req: NextRequest) {
  try {
    await refreshTodoWorkspace();
    const body = await req.json();
    const instruction = String(body?.instruction || "").trim();

    if (!instruction) {
      return NextResponse.json({ error: "Instruction is required." }, { status: 400 });
    }

    const [subjects, topics, boardTasks] = await Promise.all([
      db.subject.findMany({
        select: { id: true, slug: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
      db.topic.findMany({
        select: {
          name: true,
          chapter: true,
          classLevel: true,
          subject: { select: { slug: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 120,
      }),
      db.task.findMany({
        select: {
          title: true,
          description: true,
          status: true,
          priority: true,
          plannedMinutes: true,
          subject: { select: { slug: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);

    const context = await buildTodoAgentContext();

    const planningContext = buildTodoPlanningContext(instruction, context, boardTasks);

    const prompt = [
      "You are the AI todo planner for a NEET workspace.",
      "Use the planning context, recent tasks, subject progress, pending chapters, tests, revision backlog, mood, and performance signals before deciding anything.",
      "Interpret the user instruction and return todo actions as valid JSON only.",
      "Use create_topic when the user wants to add a topic or chapter to a subject.",
      "Use create_task when the user wants a todo list or study plan.",
      "When the user asks to add a chapter but does not provide a specific topic, create a seed topic using the chapter name as topicName so it appears in the existing chapter-based UI.",
      "When creating tasks, prefer topic-wise or chapter-wise tasks over generic subject-only tasks.",
      "If the user gives total hours or total question targets, distribute them intelligently across the requested subjects using the evidence in the tracker context.",
      "Do not create duplicate tasks that already exist in the current board unless the user clearly asks to replace or regenerate them.",
      "Never invent subjects outside the available subject slugs.",
      "Keep the plan sharp and practical. Usually create 4 to 8 tasks unless the user clearly asks for a different scope.",
      "For study-plan requests, make the task descriptions mention exactly what to do in that block, not generic motivation.",
      'JSON shape: {"summary":"short summary","actions":[{"type":"create_topic","subjectSlug":"physics|chemistry|botany|zoology","chapter":"string or null","topicName":"string","classLevel":"11|12|null"},{"type":"create_task","title":"string","description":"string","priority":"LOW|MEDIUM|HIGH|CRITICAL","subjectSlug":"physics|chemistry|botany|zoology|null","plannedMinutes":60,"dueDate":"YYYY-MM-DD or null","scopeType":"TOPIC|CHAPTER|SUBJECT","scopeLabel":"string or null"}]}',
      `Available subjects: ${JSON.stringify(subjects, null, 2)}`,
      `Recent topics: ${JSON.stringify(topics.slice(0, 48), null, 2)}`,
      `Planning context: ${JSON.stringify(planningContext, null, 2)}`,
      `User instruction: ${instruction}`,
    ].join("\n\n");
    const { payload, model } = await generateAgentPayload(prompt);

    const subjectMap = new Map(subjects.map((subject) => [subject.slug, subject]));
    const lastTask = await db.task.findFirst({
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    let orderIndex = (lastTask?.orderIndex ?? -1) + 1;

    const createdTopics = [];
    const createdTasks = [];

    for (const action of payload.actions) {
      if (action.type === "create_topic") {
        const subject = subjectMap.get(action.subjectSlug);
        if (!subject) continue;

        const topic = await createTopicRecord({
          subjectId: subject.id,
          name: action.topicName,
          chapter: action.chapter ?? action.topicName,
          classLevel: action.classLevel ?? null,
        });
        createdTopics.push(topic);
        continue;
      }

      if (action.type === "create_task") {
        const subject = action.subjectSlug ? subjectMap.get(action.subjectSlug) ?? null : null;
        const task = await db.task.create({
          data: {
            source: "AI",
            title: action.title.trim(),
            description: action.description.trim(),
            priority: action.priority,
            subjectId: subject?.id ?? null,
            dueDate: action.dueDate ? startOfLocalDay(action.dueDate) : null,
            plannedMinutes: action.plannedMinutes ?? null,
            aiAssistEnabled: true,
            orderIndex: orderIndex++,
            timelineEvents: {
              create: {
                type: "CREATED",
                label: "Agent-planned task created",
                detail: action.scopeLabel
                  ? `${action.scopeType || "TASK"}: ${action.scopeLabel}`
                  : "Todo Agent",
              },
            },
          },
          include: {
            subject: { select: { id: true, name: true, slug: true, color: true } },
            agentRuns: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            timelineEvents: {
              orderBy: { createdAt: "desc" },
              take: 6,
            },
          },
        });
        createdTasks.push(task);
      }
    }

    return NextResponse.json({
      summary: payload.summary,
      model,
      createdTopics,
      createdTasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientKnownRequestError ||
      message.includes("Can't reach database server")
    ) {
      return NextResponse.json(
        { error: "Todo planner could not reach the database right now. Please retry in a moment." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await db.$transaction([
      db.taskAgentRun.deleteMany(),
      db.taskTimelineEvent.deleteMany({
        where: { type: "AI_TRIGGERED" },
      }),
      db.task.updateMany({
        data: { lastAgentSummary: null },
      }),
      db.missionSession.deleteMany(),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
