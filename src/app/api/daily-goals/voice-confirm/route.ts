import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { clampActivityNumbers, type StudyActivityKindValue, type StudyCoverageValue } from "@/lib/study-activity";

type GoalEntry = { subjectId: string; hoursStudied: number; questionsSolved: number; intensityLevel: number; notes?: string | null };
type ActivityDraft = {
  subjectId: string;
  topicId?: string | null;
  chapter: string;
  kind: StudyActivityKindValue;
  coverage: StudyCoverageValue;
  hoursStudied: number;
  questionsDelta: number;
  intensityLevel: number;
  notes?: string | null;
  weakConcepts?: string | null;
  completionConfirmed?: boolean;
};
type TodoDraft = { title: string; description?: string | null; subjectId?: string | null; plannedMinutes?: number | null };
type StudySuggestion = TodoDraft & { id: string; kind: "REVISION" | "TEST"; reason: string; dueDate: string };

const ACTIVITY_KINDS = new Set<StudyActivityKindValue>(["NEW_LEARNING", "PRACTICE", "REVISION", "TEST_REVIEW"]);
const COVERAGES = new Set<StudyCoverageValue>(["PARTIAL", "FULL"]);

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function safeText(value: unknown, maximum = 4000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null;
}

function canonicalChapter(value: string, chapters: string[]) {
  const normalized = value.trim().toLocaleLowerCase("en-IN");
  return chapters.find((chapter) => chapter.toLocaleLowerCase("en-IN") === normalized) ?? null;
}

function buildStudySuggestions(activities: ActivityDraft[], logDate: Date, existingTodos: TodoDraft[]): StudySuggestion[] {
  const existingTitles = new Set(existingTodos.map((todo) => todo.title.toLowerCase()));
  const suggestions: StudySuggestion[] = [];
  const revisionCandidate = activities.find((activity) => activity.weakConcepts)
    ?? activities.find((activity) => activity.kind === "NEW_LEARNING")
    ?? activities.find((activity) => activity.completionConfirmed)
    ?? activities[0];
  if (revisionCandidate) {
    const due = new Date(logDate);
    due.setUTCDate(due.getUTCDate() + (revisionCandidate.kind === "NEW_LEARNING" ? 2 : 1));
    const label = revisionCandidate.chapter;
    const title = `Revise ${label}`;
    if (!existingTitles.has(title.toLowerCase())) suggestions.push({
      id: `revision:${revisionCandidate.subjectId}:${label}`,
      kind: "REVISION",
      title,
      description: revisionCandidate.weakConcepts
        ? `Focus on: ${revisionCandidate.weakConcepts}. Suggested after today’s voice log.`
        : "Short spaced revision suggested from today’s confirmed study activity.",
      subjectId: revisionCandidate.subjectId,
      plannedMinutes: 25,
      dueDate: due.toISOString().slice(0, 10),
      reason: revisionCandidate.weakConcepts ? `You marked ${revisionCandidate.weakConcepts} as a weak area.` : "A short spaced review will protect today’s learning.",
    });
  }
  const testCandidate = activities.find((activity) => activity.completionConfirmed)
    ?? activities.find((activity) => activity.questionsDelta >= 40);
  if (testCandidate) {
    const due = new Date(logDate);
    due.setUTCDate(due.getUTCDate() + 1);
    const title = `Take a 20-question ${testCandidate.chapter} test`;
    if (!existingTitles.has(title.toLowerCase())) suggestions.push({
      id: `test:${testCandidate.subjectId}:${testCandidate.chapter}`,
      kind: "TEST",
      title,
      description: "Use Practice Arena to verify retention after today’s work.",
      subjectId: testCandidate.subjectId,
      plannedMinutes: 30,
      dueDate: due.toISOString().slice(0, 10),
      reason: testCandidate.completionConfirmed ? "You marked this area completed; a short test can verify it." : `You solved ${testCandidate.questionsDelta} questions here today.`,
    });
  }
  return suggestions.slice(0, 2);
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId.slice(0, 191) : "";
  const dateText = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  if (!requestId || !dateText || !Array.isArray(body.entries) || !Array.isArray(body.todos)) {
    return NextResponse.json({ error: "A valid reviewed voice log is required" }, { status: 400 });
  }

  const previous = await db.voiceDailyLogSubmission.findUnique({ where: { requestId } });
  if (previous) {
    return NextResponse.json({ saved: true, duplicate: true, submissionId: previous.id, taskIds: Array.isArray(previous.createdTaskIdsJson) ? previous.createdTaskIdsJson : [] });
  }

  const subjects = await db.subject.findMany({
    select: {
      id: true,
      name: true,
      topics: { select: { id: true, name: true, chapter: true, questionsSolved: true, isCompleted: true, completedAt: true } },
    },
  });
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const topicById = new Map(subjects.flatMap((subject) => subject.topics.map((topic) => [topic.id, { ...topic, subjectId: subject.id }] as const)));
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const entries = (body.entries as GoalEntry[]).slice(0, subjects.length).map((entry) => ({
    subjectId: String(entry.subjectId ?? ""),
    hoursStudied: finiteNumber(entry.hoursStudied, 0, 24),
    questionsSolved: Math.round(finiteNumber(entry.questionsSolved, 0, 5000)),
    intensityLevel: Math.round(finiteNumber(entry.intensityLevel, 0, 5)),
    notes: safeText(entry.notes),
  }));
  if (!entries.length || entries.some((entry) => !subjectIds.has(entry.subjectId))) {
    return NextResponse.json({ error: "The voice log contains an unknown subject" }, { status: 400 });
  }

  const activityInput = Array.isArray(body.activities) ? (body.activities as ActivityDraft[]).slice(0, 24) : [];
  const activities: ActivityDraft[] = [];
  for (const draft of activityInput) {
    const subject = subjectById.get(String(draft.subjectId ?? ""));
    if (!subject) return NextResponse.json({ error: "A study activity contains an unknown subject" }, { status: 400 });
    const topic = draft.topicId ? topicById.get(String(draft.topicId)) : null;
    if (draft.topicId && (!topic || topic.subjectId !== subject.id)) {
      return NextResponse.json({ error: "The selected topic does not belong to this subject" }, { status: 400 });
    }
    const chapters = [...new Set(subject.topics.map((item) => item.chapter ?? item.name))];
    const chapter = topic ? (topic.chapter ?? topic.name) : canonicalChapter(String(draft.chapter ?? ""), chapters);
    if (!chapter) return NextResponse.json({ error: `Please choose a known ${subject.name} chapter before saving.` }, { status: 400 });
    const numbers = clampActivityNumbers(draft);
    const kind = ACTIVITY_KINDS.has(draft.kind) ? draft.kind : "PRACTICE";
    const coverage = COVERAGES.has(draft.coverage) ? draft.coverage : "PARTIAL";
    if (!topic && draft.completionConfirmed && coverage !== "FULL") {
      return NextResponse.json({ error: "Chapter completion needs an explicit full-chapter confirmation" }, { status: 400 });
    }
    activities.push({
      subjectId: subject.id,
      topicId: topic?.id ?? null,
      chapter,
      kind,
      coverage,
      ...numbers,
      notes: safeText(draft.notes),
      weakConcepts: safeText(draft.weakConcepts),
      completionConfirmed: draft.completionConfirmed === true,
    });
  }

  const todos = (body.todos as TodoDraft[]).slice(0, 12).map((todo) => ({
    title: String(todo.title ?? "").trim().slice(0, 191),
    description: safeText(todo.description),
    subjectId: todo.subjectId && subjectIds.has(todo.subjectId) ? todo.subjectId : null,
    plannedMinutes: todo.plannedMinutes == null ? null : Math.round(finiteNumber(todo.plannedMinutes, 5, 1440)),
  })).filter((todo) => todo.title);
  const disciplineScore = Math.round(finiteNumber(body.disciplineScore, 0, 100));
  const completionPercent = Math.round(finiteNumber(body.completionPercent, 0, 100));
  const logDate = new Date(`${dateText}T00:00:00.000Z`);
  const dueDate = new Date(logDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 1);
  const existingPendingTodos = await db.task.findMany({
    where: { status: { in: ["TODO", "IN_PROGRESS"] } },
    select: { title: true },
    take: 100,
  });

  try {
    const result = await db.$transaction(async (transaction) => {
      const affectedTopicIds = [...new Set(activities.flatMap((activity) => {
        if (activity.topicId) return [activity.topicId];
        if (activity.completionConfirmed || (activity.kind === "REVISION" && activity.coverage === "FULL")) {
          return subjectById.get(activity.subjectId)?.topics.filter((topic) => (topic.chapter ?? topic.name) === activity.chapter).map((topic) => topic.id) ?? [];
        }
        return [];
      }))];
      const [beforeGoals, beforeTopics] = await Promise.all([
        transaction.dailyGoal.findMany({ where: { subjectId: { in: entries.map((entry) => entry.subjectId) }, date: logDate } }),
        affectedTopicIds.length ? transaction.topic.findMany({ where: { id: { in: affectedTopicIds } }, select: { id: true, questionsSolved: true, isCompleted: true, completedAt: true } }) : [],
      ]);
      const submission = await transaction.voiceDailyLogSubmission.create({
        data: {
          requestId,
          userId: session.userId,
          logDate,
          payloadJson: { entries, activities, disciplineScore, completionPercent, todos, beforeState: { goals: beforeGoals, topics: beforeTopics } },
        },
      });

      for (const entry of entries) {
        const empty = entry.hoursStudied === 0 && entry.questionsSolved === 0 && entry.intensityLevel === 0 && !entry.notes;
        if (empty) {
          await transaction.dailyGoal.deleteMany({ where: { subjectId: entry.subjectId, date: logDate } });
          continue;
        }
        await transaction.dailyGoal.upsert({
          where: { subjectId_date: { subjectId: entry.subjectId, date: logDate } },
          create: { subjectId: entry.subjectId, date: logDate, hoursStudied: entry.hoursStudied, questionsSolved: entry.questionsSolved, intensityLevel: entry.intensityLevel, disciplineScore, completionPercent, notes: entry.notes },
          update: { hoursStudied: entry.hoursStudied, questionsSolved: entry.questionsSolved, intensityLevel: entry.intensityLevel, disciplineScore, completionPercent, notes: entry.notes },
        });
      }

      const activityIds: string[] = [];
      const revisionSessionIds: string[] = [];
      for (const activity of activities) {
        const created = await transaction.studyActivity.create({
          data: { ...activity, userId: session.userId, date: logDate, source: "VOICE_ASSISTANT", voiceSubmissionId: submission.id },
        });
        activityIds.push(created.id);
        if (activity.topicId && activity.questionsDelta > 0) {
          await transaction.topic.update({ where: { id: activity.topicId }, data: { questionsSolved: { increment: activity.questionsDelta } } });
        }
        const chapterTopics = subjectById.get(activity.subjectId)?.topics.filter((topic) => (topic.chapter ?? topic.name) === activity.chapter) ?? [];
        if (activity.completionConfirmed) {
          const completionIds = activity.topicId ? [activity.topicId] : chapterTopics.map((topic) => topic.id);
          if (completionIds.length) await transaction.topic.updateMany({ where: { id: { in: completionIds } }, data: { isCompleted: true, completedAt: new Date() } });
        }
        if (activity.kind === "REVISION") {
          const revisionSession = await transaction.revisionSession.create({
            data: { userId: session.userId, subjectId: activity.subjectId, topicId: activity.topicId ?? null, chapter: activity.chapter, coverage: activity.coverage, note: activity.notes, source: "VOICE_ASSISTANT", voiceSubmissionId: submission.id },
          });
          revisionSessionIds.push(revisionSession.id);
          const revisedTopicIds = activity.topicId ? [activity.topicId] : activity.coverage === "FULL" ? chapterTopics.map((topic) => topic.id) : [];
          if (revisedTopicIds.length) {
            await transaction.revision.createMany({ data: revisedTopicIds.map((topicId) => ({ topicId, revisionSessionId: revisionSession.id, note: activity.notes })) });
          }
        }
      }

      const lastTask = await transaction.task.findFirst({ orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
      const createdTaskIds: string[] = [];
      for (const [index, todo] of todos.entries()) {
        const task = await transaction.task.create({
          data: {
            ...todo,
            source: "VOICE_ASSISTANT",
            dueDate,
            orderIndex: (lastTask?.orderIndex ?? -1) + index + 1,
            aiAssistEnabled: false,
            voiceSubmissionId: submission.id,
            timelineEvents: { create: { type: "CREATED", label: "Created from Daily Goals voice review", detail: `Planned for ${dueDate.toISOString().slice(0, 10)}` } },
          },
        });
        createdTaskIds.push(task.id);
      }
      await transaction.voiceDailyLogSubmission.update({ where: { id: submission.id }, data: { createdTaskIdsJson: createdTaskIds } });
      return { submissionId: submission.id, taskIds: createdTaskIds, activityIds, revisionSessionIds };
    }, { timeout: 30_000 });
    const suggestions = buildStudySuggestions(activities, logDate, [...todos, ...existingPendingTodos]);
    return NextResponse.json({ saved: true, ...result, suggestions, todoHref: "/todo", undoHref: `/api/daily-goals/voice-confirm/${result.submissionId}/undo` });
  } catch (error) {
    const duplicate = await db.voiceDailyLogSubmission.findUnique({ where: { requestId } });
    if (duplicate) return NextResponse.json({ saved: true, duplicate: true, submissionId: duplicate.id, taskIds: duplicate.createdTaskIdsJson ?? [] });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the reviewed voice log" }, { status: 500 });
  }
}
