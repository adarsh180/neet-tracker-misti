import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfLocalDay } from "@/lib/tasks";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    } = body as {
      title?: string;
      description?: string | null;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      subjectId?: string | null;
      dueDate?: string | null;
      plannedMinutes?: number | null;
      actualMinutes?: number | null;
      aiAssistEnabled?: boolean;
    };

    const task = await db.task.update({
      where: { id },
      data: {
        title: title === undefined ? undefined : title.trim(),
        description:
          description === undefined
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
