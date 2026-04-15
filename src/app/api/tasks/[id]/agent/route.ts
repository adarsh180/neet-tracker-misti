import { NextRequest, NextResponse } from "next/server";
import type { TaskAgentTrigger } from "@prisma/client";
import { db } from "@/lib/db";
import { generateTaskAgentResponse } from "@/lib/task-agent";
import { summarizeTaskRun } from "@/lib/tasks";
import { refreshTodoWorkspace } from "@/lib/todo-workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await refreshTodoWorkspace();
    const { id } = await params;
    const body = await req.json();
    const { trigger = "MANUAL", userNote } = body as {
      trigger?: TaskAgentTrigger;
      userNote?: string;
    };

    const task = await db.task.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true, slug: true, color: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const result = await generateTaskAgentResponse(task, trigger, userNote);

    const run = await db.taskAgentRun.create({
      data: {
        taskId: id,
        trigger,
        status: "SUCCESS",
        prompt: result.prompt,
        response: result.response,
        model: result.model,
      },
    });

    await db.task.update({
      where: { id },
      data: {
        lastAgentSummary: summarizeTaskRun({ trigger, response: result.response }),
        timelineEvents: {
          create: {
            type: "AI_TRIGGERED",
            label: `AI ${trigger.toLowerCase()} assist`,
            detail: summarizeTaskRun({ trigger, response: result.response }),
          },
        },
      },
    });

    return NextResponse.json({
      run,
      response: result.response,
      model: result.model,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
