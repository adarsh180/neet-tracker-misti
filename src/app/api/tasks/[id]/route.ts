import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfLocalDay } from "@/lib/tasks";
import { stripTaskReason } from "@/lib/todo-workspace";
import { getTaskWindowCutoff } from "@/lib/todo-workspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cutoff = getTaskWindowCutoff();
    const { id } = await params;
    const body = await req.json();
    const {
      title,
      description,
      priority,
      subjectId,
      dueDate,
      plannedMinutes,
      actualMinutes,
      aiAssistEnabled,
      removeAiReason,
    } = body as {
      title?: string;
      description?: string | null;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      subjectId?: string | null;
      dueDate?: string | null;
      plannedMinutes?: number | null;
      actualMinutes?: number | null;
      aiAssistEnabled?: boolean;
      removeAiReason?: boolean;
    };
    const currentTask = removeAiReason
      ? await db.task.findUnique({ where: { id }, select: { description: true } })
      : null;

    const task = await db.task.update({
      where: { id },
      data: {
        title: title === undefined ? undefined : title.trim(),
        description:
          removeAiReason
            ? stripTaskReason(currentTask?.description)
            : description === undefined
            ? undefined
            : description === null
              ? null
              : description.trim() || null,
        priority,
        subjectId: subjectId === undefined ? undefined : subjectId || null,
        dueDate: dueDate === undefined ? undefined : startOfLocalDay(dueDate),
        plannedMinutes: plannedMinutes === undefined ? undefined : plannedMinutes,
        actualMinutes: actualMinutes === undefined ? undefined : actualMinutes,
        aiAssistEnabled,
        timelineEvents: {
          create: {
            type: "UPDATED",
            label: "Task updated",
            detail: "Task details were refined",
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
          where: { createdAt: { gte: cutoff } },
          orderBy: { createdAt: "desc" },
          take: 6,
        },
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
