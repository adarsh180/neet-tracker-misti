import { Prisma } from "@prisma/client";
import type { MissionSession, Task } from "@prisma/client";
import { db } from "@/lib/db";

const TASK_REASON_MARKER = "\n\nWhy this exists:";
const TASK_LIFECYCLE_HOURS = 24;

type TaskWithLifecycle = Pick<
  Task,
  | "id"
  | "status"
  | "source"
  | "description"
  | "createdAt"
  | "updatedAt"
  | "startedAt"
  | "completedAt"
  | "skippedAt"
>;

type MissionResponseShape = {
  title?: string;
  summary?: string;
  insights?: string[];
  dailyCommand?: {
    primaryOutcome?: string;
    questionTarget?: number | null;
    revisionTarget?: string | null;
    studyMinutes?: number | null;
    shutdownRule?: string;
  };
  taskSuggestions?: Array<{
    title?: string;
    description?: string;
    priority?: string;
    subjectSlug?: string | null;
    plannedMinutes?: number | null;
    dueDate?: string | null;
    rationale?: string;
  }>;
};

function subtractHours(date: Date, hours: number) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

export function getTaskWindowCutoff(now = new Date()) {
  return subtractHours(now, TASK_LIFECYCLE_HOURS);
}

export function buildTaskDescriptionWithReason(description: string, rationale?: string | null) {
  const cleanDescription = description.trim();
  const cleanRationale = rationale?.trim();

  if (!cleanRationale) return cleanDescription;
  return `${cleanDescription}${TASK_REASON_MARKER} ${cleanRationale}`;
}

export function stripTaskReason(description?: string | null) {
  if (!description) return null;
  const [base] = description.split(TASK_REASON_MARKER);
  return base.trim() || null;
}

export function getTaskStatusAnchor(task: TaskWithLifecycle) {
  switch (task.status) {
    case "IN_PROGRESS":
      return task.startedAt ?? task.updatedAt ?? task.createdAt;
    case "DONE":
      return task.completedAt ?? task.updatedAt ?? task.createdAt;
    case "SKIPPED":
      return task.skippedAt ?? task.updatedAt ?? task.createdAt;
    case "TODO":
    default:
      return task.createdAt;
  }
}

export function isTaskVisibleInBoard(task: TaskWithLifecycle, now = new Date()) {
  return getTaskStatusAnchor(task).getTime() >= getTaskWindowCutoff(now).getTime();
}

function buildCompactMissionMarkdown(payload: MissionResponseShape) {
  const sections = [
    `## ${payload.title || "Todo Plan"}`,
    payload.dailyCommand?.primaryOutcome || payload.summary || "Plan saved.",
  ];

  if (payload.dailyCommand) {
    sections.push(
      "## Command",
      payload.dailyCommand.questionTarget ? `- Question target: ${payload.dailyCommand.questionTarget}` : "",
      payload.dailyCommand.revisionTarget ? `- Revision target: ${payload.dailyCommand.revisionTarget}` : "",
      payload.dailyCommand.studyMinutes ? `- Study minutes: ${payload.dailyCommand.studyMinutes}` : "",
      payload.dailyCommand.shutdownRule ? `- Shutdown rule: ${payload.dailyCommand.shutdownRule}` : ""
    );
  }

  if (payload.taskSuggestions?.length) {
    sections.push(
      "## Task suggestions",
      payload.taskSuggestions.map((task) => `- **${task.title || "Task"}**: ${task.description || ""}`.trim()).join("\n")
    );
  }

  return sections.filter(Boolean).join("\n\n");
}

function scrubMissionResponse(responseJson: Prisma.JsonValue | null) {
  if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
    return { responseJson, responseMarkdown: null as string | null };
  }

  const payload = structuredClone(responseJson) as MissionResponseShape;
  payload.insights = [];
  payload.taskSuggestions = payload.taskSuggestions?.map((task) => ({
    ...task,
    rationale: "",
  }));

  return {
    responseJson: payload satisfies MissionResponseShape,
    responseMarkdown: buildCompactMissionMarkdown(payload),
  };
}

async function autoSkipExpiredTasks(now: Date) {
  const cutoff = getTaskWindowCutoff(now);
  const staleTasks = await db.task.findMany({
    where: {
      OR: [
        {
          status: "TODO",
          createdAt: { lt: cutoff },
        },
        {
          status: "IN_PROGRESS",
          startedAt: { lt: cutoff },
        },
        {
          status: "IN_PROGRESS",
          startedAt: null,
          updatedAt: { lt: cutoff },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!staleTasks.length) return;

  await db.$transaction(
    staleTasks.map((task) =>
      db.task.update({
        where: { id: task.id },
        data: {
          status: "SKIPPED",
          skippedAt: now,
          lastAgentSummary: null,
          timelineEvents: {
            create: {
              type: "SKIPPED",
              label: "Auto-skipped after 24 hours",
              detail: "No start or completion update was recorded in the last 24 hours.",
            },
          },
        },
      })
    )
  );
}

async function scrubExpiredReasons(now: Date) {
  const cutoff = getTaskWindowCutoff(now);

  const tasksToClean = await db.task.findMany({
    where: {
      source: "AI",
      createdAt: { lt: cutoff },
      description: { contains: "Why this exists:" },
    },
    select: {
      id: true,
      description: true,
    },
  });

  if (tasksToClean.length) {
    await db.$transaction(
      tasksToClean.map((task) =>
        db.task.update({
          where: { id: task.id },
          data: {
            description: stripTaskReason(task.description),
          },
        })
      )
    );
  }

  const missionsToClean = await db.missionSession.findMany({
    where: {
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      responseJson: true,
    },
  });

  if (missionsToClean.length) {
    await db.$transaction(
      missionsToClean.map((mission) => {
        const cleaned = scrubMissionResponse(mission.responseJson);
        return db.missionSession.update({
          where: { id: mission.id },
          data: {
            summary: null,
            responseJson: cleaned.responseJson ?? Prisma.JsonNull,
            responseMarkdown: cleaned.responseMarkdown ?? undefined,
          },
        });
      })
    );
  }
}

export async function clearMissionReasonsNow() {
  const tasksToClean = await db.task.findMany({
    where: {
      source: "AI",
      description: { contains: "Why this exists:" },
    },
    select: {
      id: true,
      description: true,
    },
  });

  const missionsToClean = await db.missionSession.findMany({
    select: {
      id: true,
      responseJson: true,
    },
  });

  await db.$transaction([
    ...tasksToClean.map((task) =>
      db.task.update({
        where: { id: task.id },
        data: {
          description: stripTaskReason(task.description),
        },
      })
    ),
    ...missionsToClean.map((mission) => {
      const cleaned = scrubMissionResponse(mission.responseJson);
      return db.missionSession.update({
        where: { id: mission.id },
        data: {
          summary: null,
          responseJson: cleaned.responseJson ?? Prisma.JsonNull,
          responseMarkdown: cleaned.responseMarkdown ?? undefined,
        },
      });
    }),
  ]);
}

export async function refreshTodoWorkspace(now = new Date()) {
  await autoSkipExpiredTasks(now);
  await scrubExpiredReasons(now);
}

export function getVisibleBoardTasks<T extends TaskWithLifecycle>(tasks: T[], now = new Date()) {
  return tasks.filter((task) => isTaskVisibleInBoard(task, now));
}

export function isMissionFresh(mission: Pick<MissionSession, "createdAt">, now = new Date()) {
  return mission.createdAt.getTime() >= getTaskWindowCutoff(now).getTime();
}

export function getVisibleTimelineWindow() {
  return getTaskWindowCutoff();
}
