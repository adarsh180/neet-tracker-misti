import type { TaskAgentRun, TaskPriority, TaskStatus, TaskTimelineEvent } from "@prisma/client";

export const TASK_STATUS_ORDER: TaskStatus[] = ["IN_PROGRESS", "TODO", "DONE", "SKIPPED"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  SKIPPED: "Skipped",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export function startOfLocalDay(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function toIsoDate(value?: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function summarizeTaskRun(run: Pick<TaskAgentRun, "trigger" | "response">) {
  const headline = run.response
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return headline?.slice(0, 220) || `${run.trigger} guidance generated`;
}

export function buildTaskTimelineSummary(events: Pick<TaskTimelineEvent, "label" | "detail" | "createdAt">[]) {
  return events
    .slice(0, 6)
    .map((event) => ({
      label: event.label,
      detail: event.detail,
      createdAt: event.createdAt,
    }));
}
