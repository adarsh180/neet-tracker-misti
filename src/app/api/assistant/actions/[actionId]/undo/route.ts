import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ actionId: string }> },
) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Private session required" }, { status: 401 });

  const { actionId } = await context.params;
  const action = await db.assistantAction.findUnique({ where: { id: actionId } });
  if (!action || action.userId !== session.userId) return NextResponse.json({ error: "Action not found" }, { status: 404 });
  if (action.status === "UNDONE") return NextResponse.json({ success: true, alreadyUndone: true });
  if (!["CREATE_TOPIC", "CREATE_CHAPTER"].includes(action.kind) || action.status !== "COMPLETED") {
    return NextResponse.json({ error: "This action cannot be undone" }, { status: 409 });
  }

  const result = action.resultJson as { topicId?: string; created?: boolean } | null;
  if (!result?.created || !result.topicId) return NextResponse.json({ error: "No untouched created item to undo" }, { status: 409 });
  const topic = await db.topic.findUnique({
    where: { id: result.topicId },
    select: {
      id: true,
      isCompleted: true,
      questionsSolved: true,
      _count: { select: { revisions: true, studyActivities: true, revisionSessions: true } },
    },
  });
  if (!topic) {
    await db.assistantAction.update({
      where: { id: action.id },
      data: {
        status: "UNDONE",
        undoneAt: new Date(),
        resultJson: { ...(result ?? {}), canUndo: false, href: null, undone: true, reply: "This action was already undone." } as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ success: true, alreadyRemoved: true });
  }
  const touched = topic.isCompleted || topic.questionsSolved > 0 || Object.values(topic._count).some((count) => count > 0);
  if (touched) {
    return NextResponse.json({ error: "This topic now contains progress, so it was kept safe and cannot be removed automatically." }, { status: 409 });
  }

  await db.$transaction([
    db.topic.delete({ where: { id: topic.id } }),
    db.assistantAction.update({
      where: { id: action.id },
      data: {
        status: "UNDONE",
        undoneAt: new Date(),
        resultJson: { ...(result ?? {}), canUndo: false, href: null, undone: true, reply: "This action was undone." } as Prisma.InputJsonValue,
      },
    }),
  ]);
  return NextResponse.json({ success: true });
}
