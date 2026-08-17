import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import {
  findAssistantEntity,
  detectAssistantPersona,
  parseSiteAssistantIntent,
  type AssistantEntityCandidate,
} from "@/lib/site-assistant";

export const runtime = "nodejs";

type ChapterValue = {
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
  chapter: string;
  classLevel: string | null;
};

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function topicHref(subjectSlug: string, chapter: string, topic?: string) {
  const params = new URLSearchParams({ chapter });
  if (topic) params.set("topic", topic);
  return `/subjects/${subjectSlug}?${params.toString()}`;
}

function responseWithStatus(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

async function getDirectory() {
  return db.subject.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      topics: {
        select: { id: true, name: true, chapter: true, chapterOrder: true, classLevel: true, topicOrder: true },
        orderBy: [{ chapterOrder: "asc" }, { topicOrder: "asc" }],
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  const session = await getPrivateSession();
  if (!session) return responseWithStatus({ error: "Private session required" }, 401);

  try {
    const body = await request.json();
    const utterance = typeof body.utterance === "string" ? body.utterance.trim().slice(0, 500) : "";
    const requestId = typeof body.requestId === "string" ? body.requestId.trim().slice(0, 100) : "";
    if (!utterance || requestId.length < 8) return responseWithStatus({ error: "utterance and a valid requestId are required" }, 400);

    const previous = await db.assistantAction.findUnique({ where: { requestId } });
    if (previous) {
      if (previous.userId !== session.userId) return responseWithStatus({ error: "Request ID is already in use" }, 409);
      return responseWithStatus({ ...(previous.resultJson as Record<string, unknown>), replayed: true });
    }

    const intent = parseSiteAssistantIntent(utterance);
    const preference = await db.voiceAssistantPreference.findUnique({ where: { userId: session.userId } });
    const nickname = preference?.discreetMode ? "Misti" : (preference?.nickname || "Bubu");
    const detectedPersona = detectAssistantPersona(utterance, nickname);
    const requestedTone = body.assistantTone === "MENTOR" ? "MENTOR" : body.assistantTone === "BUDDY" ? "BUDDY" : "WARM";
    const persona = detectedPersona.wakeName ? detectedPersona : requestedTone === "MENTOR"
      ? { wakeName: "mentor" as const, mode: "MENTOR" as const, replyName: "Misti", acknowledgement: "Absolutely, Misti" }
      : requestedTone === "BUDDY"
        ? { wakeName: "buddy" as const, mode: "WARM" as const, replyName: nickname, acknowledgement: `You got it, ${nickname}` }
        : { wakeName: null, mode: "WARM" as const, replyName: "my love", acknowledgement: "Of course, my love" };
    const acknowledgement = preference?.discreetMode ? "Certainly, Misti" : persona.acknowledgement;
    const vocative = preference?.discreetMode ? "Misti" : persona.replyName;

    if (intent.kind === "NAVIGATE") {
      return responseWithStatus({
        kind: intent.kind,
        reply: `${acknowledgement}. Opening ${intent.label}.`,
        href: intent.href,
        label: intent.label,
        state: "DONE",
      });
    }

    const directory = await getDirectory();
    if (intent.kind === "SEARCH") {
      const candidates = directory.flatMap((subject) => [
        { id: `subject:${subject.id}`, label: subject.name, value: { href: `/subjects/${subject.slug}`, label: subject.name } },
        ...subject.topics.flatMap((topic) => [
          ...(topic.chapter ? [{ id: `chapter:${subject.id}:${topic.chapter}`, label: topic.chapter, value: { href: topicHref(subject.slug, topic.chapter), label: topic.chapter } }] : []),
          { id: `topic:${topic.id}`, label: topic.name, value: { href: topicHref(subject.slug, topic.chapter ?? topic.name, topic.name), label: topic.name } },
        ]),
      ]);
      const deduped = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
      const resolved = findAssistantEntity(intent.query, deduped);
      if (resolved.match) {
        return responseWithStatus({
          kind: "NAVIGATE",
          reply: `${acknowledgement}. I found ${resolved.match.value.label} and I’m opening it now.`,
          ...resolved.match.value,
          state: "DONE",
        });
      }
      return responseWithStatus({
        kind: "SEARCH",
        reply: resolved.alternatives.length ? `${vocative}, I found a few close matches. Please choose one.` : `${vocative}, I could not find that in the syllabus.`,
        query: intent.query,
        choices: resolved.alternatives.map((candidate) => ({ ...candidate.value })),
        state: resolved.alternatives.length ? "NEEDS_CONFIRMATION" : "ERROR",
      });
    }

    if (intent.kind === "UNKNOWN") {
      return responseWithStatus({
        kind: intent.kind,
        reply: `${intent.reason} Try “open Daily Goals” or “create Torque topic in Rotational Motion.”`,
        state: "ERROR",
      }, 422);
    }
    if (intent.topicName.length > 120) {
      return responseWithStatus({
        kind: intent.kind,
        reply: `${vocative}, that topic name is too long. Please keep it under 120 characters.`,
        state: "ERROR",
      }, 422);
    }

    const filteredDirectory = intent.subjectHint
      ? directory.filter((subject) => subject.slug === intent.subjectHint || subject.name.toLowerCase() === intent.subjectHint)
      : directory;
    const chapterCandidates: AssistantEntityCandidate<ChapterValue>[] = [];
    const chapterKeys = new Set<string>();
    for (const subject of filteredDirectory) {
      for (const topic of subject.topics) {
        if (!topic.chapter) continue;
        const key = `${subject.id}:${topic.chapter.toLowerCase()}`;
        if (chapterKeys.has(key)) continue;
        chapterKeys.add(key);
        chapterCandidates.push({
          id: key,
          label: topic.chapter,
          value: {
            subjectId: subject.id,
            subjectSlug: subject.slug,
            subjectName: subject.name,
            chapter: topic.chapter,
            classLevel: topic.classLevel,
          },
        });
      }
    }

    const chapterMatch = findAssistantEntity(intent.chapterName, chapterCandidates);
    if (!chapterMatch.match) {
      return responseWithStatus({
        kind: intent.kind,
        reply: chapterMatch.alternatives.length
          ? `${vocative}, I found more than one possible chapter. Choose the right one before I add anything.`
          : `${vocative}, I could not safely match “${intent.chapterName}” to an existing chapter, so I did not create anything.`,
        state: chapterMatch.alternatives.length ? "NEEDS_CONFIRMATION" : "ERROR",
        choices: chapterMatch.alternatives.map((candidate) => ({
          label: `${candidate.value.chapter} · ${candidate.value.subjectName}`,
          utterance: `create ${intent.topicName} topic in ${candidate.value.chapter} in ${candidate.value.subjectSlug}`,
        })),
      }, chapterMatch.alternatives.length ? 200 : 422);
    }

    const chapter = chapterMatch.match.value;
    const result = await db.$transaction(async (transaction) => {
      const existingTopics = await transaction.topic.findMany({
        where: { subjectId: chapter.subjectId, chapter: chapter.chapter },
        orderBy: { topicOrder: "asc" },
      });
      const normalizedRequested = intent.topicName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const existing = existingTopics.find((topic) => topic.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedRequested);
      const topic = existing ?? await transaction.topic.create({
        data: {
          subjectId: chapter.subjectId,
          name: intent.topicName,
          chapter: chapter.chapter,
          classLevel: chapter.classLevel,
          chapterOrder: existingTopics[0]?.chapterOrder ?? 0,
          topicOrder: (existingTopics.at(-1)?.topicOrder ?? -1) + 1,
        },
      });
      const actionId = randomUUID();
      const actionResult = {
        actionId,
        kind: intent.kind,
        reply: existing
          ? `${acknowledgement}. ${intent.topicName} is already inside ${chapter.chapter}, so I’ll open it for you.`
          : `${acknowledgement}. Done — ${intent.topicName} is now inside ${chapter.chapter}.`,
        href: topicHref(chapter.subjectSlug, chapter.chapter, topic.name),
        label: topic.name,
        state: "DONE",
        created: !existing,
        canUndo: !existing,
        topicId: topic.id,
      };
      await transaction.assistantAction.create({
        data: {
          id: actionId,
          requestId,
          userId: session.userId,
          kind: intent.kind,
          utterance,
          payloadJson: jsonValue(intent),
          resultJson: jsonValue(actionResult),
          status: existing ? "NOOP" : "COMPLETED",
        },
      });
      return actionResult;
    });

    return responseWithStatus(result);
  } catch (error) {
    console.error("[assistant/command]", error);
    return responseWithStatus({ error: "The assistant could not complete that safely. Nothing uncertain was changed." }, 500);
  }
}
