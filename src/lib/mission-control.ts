import type { MissionKind, MissionSession, TaskPriority } from "@prisma/client";
import { db } from "@/lib/db";
import { buildAIContext } from "@/lib/ai-context-builder";
import { chatWithAI } from "@/lib/openrouter";
import { startOfLocalDay } from "@/lib/tasks";
import { buildTaskDescriptionWithReason, clearMissionReasonsNow, getVisibleBoardTasks, refreshTodoWorkspace } from "@/lib/todo-workspace";

type SuggestedTask = {
  title: string;
  description: string;
  priority: TaskPriority;
  subjectSlug?: string | null;
  plannedMinutes?: number | null;
  dueDate?: string | null;
  rationale: string;
  scopeType?: "TOPIC" | "CHAPTER" | "SUBJECT";
  scopeLabel?: string | null;
};

type MissionPayload = {
  title: string;
  summary: string;
  insights: string[];
  dailyCommand?: {
    primaryOutcome: string;
    questionTarget?: number | null;
    revisionTarget?: string | null;
    studyMinutes?: number | null;
    shutdownRule: string;
  };
  taskSuggestions: SuggestedTask[];
};

const KIND_COPY: Record<MissionKind, { title: string; description: string; taskMin: number; taskMax: number }> = {
  MISSION_PLANNER: {
    title: "Mission Planner",
    description: "Create a short-term NEET execution mission using live tracker data.",
    taskMin: 4,
    taskMax: 7,
  },
  AUTO_TODO: {
    title: "Auto Todo Suggestion Engine",
    description: "Create sharp suggested tasks from neglected areas, weak tests, revisions, and backlog.",
    taskMin: 4,
    taskMax: 8,
  },
  TEST_RECOVERY: {
    title: "Post-Test Recovery",
    description: "Turn recent test weakness into focused corrective tasks.",
    taskMin: 3,
    taskMax: 6,
  },
  REVISION_PULSE: {
    title: "Revision Pulse",
    description: "Surface what is due, decaying, or forgotten and generate revision work.",
    taskMin: 3,
    taskMax: 6,
  },
  DAILY_COMMAND: {
    title: "Daily Command",
    description: "Generate a tightly scoped daily NEET command using current study state.",
    taskMin: 2,
    taskMax: 5,
  },
  PATTERN_DETECTOR: {
    title: "Pattern Detector",
    description: "Read preparation behavior and generate intervention tasks for recurring weak patterns.",
    taskMin: 3,
    taskMax: 6,
  },
};

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function parseMissionPayload(input: string) {
  const direct = safeJsonParse<MissionPayload>(input);
  if (direct) return direct;

  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = safeJsonParse<MissionPayload>(fenced.trim());
    if (parsed) return parsed;
  }

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return safeJsonParse<MissionPayload>(input.slice(start, end + 1));
  }

  return null;
}

function isoDayFromNow(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function pickWeakSubjects(analytics: Awaited<ReturnType<typeof buildMissionAnalytics>>) {
  return [...analytics.subjectStats]
    .sort((a, b) => {
      const scoreA = (a.avgTestPercentage ?? 0) + a.completionPct - (a.overdueReviews * 2) - (a.daysSinceStudy ?? 0);
      const scoreB = (b.avgTestPercentage ?? 0) + b.completionPct - (b.overdueReviews * 2) - (b.daysSinceStudy ?? 0);
      return scoreA - scoreB;
    })
    .slice(0, 2);
}

function pickNeglectedSubjects(analytics: Awaited<ReturnType<typeof buildMissionAnalytics>>) {
  return [...analytics.subjectStats]
    .sort((a, b) => (b.daysSinceStudy ?? -1) - (a.daysSinceStudy ?? -1))
    .slice(0, 2);
}

function buildFallbackMissionPayload(kind: MissionKind, goal: string | undefined, analytics: Awaited<ReturnType<typeof buildMissionAnalytics>>): MissionPayload {
  const weak = pickWeakSubjects(analytics);
  const neglected = pickNeglectedSubjects(analytics);
  const recentTest = analytics.recentTests[0];
  const overdue = analytics.overdueRevisionTopics.slice(0, 3);
  const untouched = analytics.untouchedTopics.slice(0, 3);

  const baseInsights = [
    weak[0] ? `${weak[0].name} is currently one of the weakest live signals based on completion, tests, and revision pressure.` : "Weak-subject signal is limited because there is not enough subject data yet.",
    neglected[0]?.daysSinceStudy != null ? `${neglected[0].name} has been untouched for ${neglected[0].daysSinceStudy} days.` : "Recent study coverage looks uneven, but date evidence is limited.",
    `Execution board shows ${analytics.executionStats.done} completed tasks, ${analytics.executionStats.inProgress} in progress, and ${analytics.executionStats.skipped} skipped tasks in the current sample.`,
  ];

  const payloadByKind: Record<MissionKind, MissionPayload> = {
    MISSION_PLANNER: {
      title: "3-Step NEET Mission",
      summary: `This mission converts the latest tracker data into an opt-in execution lane. It prioritizes weak and neglected subjects first, then closes revision debt so momentum improves without random task churn.`,
      insights: baseInsights,
      dailyCommand: {
        primaryOutcome: `Stabilize ${weak[0]?.name ?? "the weakest subject"} while touching one neglected area and one revision lane.`,
        questionTarget: Math.max(40, (weak[0]?.questionsLast30 ?? 20) < 60 ? 60 : 45),
        revisionTarget: overdue[0] ? `${overdue[0].subject}: ${overdue[0].topic}` : "Revise one overdue topic before new study.",
        studyMinutes: 240,
        shutdownRule: "Stop only after the weak-subject questions, one revision block, and one recovery review are logged.",
      },
      taskSuggestions: [
        {
          title: `Question drill: ${overdue[0]?.topic ?? weak[0]?.name ?? "weak subject"}`,
          description: overdue[0]
            ? `Revise and drill ${overdue[0].topic} from ${overdue[0].subject} with mistake logging.`
            : `Run a targeted question block on the weakest subject and log the actual mistakes, not just the score.`,
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 90,
          dueDate: isoDayFromNow(0),
          rationale: "Weak-subject pressure should be addressed before adding more broad study load.",
          scopeType: overdue[0] ? "TOPIC" : "SUBJECT",
          scopeLabel: overdue[0]?.topic ?? weak[0]?.name ?? null,
        },
        {
          title: `Revision rescue for ${overdue[0]?.topic ?? "overdue topic"}`,
          description: overdue[0] ? `Revise ${overdue[0].topic} from ${overdue[0].subject} because it is already due and at risk of decay.` : "Revise one overdue topic that has already crossed its review date.",
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 45,
          dueDate: isoDayFromNow(0),
          rationale: "Overdue revisions usually create false confidence and repeated error loops.",
          scopeType: overdue[0]?.chapter ? "CHAPTER" : "TOPIC",
          scopeLabel: overdue[0]?.chapter ?? overdue[0]?.topic ?? null,
        },
        {
          title: `Neglect breaker: ${untouched[0]?.chapter ?? neglected[0]?.name ?? "neglected subject"}`,
          description: untouched[0]
            ? `Touch ${untouched[0].topic} from ${untouched[0].subject} to break avoidance in ${untouched[0].chapter ?? "that chapter"}.`
            : `Touch the subject that has been left alone the longest with a short but real session.`,
          priority: "MEDIUM",
          subjectSlug: neglected[0]?.slug ?? null,
          plannedMinutes: 50,
          dueDate: isoDayFromNow(1),
          rationale: "Long untouched gaps make syllabus balance worse and increase avoidance.",
          scopeType: untouched[0]?.chapter ? "CHAPTER" : "SUBJECT",
          scopeLabel: untouched[0]?.chapter ?? neglected[0]?.name ?? null,
        },
        {
          title: "Mistake log cleanup",
          description: "Summarize the top mistakes from today’s questions and convert them into concrete next actions.",
          priority: "MEDIUM",
          subjectSlug: null,
          plannedMinutes: 25,
          dueDate: isoDayFromNow(0),
          rationale: "Without a mistake review, question practice turns into raw volume instead of progress.",
        },
      ],
    },
    AUTO_TODO: {
      title: "Auto Todo Suggestions",
      summary: "These suggested tasks are generated directly from weak coverage, neglected subjects, revision pressure, and recent execution drift in the tracker.",
      insights: baseInsights,
      dailyCommand: {
        primaryOutcome: "Accept only the tasks that directly attack weakness, neglect, or revision debt.",
        questionTarget: 50,
        revisionTarget: overdue[0] ? `${overdue[0].topic}` : "One overdue revision topic",
        studyMinutes: 210,
        shutdownRule: "Do not add extra tasks until the accepted suggestions are either finished or consciously skipped.",
      },
      taskSuggestions: [
        {
          title: `Untouched chapter start: ${untouched[0]?.chapter ?? untouched[0]?.topic ?? "Pending topic"}`,
          description: untouched[0] ? `Start ${untouched[0].topic} from ${untouched[0].subject} because it is still untouched in the tracker.` : "Start one untouched topic instead of recycling only familiar chapters.",
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 75,
          dueDate: isoDayFromNow(1),
          rationale: "Untouched areas quietly become high-risk backlog near exams.",
          scopeType: untouched[0]?.chapter ? "CHAPTER" : "TOPIC",
          scopeLabel: untouched[0]?.chapter ?? untouched[0]?.topic ?? null,
        },
        {
          title: `Weak set: ${overdue[0]?.topic ?? weak[0]?.name ?? "weak subject"}`,
          description: overdue[0]
            ? `Solve a compact problem set on ${overdue[0].topic} and record the misses in detail.`
            : "Solve a compact, high-yield problem set and record the misses in detail.",
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 80,
          dueDate: isoDayFromNow(0),
          rationale: "Weak areas need active correction, not passive reading.",
          scopeType: overdue[0] ? "TOPIC" : "SUBJECT",
          scopeLabel: overdue[0]?.topic ?? weak[0]?.name ?? null,
        },
        {
          title: `Return to ${untouched[1]?.chapter ?? neglected[0]?.name ?? "neglected subject"}`,
          description: untouched[1]
            ? `Do one deliberate restart block on ${untouched[1].topic} from ${untouched[1].chapter ?? untouched[1].subject}.`
            : "Do one deliberate restart block on the most neglected subject.",
          priority: "MEDIUM",
          subjectSlug: neglected[0]?.slug ?? null,
          plannedMinutes: 45,
          dueDate: isoDayFromNow(1),
          rationale: "Neglect usually grows when a subject feels harder than the others.",
          scopeType: untouched[1]?.chapter ? "CHAPTER" : "SUBJECT",
          scopeLabel: untouched[1]?.chapter ?? neglected[0]?.name ?? null,
        },
        {
          title: "Revision debt sweep",
          description: "Close the oldest overdue revision items before adding new theory load.",
          priority: "HIGH",
          subjectSlug: null,
          plannedMinutes: 40,
          dueDate: isoDayFromNow(0),
          rationale: "Revision debt compounds quickly and destabilizes retention.",
        },
      ],
    },
    TEST_RECOVERY: {
      title: "Post-Test Recovery Lane",
      summary: "This recovery run uses the latest test evidence first, then turns the weakest test signals into corrective work instead of vague motivation.",
      insights: [
        recentTest ? `Latest visible test is ${recentTest.testName} at ${recentTest.percentage}%.` : "No recent test was found, so recovery has to use subject and revision signals instead.",
        ...baseInsights.slice(0, 2),
      ],
      dailyCommand: {
        primaryOutcome: `Recover from the latest weak test signal by correcting content errors and converting them into a follow-up drill.`,
        questionTarget: 40,
        revisionTarget: weak[0]?.name ?? "weak subject",
        studyMinutes: 180,
        shutdownRule: "Do not count recovery complete until the test errors have been analyzed and retried once.",
      },
      taskSuggestions: [
        {
          title: `Analyze ${recentTest?.testName ?? "recent test"} mistakes`,
          description: "Split mistakes into concept, recall, calculation, and rush errors, then write one corrective line for each cluster.",
          priority: "CRITICAL",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 35,
          dueDate: isoDayFromNow(0),
          rationale: "Test recovery starts with error typing, not random extra questions.",
        },
        {
          title: `Recovery drill: ${overdue[0]?.topic ?? weak[0]?.name ?? "weak subject"}`,
          description: overdue[0]
            ? `Retry a focused block on ${overdue[0].topic} from ${overdue[0].subject}.`
            : "Retry a focused block in the subject with the worst live signal.",
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 75,
          dueDate: isoDayFromNow(0),
          rationale: "The weakest test area needs a same-day corrective repetition.",
          scopeType: overdue[0] ? "TOPIC" : "SUBJECT",
          scopeLabel: overdue[0]?.topic ?? weak[0]?.name ?? null,
        },
        {
          title: "Retest one corrected concept",
          description: "Run a short retest after reviewing the mistakes to verify the fix actually held.",
          priority: "MEDIUM",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 30,
          dueDate: isoDayFromNow(1),
          rationale: "Without retesting, correction quality stays unknown.",
        },
      ],
    },
    REVISION_PULSE: {
      title: "Revision Pulse",
      summary: "This run is centered on memory stability. It prioritizes overdue reviews and zero-revision completed areas before fresh expansion.",
      insights: [
        overdue[0] ? `${overdue.length} overdue revision topics are visible in the current sample.` : "No overdue revision topics were found in the sample.",
        ...baseInsights.slice(0, 2),
      ],
      dailyCommand: {
        primaryOutcome: "Reduce revision debt before expanding into new content.",
        questionTarget: 30,
        revisionTarget: overdue[0] ? overdue.map((item) => item.topic).slice(0, 2).join(", ") : "Old completed topics with zero revisions",
        studyMinutes: 160,
        shutdownRule: "End the day only after at least one overdue review and one active recall block are done.",
      },
      taskSuggestions: [
        {
          title: `Overdue review: ${overdue[0]?.topic ?? overdue[0]?.chapter ?? "priority revision topic"}`,
          description: overdue[0] ? `Revise ${overdue[0].topic} from ${overdue[0].subject} and close the due review.` : "Close the oldest overdue review task from the revision queue.",
          priority: "CRITICAL",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 35,
          dueDate: isoDayFromNow(0),
          rationale: "Due reviews are the cleanest sign of material beginning to fade.",
          scopeType: overdue[0]?.chapter ? "CHAPTER" : "TOPIC",
          scopeLabel: overdue[0]?.chapter ?? overdue[0]?.topic ?? null,
        },
        {
          title: `Active recall: ${overdue[1]?.chapter ?? weak[0]?.name ?? "revision block"}`,
          description: overdue[1]
            ? `Use recall-first revision on ${overdue[1].topic} from ${overdue[1].subject}.`
            : "Use recall-first revision instead of passive rereading for one weak chapter.",
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 45,
          dueDate: isoDayFromNow(0),
          rationale: "Active recall exposes what is actually weak.",
          scopeType: overdue[1]?.chapter ? "CHAPTER" : "SUBJECT",
          scopeLabel: overdue[1]?.chapter ?? weak[0]?.name ?? null,
        },
        {
          title: `Zero-revision revisit: ${untouched[0]?.chapter ?? "priority chapter"}`,
          description: untouched[0]
            ? `Revisit ${untouched[0].topic} because that chapter still has shallow revision depth.`
            : "Revisit one completed topic that still has zero revision depth.",
          priority: "MEDIUM",
          subjectSlug: neglected[0]?.slug ?? null,
          plannedMinutes: 30,
          dueDate: isoDayFromNow(1),
          rationale: "Completed without revision is usually unstable learning.",
          scopeType: untouched[0]?.chapter ? "CHAPTER" : "TOPIC",
          scopeLabel: untouched[0]?.chapter ?? untouched[0]?.topic ?? null,
        },
      ],
    },
    DAILY_COMMAND: {
      title: "Daily Command",
      summary: "This is a narrow, high-leverage daily command built to keep the user focused on what matters most today instead of opening too many lanes.",
      insights: baseInsights,
      dailyCommand: {
        primaryOutcome: `Move ${weak[0]?.name ?? "the weakest area"} forward without letting revision debt grow.`,
        questionTarget: 45,
        revisionTarget: overdue[0]?.topic ?? "one overdue review",
        studyMinutes: 180,
        shutdownRule: "No new study lane after the primary outcome, question target, and revision target are all checked.",
      },
      taskSuggestions: [
        {
          title: `Primary command: ${overdue[0]?.topic ?? weak[0]?.name ?? "weak area"}`,
          description: overdue[0]
            ? `Use the strongest available block on ${overdue[0].topic} from ${overdue[0].subject}.`
            : "Use the strongest available block of the day on the highest-priority weak area.",
          priority: "CRITICAL",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 90,
          dueDate: isoDayFromNow(0),
          rationale: "The best daily command is short, hard, and unambiguous.",
          scopeType: overdue[0] ? "TOPIC" : "SUBJECT",
          scopeLabel: overdue[0]?.topic ?? weak[0]?.name ?? null,
        },
        {
          title: "Close one overdue review",
          description: "Finish one overdue revision task before ending the session.",
          priority: "HIGH",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 30,
          dueDate: isoDayFromNow(0),
          rationale: "A day should not end with fresh work but no retention work.",
        },
      ],
    },
    PATTERN_DETECTOR: {
      title: "Pattern Detector",
      summary: "This run looks for execution patterns in the tracker and converts them into interventions the user can manually choose to apply.",
      insights: [
        `${analytics.executionStats.skipped} skipped tasks are present in the current task sample.`,
        `${analytics.executionStats.aiCreated} AI-created tasks and ${analytics.executionStats.manualCreated} manual tasks are visible in the board sample.`,
        ...baseInsights.slice(0, 1),
      ],
      dailyCommand: {
        primaryOutcome: "Break one repeat avoidance pattern and verify it with one finished task today.",
        questionTarget: 35,
        revisionTarget: neglected[0]?.name ?? "neglected subject",
        studyMinutes: 150,
        shutdownRule: "Count the pattern broken only if the avoided subject or skipped lane gets completed once today.",
      },
      taskSuggestions: [
        {
          title: `Avoidance breaker: ${untouched[0]?.chapter ?? neglected[0]?.name ?? "neglected area"}`,
          description: untouched[0]
            ? `Do the first complete session on ${untouched[0].topic} from ${untouched[0].subject}.`
            : "Do the first complete session in the area that has been left alone longest.",
          priority: "HIGH",
          subjectSlug: neglected[0]?.slug ?? null,
          plannedMinutes: 45,
          dueDate: isoDayFromNow(0),
          rationale: "Neglected areas usually point to silent avoidance, not just poor planning.",
          scopeType: untouched[0]?.chapter ? "CHAPTER" : "SUBJECT",
          scopeLabel: untouched[0]?.chapter ?? neglected[0]?.name ?? null,
        },
        {
          title: "Skip recovery pass",
          description: "Review recently skipped tasks and reactivate one that still matters.",
          priority: "MEDIUM",
          subjectSlug: null,
          plannedMinutes: 20,
          dueDate: isoDayFromNow(0),
          rationale: "Skipped work should be reviewed intentionally instead of forgotten by default.",
        },
        {
          title: `Consistency anchor for ${weak[0]?.name ?? "weak subject"}`,
          description: "Set one small but non-negotiable recurring block for the weakest subject.",
          priority: "MEDIUM",
          subjectSlug: weak[0]?.slug ?? null,
          plannedMinutes: 30,
          dueDate: isoDayFromNow(1),
          rationale: "Patterns improve when the board contains repeatable anchors, not only big goals.",
        },
      ],
    },
  };

  const payload = payloadByKind[kind];
  if (goal?.trim()) {
    payload.summary = `${payload.summary} User instruction applied: ${goal.trim()}.`;
  }
  return payload;
}

async function buildMissionAnalytics() {
  const today = new Date();
  const last14 = new Date(today.getTime() - 14 * 86400000);
  const last30 = new Date(today.getTime() - 30 * 86400000);

  const [subjects, topics, goals14, goals30, tests, tasks, taskRuns] = await Promise.all([
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.topic.findMany({
      select: {
        id: true,
        name: true,
        chapter: true,
        subjectId: true,
        isCompleted: true,
        nextReviewDate: true,
        revisions: { select: { id: true, revisedAt: true } },
      },
    }),
    db.dailyGoal.findMany({
      where: { date: { gte: last14 } },
      include: { subject: { select: { id: true, name: true, slug: true } } },
      orderBy: { date: "desc" },
    }),
    db.dailyGoal.findMany({
      where: { date: { gte: last30 } },
      include: { subject: { select: { id: true, name: true, slug: true } } },
      orderBy: { date: "desc" },
    }),
    db.testRecord.findMany({
      include: { subject: { select: { id: true, name: true, slug: true } } },
      orderBy: { takenAt: "desc" },
      take: 12,
    }),
    db.task.findMany({
      include: { subject: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    db.taskAgentRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));

  const subjectStats = subjects.map((subject) => {
    const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
    const completed = subjectTopics.filter((topic) => topic.isCompleted).length;
    const overdue = subjectTopics.filter((topic) => topic.nextReviewDate && topic.nextReviewDate <= today).length;
    const zeroRevision = subjectTopics.filter((topic) => topic.isCompleted && topic.revisions.length === 0).length;
    const lastStudy = goals30.filter((goal) => goal.subjectId === subject.id).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    const subjectTests = tests.filter((test) => test.subjectId === subject.id);
    const avgTest = subjectTests.length
      ? Number((subjectTests.reduce((sum, test) => sum + test.percentage, 0) / subjectTests.length).toFixed(1))
      : null;
    const q30 = goals30.filter((goal) => goal.subjectId === subject.id).reduce((sum, goal) => sum + goal.questionsSolved, 0);
    const h30 = goals30.filter((goal) => goal.subjectId === subject.id).reduce((sum, goal) => sum + goal.hoursStudied, 0);

    return {
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      completionPct: subjectTopics.length ? Math.round((completed / subjectTopics.length) * 100) : 0,
      overdueReviews: overdue,
      zeroRevisionCompletedTopics: zeroRevision,
      avgTestPercentage: avgTest,
      lastStudyDate: lastStudy?.date.toISOString() ?? null,
      daysSinceStudy: lastStudy ? Math.floor((today.getTime() - lastStudy.date.getTime()) / 86400000) : null,
      questionsLast30: q30,
      hoursLast30: Number(h30.toFixed(1)),
    };
  });

  const untouchedTopics = topics
    .filter((topic) => !topic.isCompleted && (!topic.revisions.length))
    .slice(0, 20)
    .map((topic) => ({
      topic: topic.name,
      chapter: topic.chapter,
      subject: subjectMap.get(topic.subjectId)?.name ?? "Unknown",
    }));

  const overdueRevisionTopics = topics
    .filter((topic) => topic.nextReviewDate && topic.nextReviewDate <= today)
    .slice(0, 20)
    .map((topic) => ({
      topic: topic.name,
      chapter: topic.chapter,
      subject: subjectMap.get(topic.subjectId)?.name ?? "Unknown",
    }));

  const visibleTasks = getVisibleBoardTasks(tasks, today);
  const executionStats = {
    totalTasks: visibleTasks.length,
    done: visibleTasks.filter((task) => task.status === "DONE").length,
    skipped: visibleTasks.filter((task) => task.status === "SKIPPED").length,
    inProgress: visibleTasks.filter((task) => task.status === "IN_PROGRESS").length,
    aiCreated: visibleTasks.filter((task) => task.source === "AI").length,
    manualCreated: visibleTasks.filter((task) => task.source === "MANUAL").length,
    recentAiRuns: taskRuns.length,
  };

  return {
    subjectStats,
    recentGoals14: goals14.map((goal) => ({
      date: goal.date.toISOString(),
      subject: goal.subject.name,
      hoursStudied: goal.hoursStudied,
      questionsSolved: goal.questionsSolved,
    })),
    recentTests: tests.map((test) => ({
      testName: test.testName,
      subject: test.subject?.name ?? null,
      percentage: test.percentage,
      takenAt: test.takenAt.toISOString(),
    })),
    executionStats,
    untouchedTopics,
    overdueRevisionTopics,
  };
}

function buildMissionPrompt(kind: MissionKind, goal: string | undefined, context: Awaited<ReturnType<typeof buildAIContext>>, analytics: Awaited<ReturnType<typeof buildMissionAnalytics>>) {
  const kindConfig = KIND_COPY[kind];

  return [
    `You are ${kindConfig.title} for a NEET-UG tracker.`,
    "You are manual-only and should behave like an opt-in execution planner, not an autonomous agent.",
    "All recommendations must be grounded in the supplied data.",
    "Do not hallucinate missing evidence.",
    "You may recommend tasks, but only as suggestions for the user to accept.",
    goal ? `User goal: ${goal}` : "User goal: none supplied, so infer the most useful intervention from the data.",
    `Feature intent: ${kindConfig.description}`,
    "Return valid JSON only. No markdown fences. No prose outside JSON.",
    `JSON shape:
{
  "title": "short title",
  "summary": "2-4 sentence summary",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "dailyCommand": {
    "primaryOutcome": "single sentence",
    "questionTarget": 0,
    "revisionTarget": "string",
    "studyMinutes": 0,
    "shutdownRule": "single sentence"
  },
      "taskSuggestions": [
    {
      "title": "task title",
      "description": "task detail",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "subjectSlug": "physics|chemistry|botany|zoology|null",
      "plannedMinutes": 90,
      "dueDate": "YYYY-MM-DD or null",
      "rationale": "why this task exists",
      "scopeType": "TOPIC|CHAPTER|SUBJECT",
      "scopeLabel": "specific topic or chapter if available"
    }
  ]
}`,
    `Create between ${kindConfig.taskMin} and ${kindConfig.taskMax} taskSuggestions.`,
    "Prefer topic-wise or chapter-wise taskSuggestions over generic subject-only tasks whenever the analytics expose a concrete topic or chapter.",
    "For TEST_RECOVERY, at least one task must be test-analysis focused.",
    "For REVISION_PULSE, at least one task must be revision-focused.",
    "For DAILY_COMMAND, keep scope narrow and high-leverage.",
    "For PATTERN_DETECTOR, use execution/todo behavior and study consistency as evidence.",
    `Student context JSON:\n${JSON.stringify(context, null, 2)}`,
    `Mission analytics JSON:\n${JSON.stringify(analytics, null, 2)}`,
  ].join("\n\n");
}

function buildMissionMarkdown(kind: MissionKind, payload: MissionPayload) {
  const sections = [
    `## ${KIND_COPY[kind].title}`,
    payload.summary,
    "## Key signals",
    payload.insights.map((insight) => `- ${insight}`).join("\n"),
  ];

  if (payload.dailyCommand) {
    sections.push(
      "## Daily command",
      `- Primary outcome: ${payload.dailyCommand.primaryOutcome}`,
      payload.dailyCommand.questionTarget ? `- Question target: ${payload.dailyCommand.questionTarget}` : "",
      payload.dailyCommand.revisionTarget ? `- Revision target: ${payload.dailyCommand.revisionTarget}` : "",
      payload.dailyCommand.studyMinutes ? `- Study minutes: ${payload.dailyCommand.studyMinutes}` : "",
      `- Shutdown rule: ${payload.dailyCommand.shutdownRule}`,
    );
  }

  sections.push(
    "## Task suggestions",
    payload.taskSuggestions.map((task) => `- **${task.title}**: ${task.description}`).join("\n")
  );

  return sections.filter(Boolean).join("\n\n");
}

async function createTasksFromMission(sessionId: string, kind: MissionKind, tasks: SuggestedTask[]) {
  if (!tasks.length) return [];

  const subjects = await db.subject.findMany({ select: { id: true, slug: true } });
  const slugMap = new Map(subjects.map((subject) => [subject.slug, subject.id]));
  const lastTask = await db.task.findFirst({
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  let orderIndex = (lastTask?.orderIndex ?? -1) + 1;

  const created = [];
  for (const task of tasks) {
    const row = await db.task.create({
      data: {
        missionId: sessionId,
        source: "AI",
        title: task.title,
        description: buildTaskDescriptionWithReason(task.description, task.rationale),
        priority: task.priority,
        subjectId: task.subjectSlug ? (slugMap.get(task.subjectSlug) ?? null) : null,
        dueDate: task.dueDate ? startOfLocalDay(task.dueDate) : null,
        plannedMinutes: task.plannedMinutes ?? null,
        aiAssistEnabled: true,
        orderIndex: orderIndex++,
        timelineEvents: {
          create: {
            type: "CREATED",
            label: "AI-suggested task created",
            detail: KIND_COPY[kind].title,
          },
        },
      },
    });
    created.push(row);
  }
  return created;
}

export async function generateMissionSession(input: {
  kind: MissionKind;
  goal?: string;
  createTasks?: boolean;
  subjectSlug?: string;
}) {
  await refreshTodoWorkspace();
  if (input.createTasks) {
    await clearMissionReasonsNow();
  }
  const [context, analytics] = await Promise.all([buildAIContext(), buildMissionAnalytics()]);
  const prompt = buildMissionPrompt(input.kind, input.goal, context, analytics);
  let parsed: MissionPayload | null = null;
  let model = "deterministic-fallback";

  try {
    const result = await chatWithAI(
      [
        {
          role: "system",
          content:
            "You are a highly constrained NEET execution-planning engine. Respond only with valid JSON. Never include markdown fences.",
        },
        { role: "user", content: prompt },
      ],
      2200,
      0.2
    );
    parsed = parseMissionPayload(result.content);
    model = result.model;
  } catch (error) {
    console.warn("[Mission Control] AI mission generation failed, using deterministic fallback.", error);
  }

  if (!parsed || !parsed.title || !Array.isArray(parsed.insights) || !Array.isArray(parsed.taskSuggestions)) {
    parsed = buildFallbackMissionPayload(input.kind, input.goal, analytics);
  }

  const subject = input.subjectSlug
    ? await db.subject.findUnique({ where: { slug: input.subjectSlug } })
    : null;

  const markdown = buildMissionMarkdown(input.kind, parsed);
  const session = await db.missionSession.create({
    data: {
      kind: input.kind,
      title: parsed.title,
      goal: input.goal ?? null,
      summary: parsed.summary,
      responseMarkdown: markdown,
      responseJson: parsed,
      model,
      subjectId: subject?.id ?? null,
    },
    include: {
      tasks: {
        orderBy: { orderIndex: "asc" },
      },
      subject: true,
    },
  });

  if (input.createTasks && parsed.taskSuggestions.length) {
    await createTasksFromMission(session.id, input.kind, parsed.taskSuggestions);
  }

  return db.missionSession.findUniqueOrThrow({
    where: { id: session.id },
    include: {
      tasks: {
        include: { subject: { select: { id: true, name: true, slug: true, color: true } } },
        orderBy: { orderIndex: "asc" },
      },
      subject: { select: { id: true, name: true, slug: true, color: true } },
    },
  });
}

export async function getMissionSessions() {
  await refreshTodoWorkspace();
  return db.missionSession.findMany({
    include: {
      tasks: {
        include: { subject: { select: { id: true, name: true, slug: true, color: true } } },
        orderBy: { orderIndex: "asc" },
      },
      subject: { select: { id: true, name: true, slug: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
}

export async function updateMissionSessionStatus(id: string, status: MissionSession["status"]) {
  return db.missionSession.update({
    where: { id },
    data: { status },
  });
}
