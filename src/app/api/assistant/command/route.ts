import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { CHAPTERS, canonicalizeChapter, normalizeKey } from "@/data/syllabus/neet-chapters";
import { resolveStudyMatch } from "@/lib/study-activity";
import { findLikelyDuplicateTopic } from "@/lib/topic-manager";
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
        select: { id: true, name: true, chapter: true, chapterOrder: true, classLevel: true, topicOrder: true, questionsSolved: true, isCompleted: true },
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
    if (intent.kind === "CREATE_TASK") {
      const subject = intent.subjectHint ? directory.find((entry) => entry.slug === intent.subjectHint) ?? null : null;
      const actionId = randomUUID();
      const dueLabel = intent.due === "TOMORROW" ? " for tomorrow" : intent.due === "TODAY" ? " for today" : "";
      const durationLabel = intent.plannedMinutes ? ` (${intent.plannedMinutes} minutes)` : "";
      const pending = {
        actionId,
        kind: intent.kind,
        reply: `${vocative}, I’m ready to add “${intent.title}”${dueLabel}${durationLabel} to Todo. Say yes to confirm or no to cancel.`,
        label: intent.title,
        state: "NEEDS_CONFIRMATION",
        confirmationRequired: true,
      };
      await db.assistantAction.create({
        data: { id: actionId, requestId, userId: session.userId, kind: intent.kind, utterance, payloadJson: jsonValue({ ...intent, subjectId: subject?.id ?? null }), resultJson: jsonValue(pending), status: "PENDING" },
      });
      return responseWithStatus(pending);
    }

    if (intent.kind === "UPDATE_STUDY") {
      const eligible = intent.subjectHint ? directory.filter((subject) => subject.slug === intent.subjectHint) : directory;
      const matches = eligible.map((subject) => ({ subject, match: resolveStudyMatch(intent.query, subject.topics) }))
        .filter((entry): entry is typeof entry & { match: NonNullable<typeof entry.match> } => Boolean(entry.match))
        .sort((left, right) => right.match.confidence - left.match.confidence);
      const best = matches[0];
      const runnerUp = matches[1];
      if (!best || best.match.confidence < 0.72 || (runnerUp && best.match.confidence - runnerUp.match.confidence < 0.08)) {
        return responseWithStatus({
          kind: intent.kind,
          reply: `${vocative}, I could not match that chapter or topic with enough certainty, so nothing was changed. Please include the subject and exact chapter or topic name.`,
          state: "ERROR",
          choices: matches.slice(0, 3).map((entry) => ({ label: `${entry.match.topicName ?? entry.match.chapter} · ${entry.subject.name}`, utterance: `open ${entry.match.topicName ?? entry.match.chapter} in ${entry.subject.name}` })),
        }, 422);
      }
      const actionId = randomUUID();
      const changeLabels = [
        intent.hoursStudied ? `${intent.hoursStudied} study hours` : null,
        intent.questionsDelta ? `${intent.questionsDelta} questions` : null,
        intent.addRevision ? "one revision" : null,
        intent.markCompleted ? "completed status" : null,
      ].filter(Boolean);
      const pendingPayload = { ...intent, subjectId: best.subject.id, subjectSlug: best.subject.slug, subjectName: best.subject.name, topicId: best.match.topicId, topicName: best.match.topicName, chapter: best.match.chapter };
      const pending = {
        actionId,
        kind: intent.kind,
        reply: `${vocative}, I matched ${best.match.topicName ?? best.match.chapter} in ${best.subject.name}. I will record ${changeLabels.join(", ") || "this study activity"}. Say yes to confirm or no to cancel.`,
        label: best.match.topicName ?? best.match.chapter,
        state: "NEEDS_CONFIRMATION",
        confirmationRequired: true,
      };
      await db.assistantAction.create({
        data: { id: actionId, requestId, userId: session.userId, kind: intent.kind, utterance, payloadJson: jsonValue(pendingPayload), resultJson: jsonValue(pending), status: "PENDING" },
      });
      return responseWithStatus(pending);
    }

    if (intent.kind === "SEARCH") {
      const candidates = directory.flatMap((subject) => [
        { id: `subject:${subject.id}`, label: subject.name, value: { href: `/subjects/${subject.slug}`, label: subject.name } },
        ...subject.topics.flatMap((topic) => [
          ...(topic.chapter ? [{ id: `chapter:${subject.id}:${topic.chapter}`, label: topic.chapter, value: { href: topicHref(subject.slug, topic.chapter), label: topic.chapter } }] : []),
          { id: `topic:${topic.id}`, label: topic.name, value: { href: topicHref(subject.slug, topic.chapter ?? topic.name, topic.name), label: topic.name } },
        ]),
      ]).concat(
        CHAPTERS.flatMap((entry) => [entry.chapter, ...entry.aliases].map((label, index) => ({
          id: `syllabus:${entry.slug}:${entry.classLevel}:${entry.chapter}:${index}`,
          label,
          value: { href: topicHref(entry.slug, entry.chapter), label: entry.chapter },
        }))),
        [
          { id: "biology:botany", label: "Biology", value: { href: "/subjects/botany", label: "Botany" } },
          { id: "biology:zoology", label: "Biology", value: { href: "/subjects/zoology", label: "Zoology" } },
        ],
      );
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
        choices: [...new Map(resolved.alternatives.map((candidate) => [candidate.value.href, candidate.value])).values()],
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

    if (intent.kind === "CREATE_CHAPTER") {
      if (intent.chapterName.length > 120 || (intent.firstTopicName?.length ?? 0) > 120) {
        return responseWithStatus({ kind: intent.kind, reply: `${vocative}, keep chapter and topic names under 120 characters.`, state: "ERROR" }, 422);
      }
      if (!intent.subjectHint) {
        return responseWithStatus({
          kind: intent.kind,
          reply: `${vocative}, tell me the subject too — Physics, Chemistry, Botany, or Zoology. Nothing was changed.`,
          state: "ERROR",
        }, 422);
      }
      const subject = directory.find((entry) => entry.slug === intent.subjectHint);
      if (!subject) return responseWithStatus({ kind: intent.kind, reply: `${vocative}, I could not verify that subject. Nothing was changed.`, state: "ERROR" }, 422);

      const official = canonicalizeChapter(subject.name, intent.chapterName);
      const existingChapter = [...new Set(subject.topics.map((topic) => topic.chapter).filter((chapter): chapter is string => Boolean(chapter)))]
        .find((chapter) => normalizeKey(chapter) === normalizeKey(intent.chapterName));
      const knownChapter = existingChapter ?? official?.chapter ?? null;
      if (knownChapter) {
        const result = {
          kind: intent.kind,
          reply: `${acknowledgement}. ${knownChapter} already exists in ${subject.name}, so I did not create a duplicate. I’ll open it for you.`,
          href: topicHref(subject.slug, knownChapter),
          label: knownChapter,
          state: "DONE",
          created: false,
          canUndo: false,
        };
        await db.assistantAction.create({
          data: { id: randomUUID(), requestId, userId: session.userId, kind: intent.kind, utterance, payloadJson: jsonValue(intent), resultJson: jsonValue(result), status: "NOOP" },
        });
        return responseWithStatus(result);
      }
      if (!intent.classLevel || !intent.firstTopicName) {
        return responseWithStatus({
          kind: intent.kind,
          reply: `${vocative}, this is a new custom chapter. Say its class and first topic, for example: “create chapter Experimental Mechanics in Physics class 11 with topic Lab Measurements.” Nothing was changed.`,
          state: "ERROR",
        }, 422);
      }

      const actionId = randomUUID();
      const payload = {
        ...intent,
        subjectId: subject.id,
        subjectSlug: subject.slug,
        subjectName: subject.name,
      };
      const pending = {
        actionId,
        kind: intent.kind,
        reply: `${vocative}, “${intent.chapterName}” does not exist in ${subject.name}. I’m ready to create it for Class ${intent.classLevel} with “${intent.firstTopicName}” as its first topic. Say yes to confirm or no to cancel.`,
        label: intent.chapterName,
        state: "NEEDS_CONFIRMATION",
        confirmationRequired: true,
      };
      await db.assistantAction.create({
        data: { id: actionId, requestId, userId: session.userId, kind: intent.kind, utterance, payloadJson: jsonValue(payload), resultJson: jsonValue(pending), status: "PENDING" },
      });
      return responseWithStatus(pending);
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
    const chapterAliasKeys = new Set<string>();
    for (const subject of filteredDirectory) {
      for (const topic of subject.topics) {
        if (!topic.chapter) continue;
        const key = `${subject.id}:${topic.chapter.toLowerCase()}`;
        if (chapterKeys.has(key)) continue;
        chapterKeys.add(key);
        chapterAliasKeys.add(`${subject.id}:${normalizeKey(topic.chapter)}`);
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
      for (const official of CHAPTERS.filter((entry) => entry.slug === subject.slug && (!intent.classLevel || entry.classLevel === intent.classLevel))) {
        for (const [index, label] of [official.chapter, ...official.aliases].entries()) {
          const aliasKey = `${subject.id}:${normalizeKey(label)}`;
          if (chapterAliasKeys.has(aliasKey)) continue;
          chapterAliasKeys.add(aliasKey);
          chapterCandidates.push({
            id: `official:${subject.id}:${official.classLevel}:${official.chapter}:${index}`,
            label,
            value: {
              subjectId: subject.id,
              subjectSlug: subject.slug,
              subjectName: subject.name,
              chapter: official.chapter,
              classLevel: official.classLevel,
            },
          });
        }
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
    const existingTopics = await db.topic.findMany({
      where: { subjectId: chapter.subjectId, chapter: chapter.chapter },
      orderBy: { topicOrder: "asc" },
    });
    const existing = findLikelyDuplicateTopic(intent.topicName, existingTopics);
    if (existing) {
      const actionId = randomUUID();
      const result = {
        actionId,
        kind: intent.kind,
        reply: `${acknowledgement}. “${existing.name}” already exists inside ${chapter.chapter}, so I did not create a duplicate. I’ll open it for you.`,
        href: topicHref(chapter.subjectSlug, chapter.chapter, existing.name),
        label: existing.name,
        state: "DONE",
        created: false,
        canUndo: false,
        topicId: existing.id,
      };
      await db.assistantAction.create({
        data: { id: actionId, requestId, userId: session.userId, kind: intent.kind, utterance, payloadJson: jsonValue(intent), resultJson: jsonValue(result), status: "NOOP" },
      });
      return responseWithStatus(result);
    }

    const actionId = randomUUID();
    const payload = { ...intent, ...chapter };
    const pending = {
      actionId,
      kind: intent.kind,
      reply: `${vocative}, “${intent.topicName}” is not in ${chapter.chapter}. Say yes to create it in ${chapter.subjectName}, or no to cancel.`,
      label: intent.topicName,
      state: "NEEDS_CONFIRMATION",
      confirmationRequired: true,
    };
    await db.assistantAction.create({
      data: { id: actionId, requestId, userId: session.userId, kind: intent.kind, utterance, payloadJson: jsonValue(payload), resultJson: jsonValue(pending), status: "PENDING" },
    });
    return responseWithStatus(pending);
  } catch (error) {
    console.error("[assistant/command]", error);
    return responseWithStatus({ error: "The assistant could not complete that safely. Nothing uncertain was changed." }, 500);
  }
}
