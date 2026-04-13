import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST — add topic, PATCH — update topic, DELETE — delete topic
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...data } = body;

    if (action === "add_topic") {
      const topic = await db.topic.create({
        data: {
          subjectId: data.subjectId,
          name: data.name,
          chapter: data.chapter,
          classLevel: data.classLevel,
        },
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
      const updated = await db.topic.update({
        where: { id: data.topicId },
        data: { questionsSolved: data.count },
      });
      return NextResponse.json(updated);
    }

    if (action === "add_revision") {
      const revision = await db.revision.create({
        data: {
          topicId: data.topicId,
          note: data.note || null,
        },
      });
      return NextResponse.json(revision);
    }

    if (action === "delete_topic") {
      await db.topic.delete({ where: { id: data.topicId } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
