import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfLocalDay } from "@/lib/tasks";
import { getTaskWindowCutoff, getVisibleBoardTasks, refreshTodoWorkspace } from "@/lib/todo-workspace";

export async function GET() {
  try {
    await refreshTodoWorkspace();
    const cutoff = getTaskWindowCutoff();
    const tasks = await db.task.findMany({
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
      orderBy: [{ orderIndex: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(getVisibleBoardTasks(tasks));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      priority = "MEDIUM",
      subjectId,
      dueDate,
      plannedMinutes,
      aiAssistEnabled = true,
    } = body as {
      title?: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      subjectId?: string | null;
      dueDate?: string | null;
      plannedMinutes?: number | null;
      aiAssistEnabled?: boolean;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const lastTask = await db.task.findFirst({
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });

    const task = await db.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority,
        subjectId: subjectId || null,
        dueDate: startOfLocalDay(dueDate),
        plannedMinutes: plannedMinutes ?? null,
        aiAssistEnabled,
        orderIndex: (lastTask?.orderIndex ?? -1) + 1,
        timelineEvents: {
          create: {
            type: "CREATED",
            label: "Task created",
            detail: "Added to the task board",
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

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
