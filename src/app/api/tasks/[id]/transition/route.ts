import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { TaskStatus, TaskTimelineEventType } from "@prisma/client";
import { getTaskWindowCutoff } from "@/lib/todo-workspace";

const STATUS_EVENT_MAP: Record<TaskStatus, { type: TaskTimelineEventType; label: string }> = {
  TODO: { type: "UPDATED", label: "Moved back to to-do" },
  IN_PROGRESS: { type: "STARTED", label: "Task started" },
  DONE: { type: "COMPLETED", label: "Task completed" },
  SKIPPED: { type: "SKIPPED", label: "Task skipped" },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cutoff = getTaskWindowCutoff();
    const { id } = await params;
    const body = await req.json();
    const { status, actualMinutes, note } = body as {
      status?: TaskStatus;
      actualMinutes?: number | null;
      note?: string;
    };

    if (!status || !(status in STATUS_EVENT_MAP)) {
      return NextResponse.json({ error: "Valid status is required" }, { status: 400 });
    }

    const now = new Date();
    const data = {
      status,
      actualMinutes: actualMinutes ?? undefined,
      startedAt: status === "IN_PROGRESS" ? now : undefined,
      completedAt: status === "DONE" ? now : status === "TODO" ? null : undefined,
      skippedAt: status === "SKIPPED" ? now : status === "TODO" ? null : undefined,
      timelineEvents: {
        create: {
          type: STATUS_EVENT_MAP[status].type,
          label: STATUS_EVENT_MAP[status].label,
          detail: note?.trim() || null,
        },
      },
    } satisfies Parameters<typeof db.task.update>[0]["data"];

    const task = await db.task.update({
      where: { id },
      data,
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
