import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { normalizeKey } from "@/data/syllabus/neet-chapters";
import { findLikelyDuplicateTopic } from "@/lib/topic-manager";

export const runtime = "nodejs";

type TaskPayload = {
  kind: "CREATE_TASK";
  title: string;
  subjectId: string | null;
  due: "TODAY" | "TOMORROW" | null;
  plannedMinutes: number | null;
};

type StudyPayload = {
  kind: "UPDATE_STUDY";
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  topicId: string | null;
  topicName: string | null;
  chapter: string;
  questionsDelta: number;
  hoursStudied: number;
  intensityLevel: number;
  addRevision: boolean;
  markCompleted: boolean;
  coverage: "FULL" | "PARTIAL";
  activityKind: "NEW_LEARNING" | "PRACTICE" | "REVISION" | "TEST_REVIEW";
};

type TopicPayload = {
  kind: "CREATE_TOPIC";
  topicName: string;
  chapter: string;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  classLevel: string | null;
};

type ChapterPayload = {
  kind: "CREATE_CHAPTER";
  chapterName: string;
  firstTopicName: string;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  classLevel: "11" | "12";
};

function localDate(offsetDays = 0) {
  const source = new Date(Date.now() + offsetDays * 86_400_000);
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(source);
  return new Date(`${key}T00:00:00.000Z`);
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function topicHref(subjectSlug: string, chapter: string, topic?: string) {
  const params = new URLSearchParams({ chapter });
  if (topic) params.set("topic", topic);
  return `/subjects/${subjectSlug}?${params.toString()}`;
}

export async function POST(request: NextRequest, context: { params: Promise<{ actionId: string }> }) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Private session required" }, { status: 401 });
  const { actionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === "CANCEL" ? "CANCEL" : "CONFIRM";
  const action = await db.assistantAction.findUnique({ where: { id: actionId } });
  if (!action || action.userId !== session.userId) return NextResponse.json({ error: "Pending action not found" }, { status: 404 });
  if (action.status === "COMPLETED" || action.status === "CANCELLED") return NextResponse.json(action.resultJson ?? { state: "DONE" });
  if (action.status !== "PENDING") return NextResponse.json({ error: "This action is no longer awaiting confirmation" }, { status: 409 });

  if (decision === "CANCEL") {
    const result = { actionId, kind: action.kind, state: "DONE", reply: "Cancelled. Nothing was changed.", cancelled: true };
    await db.assistantAction.update({ where: { id: action.id }, data: { status: "CANCELLED", resultJson: json(result) } });
    return NextResponse.json(result);
  }

  const payload = action.payloadJson as unknown as TaskPayload | StudyPayload | TopicPayload | ChapterPayload;
  try {
    if (payload.kind === "CREATE_TASK") {
      const dueDate = payload.due === "TODAY" ? localDate() : payload.due === "TOMORROW" ? localDate(1) : null;
      const lastTask = await db.task.findFirst({ orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
      const task = await db.task.create({
        data: {
          title: payload.title,
          subjectId: payload.subjectId,
          dueDate,
          plannedMinutes: payload.plannedMinutes,
          source: "VOICE_ASSISTANT",
          aiAssistEnabled: false,
          orderIndex: (lastTask?.orderIndex ?? -1) + 1,
          timelineEvents: { create: { type: "CREATED", label: "Created by Bubu", detail: "Confirmed voice command" } },
        },
      });
      const result = { actionId, kind: payload.kind, state: "DONE", reply: `Done. “${payload.title}” is now in Todo.`, href: "/todo", label: payload.title, taskId: task.id };
      await db.assistantAction.update({ where: { id: action.id }, data: { status: "COMPLETED", resultJson: json(result) } });
      return NextResponse.json(result);
    }

    if (payload.kind === "CREATE_TOPIC") {
      const result = await db.$transaction(async (transaction) => {
        const existingTopics = await transaction.topic.findMany({
          where: { subjectId: payload.subjectId, chapter: payload.chapter },
          orderBy: { topicOrder: "asc" },
        });
        const existing = findLikelyDuplicateTopic(payload.topicName, existingTopics);
        if (existing) {
          const response = {
            actionId,
            kind: payload.kind,
            state: "DONE",
            reply: `“${existing.name}” already exists in ${payload.chapter}, so no duplicate was created.`,
            href: topicHref(payload.subjectSlug, payload.chapter, existing.name),
            label: existing.name,
            topicId: existing.id,
            created: false,
            canUndo: false,
          };
          await transaction.assistantAction.update({ where: { id: action.id }, data: { status: "NOOP", resultJson: json(response) } });
          return response;
        }
        const lastChapter = await transaction.topic.findFirst({
          where: { subjectId: payload.subjectId },
          orderBy: { chapterOrder: "desc" },
          select: { chapterOrder: true },
        });
        const topic = await transaction.topic.create({
          data: {
            subjectId: payload.subjectId,
            name: payload.topicName,
            chapter: payload.chapter,
            classLevel: payload.classLevel,
            chapterOrder: existingTopics[0]?.chapterOrder ?? (lastChapter?.chapterOrder ?? -1) + 1,
            topicOrder: (existingTopics.at(-1)?.topicOrder ?? -1) + 1,
          },
        });
        const response = {
          actionId,
          kind: payload.kind,
          state: "DONE",
          reply: `Done. “${topic.name}” is now inside ${payload.chapter}.`,
          href: topicHref(payload.subjectSlug, payload.chapter, topic.name),
          label: topic.name,
          topicId: topic.id,
          created: true,
          canUndo: true,
        };
        await transaction.assistantAction.update({ where: { id: action.id }, data: { status: "COMPLETED", resultJson: json(response) } });
        return response;
      });
      return NextResponse.json(result);
    }

    if (payload.kind === "CREATE_CHAPTER") {
      const result = await db.$transaction(async (transaction) => {
        const chapterRows = await transaction.topic.findMany({
          where: { subjectId: payload.subjectId, chapter: { not: null } },
          select: { chapter: true },
          distinct: ["chapter"],
        });
        const existingChapter = chapterRows
          .map((row) => row.chapter)
          .filter((chapter): chapter is string => typeof chapter === "string")
          .find((chapter) => normalizeKey(chapter) === normalizeKey(payload.chapterName));
        if (existingChapter) {
          const response = {
            actionId,
            kind: payload.kind,
            state: "DONE",
            reply: `${existingChapter} already exists in ${payload.subjectName}, so no duplicate was created.`,
            href: topicHref(payload.subjectSlug, existingChapter),
            label: existingChapter,
            created: false,
            canUndo: false,
          };
          await transaction.assistantAction.update({ where: { id: action.id }, data: { status: "NOOP", resultJson: json(response) } });
          return response;
        }
        const lastChapter = await transaction.topic.findFirst({
          where: { subjectId: payload.subjectId },
          orderBy: { chapterOrder: "desc" },
          select: { chapterOrder: true },
        });
        const topic = await transaction.topic.create({
          data: {
            subjectId: payload.subjectId,
            name: payload.firstTopicName,
            chapter: payload.chapterName,
            classLevel: payload.classLevel,
            chapterOrder: (lastChapter?.chapterOrder ?? -1) + 1,
            topicOrder: 0,
          },
        });
        const response = {
          actionId,
          kind: payload.kind,
          state: "DONE",
          reply: `Done. “${payload.chapterName}” is ready with “${topic.name}” as its first topic.`,
          href: topicHref(payload.subjectSlug, payload.chapterName, topic.name),
          label: payload.chapterName,
          topicId: topic.id,
          created: true,
          canUndo: true,
        };
        await transaction.assistantAction.update({ where: { id: action.id }, data: { status: "COMPLETED", resultJson: json(response) } });
        return response;
      });
      return NextResponse.json(result);
    }

    const result = await db.$transaction(async (transaction) => {
      const date = localDate();
      const chapterTopics = await transaction.topic.findMany({ where: { subjectId: payload.subjectId, chapter: payload.chapter }, select: { id: true } });
      const affectedTopicIds = payload.topicId ? [payload.topicId] : chapterTopics.map((topic) => topic.id);
      const activity = await transaction.studyActivity.create({
        data: {
          userId: session.userId,
          date,
          subjectId: payload.subjectId,
          topicId: payload.topicId,
          chapter: payload.chapter,
          kind: payload.addRevision ? "REVISION" : payload.activityKind,
          coverage: payload.markCompleted ? "FULL" : payload.coverage,
          hoursStudied: payload.hoursStudied,
          questionsDelta: payload.questionsDelta,
          intensityLevel: payload.intensityLevel,
          completionConfirmed: payload.markCompleted,
          source: "VOICE_ASSISTANT",
          notes: action.utterance,
        },
      });
      if (payload.topicId && payload.questionsDelta > 0) {
        await transaction.topic.update({ where: { id: payload.topicId }, data: { questionsSolved: { increment: payload.questionsDelta } } });
      }
      if (payload.markCompleted && affectedTopicIds.length) {
        await transaction.topic.updateMany({ where: { id: { in: affectedTopicIds } }, data: { isCompleted: true, completedAt: new Date() } });
      }
      let revisionSessionId: string | null = null;
      if (payload.addRevision) {
        const revisionSession = await transaction.revisionSession.create({
          data: { userId: session.userId, subjectId: payload.subjectId, topicId: payload.topicId, chapter: payload.chapter, coverage: payload.coverage, source: "VOICE_ASSISTANT", note: action.utterance },
        });
        revisionSessionId = revisionSession.id;
        const revisionTopicIds = payload.topicId ? [payload.topicId] : payload.coverage === "FULL" ? affectedTopicIds : [];
        if (revisionTopicIds.length) await transaction.revision.createMany({ data: revisionTopicIds.map((topicId) => ({ topicId, revisionSessionId: revisionSession.id, note: action.utterance })) });
      }
      const existingGoal = await transaction.dailyGoal.findUnique({ where: { subjectId_date: { subjectId: payload.subjectId, date } } });
      const nextHours = Math.min(24, (existingGoal?.hoursStudied ?? 0) + payload.hoursStudied);
      const nextQuestions = (existingGoal?.questionsSolved ?? 0) + payload.questionsDelta;
      const nextIntensity = Math.max(existingGoal?.intensityLevel ?? 0, payload.intensityLevel);
      await transaction.dailyGoal.upsert({
        where: { subjectId_date: { subjectId: payload.subjectId, date } },
        create: { subjectId: payload.subjectId, date, hoursStudied: nextHours, questionsSolved: nextQuestions, intensityLevel: nextIntensity, notes: action.utterance },
        update: { hoursStudied: nextHours, questionsSolved: nextQuestions, intensityLevel: nextIntensity, notes: action.utterance },
      });
      const href = `/subjects/${payload.subjectSlug}?${new URLSearchParams({ chapter: payload.chapter, ...(payload.topicName ? { topic: payload.topicName } : {}) }).toString()}`;
      const response = { actionId, kind: payload.kind, state: "DONE", reply: `Done. ${payload.topicName ?? payload.chapter} now includes the confirmed progress.`, href, label: payload.topicName ?? payload.chapter, activityId: activity.id, revisionSessionId };
      await transaction.assistantAction.update({ where: { id: action.id }, data: { status: "COMPLETED", resultJson: json(response) } });
      return response;
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The confirmed action could not be completed", state: "ERROR" }, { status: 500 });
  }
}
