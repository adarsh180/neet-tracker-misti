import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { startOfLocalDay } from "@/lib/tasks";
import { getTaskWindowCutoff, getVisibleBoardTasks } from "@/lib/todo-workspace";

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
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
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

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
      source,
    } = body as {
      title?: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      subjectId?: string | null;
      dueDate?: string | null;
      plannedMinutes?: number | null;
      aiAssistEnabled?: boolean;
      source?: "MANUAL" | "VOICE_ASSISTANT";
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
        source: source === "VOICE_ASSISTANT" ? "VOICE_ASSISTANT" : "MANUAL",
        orderIndex: (lastTask?.orderIndex ?? -1) + 1,
        timelineEvents: {
          create: {
            type: "CREATED",
            label: source === "VOICE_ASSISTANT" ? "Added from Bubu’s suggestion" : "Task created",
            detail: source === "VOICE_ASSISTANT" ? "Approved after the Daily Goals review" : "Added to the task board",
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
