import { parseTasks, type Task } from "./contracts";
export const screenFields = [
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["youtube", "YouTube · leisure"],
  ["youtubeStudy", "YouTube · study"],
  ["facebook", "Facebook"],
  ["netflix", "Netflix"],
  ["hotstar", "Hotstar"],
  ["mxPlayer", "MX Player"],
  ["google", "Google"],
  ["other", "Other"],
] as const;
export type ScreenKey = (typeof screenFields)[number][0];
export type Entry = {
  subjectId: string;
  updatedAt: string;
  hoursStudied: number;
  questionsSolved: number;
  intensityLevel: number;
  disciplineScore: number;
  completionPercent: number;
  notes: string | null;
};
export type ScreenRecord = Record<ScreenKey, number> & {
  updatedAt: string;
  note: string | null;
};
export type DayRecord = {
  date: string;
  entries: Entry[];
  screen: ScreenRecord | null;
};
export type TaskFields = {
  id: string | null;
  expectedUpdatedAt: string | null;
  title: string;
  description: string | null;
  priority: string;
  subjectId: string | null;
  dueDate: string | null;
  plannedMinutes: number | null;
};
export type DayWrite = {
  kind: "day";
  operationId: string;
  date: string;
  entries: (Omit<Entry, "updatedAt"> & { expectedUpdatedAt: string | null })[];
  screen:
    | (Omit<ScreenRecord, "updatedAt"> & { expectedUpdatedAt: string | null })
    | null;
};
export type TaskWrite = { kind: "task"; operationId: string; task: TaskFields };
export type Write = DayWrite | TaskWrite;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function dateKey(value: string) {
  if (
    !/^20\d{2}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error("Use a valid date like 2026-09-07.");
  return value;
}
export function todayKey() {
  // Same India calendar as the private website, even when a device travels.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function numeric(value: string, max: number, integer = false) {
  const clean = value.trim();
  if (clean && !/^\d+(\.\d+)?$/.test(clean))
    throw new Error("Use numbers only, without units or commas.");
  const n = clean ? Number(clean) : 0;
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new Error(
      `Use ${integer ? "whole numbers" : "a number"} from 0 to ${max}.`,
    );
  return n;
}
function stamp(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-.+Z$/.test(v) &&
    Number.isFinite(Date.parse(v))
  );
}
function bounded(v: unknown, max: number, integer = false) {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= max &&
    (!integer || Number.isInteger(v))
  );
}
const nullableText = (v: unknown) => v === null || typeof v === "string";
export function parseDay(value: unknown, date: string): DayRecord {
  if (
    !record(value) ||
    value.date !== date ||
    !Array.isArray(value.entries) ||
    !value.entries.every(
      (e) =>
        record(e) &&
        typeof e.subjectId === "string" &&
        stamp(e.updatedAt) &&
        bounded(e.hoursStudied, 24) &&
        bounded(e.questionsSolved, 2147483647, true) &&
        bounded(e.intensityLevel, 5, true) &&
        bounded(e.disciplineScore, 100, true) &&
        bounded(e.completionPercent, 100, true) &&
        nullableText(e.notes),
    ) ||
    new Set(value.entries.map((e) => e.subjectId)).size !==
      value.entries.length ||
    !(
      value.screen === null ||
      (record(value.screen) &&
        stamp(value.screen.updatedAt) &&
        nullableText(value.screen.note) &&
        screenFields.every(([key]) =>
          bounded((value.screen as Record<string, unknown>)[key], 24),
        ))
    )
  )
    throw new Error(
      "Your saved day could not be read. Reload before editing; no records were reset.",
    );
  return value as DayRecord;
}
export function editableTask(value: unknown): Task {
  const [task] = parseTasks([value]);
  if (
    !stamp(task.updatedAt) ||
    !nullableText(task.description) ||
    !nullableText(task.subjectId)
  )
    throw new Error("Reload the board before editing this task.");
  return task;
}
export function parseWriteReceipt(
  value: unknown,
  write: Write,
): DayRecord | Task {
  if (
    !record(value) ||
    value.operationId !== write.operationId ||
    value.kind !== write.kind
  )
    throw new Error(
      "Save receipt did not match. Keep this draft and retry the same save.",
    );
  if (write.kind === "task") {
    const task = editableTask(value.result),
      expected = write.task;
    if (
      (expected.id && task.id !== expected.id) ||
      task.title !== expected.title ||
      task.description !== expected.description ||
      task.subjectId !== expected.subjectId ||
      (task.dueDate?.slice(0, 10) ?? null) !== expected.dueDate ||
      task.priority !== expected.priority ||
      task.plannedMinutes !== expected.plannedMinutes
    )
      throw new Error(
        "Task receipt did not match your edit. Keep this draft and retry.",
      );
    return task;
  }
  const day = parseDay(value.result, write.date);
  for (const entry of write.entries) {
    const actual = day.entries.find((e) => e.subjectId === entry.subjectId);
    if (
      !actual ||
      (
        [
          "hoursStudied",
          "questionsSolved",
          "intensityLevel",
          "disciplineScore",
          "completionPercent",
          "notes",
        ] as const
      ).some((key) => actual[key] !== entry[key])
    )
      throw new Error(
        "Not every subject was confirmed. Keep this draft and retry.",
      );
  }
  if (
    write.screen &&
    (!day.screen ||
      [...screenFields.map(([key]) => key), "note" as const].some(
        (key) => day.screen![key] !== write.screen![key],
      ))
  )
    throw new Error(
      "Screen time was not confirmed. Keep this draft and retry.",
    );
  return day;
}
