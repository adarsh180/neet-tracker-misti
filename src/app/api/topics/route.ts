import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { createTopicRecord } from "@/lib/topic-manager";

function normalizeChapterValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

// POST — add topic, PATCH — update topic, DELETE — delete topic
export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { action, ...data } = body;

    if (action === "add_topic") {
      const topic = await createTopicRecord({
        subjectId: data.subjectId,
        name: data.name,
        chapter: data.chapter,
        classLevel: data.classLevel,
      });
      return NextResponse.json(topic);
    }

    if (action === "toggle_complete") {
      const topic = await db.topic.findUnique({ where: { id: data.topicId } });
      if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const updated = await db.topic.update({
        where: { id: data.topicId },
        data: {
          isCompleted: !topic.isCompleted,
          completedAt: !topic.isCompleted ? new Date() : null,
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "update_questions") {
      const count = Math.max(0, Math.min(100000, Math.round(Number(data.count) || 0)));
      const updated = await db.topic.update({
        where: { id: data.topicId },
        data: { questionsSolved: count },
      });
      return NextResponse.json(updated);
    }

    if (action === "add_revision") {
      const topic = await db.topic.findUnique({ where: { id: data.topicId }, select: { id: true, subjectId: true, chapter: true, name: true } });
      if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const revision = await db.$transaction(async (transaction) => {
        const session = await transaction.revisionSession.create({
          data: {
            subjectId: topic.subjectId,
            topicId: topic.id,
            chapter: topic.chapter ?? topic.name,
            coverage: "FULL",
            source: "MANUAL",
            note: data.note || null,
          },
        });
        return transaction.revision.create({
          data: { topicId: topic.id, revisionSessionId: session.id, note: data.note || null },
        });
      });
      return NextResponse.json(revision);
    }

    if (action === "delete_topic") {
      await db.topic.delete({ where: { id: data.topicId } });
      return NextResponse.json({ success: true });
    }

    if (action === "rename_chapter") {
      const chapterName = normalizeChapterValue(data.chapterName);
      const nextChapterName = normalizeChapterValue(data.nextChapterName);
      if (!data.subjectId || !nextChapterName) {
        return NextResponse.json({ error: "subjectId, chapterName and nextChapterName are required" }, { status: 400 });
      }

      await db.topic.updateMany({
        where: {
          subjectId: data.subjectId,
          chapter: chapterName === null ? null : chapterName,
        },
        data: {
          chapter: nextChapterName,
        },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "delete_chapter") {
      const chapterName = normalizeChapterValue(data.chapterName);
      if (!data.subjectId) {
        return NextResponse.json({ error: "subjectId and chapterName are required" }, { status: 400 });
      }

      await db.topic.deleteMany({
        where: {
          subjectId: data.subjectId,
          chapter: chapterName === null ? null : chapterName,
        },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "reorder_topics") {
      const items = Array.isArray(data.items) ? data.items : [];
      await db.$transaction(
        items.map((item: { topicId: string; topicOrder: number }) =>
          db.topic.update({
            where: { id: item.topicId },
            data: { topicOrder: item.topicOrder },
          })
        )
      );
      return NextResponse.json({ success: true });
    }

    if (action === "reorder_chapters") {
      const items = Array.isArray(data.items) ? data.items : [];
      await db.$transaction(
        items.flatMap((item: { subjectId: string; chapter: string; chapterOrder: number }) => [
          db.topic.updateMany({
            where: {
              subjectId: item.subjectId,
              chapter: item.chapter,
            },
            data: {
              chapterOrder: item.chapterOrder,
            },
          }),
        ])
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
