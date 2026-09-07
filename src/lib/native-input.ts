// Strict, JSON-only boundary for the native client. Never coerce malformed numbers.
export class NativeInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const screenKeys = ["instagram", "whatsapp", "youtube", "youtubeStudy", "facebook", "netflix", "hotstar", "mxPlayer", "google", "other"] as const;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NativeInputError("Invalid request.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max) throw new NativeInputError("Check the text length.");
  return value.trim();
}
function number(value: unknown, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) throw new NativeInputError("Check the numbers in your form.");
  return value;
}
export function day(value: unknown): string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new NativeInputError("Choose a valid date (YYYY-MM-DD).");
  return value;
}
function version(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new NativeInputError("Reload the saved record before editing.");
  return value;
}
const note = (value: unknown) => value === null ? null : text(value, 6000) || null;
function subjectId(value: unknown) {
  const id = text(value, 191);
  if (!id) throw new NativeInputError("Choose a subject.");
  return id;
}
export function parseNativeWrite(value: unknown) {
  const body = object(value);
  if (typeof body.operationId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.operationId)) throw new NativeInputError("Invalid save identifier.");
  const operationId = body.operationId;
  if (body.kind === "task") {
    const item = object(body.task), title = text(item.title, 240);
    if (!title) throw new NativeInputError("Give your task a title.");
    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(item.priority))) throw new NativeInputError("Choose a valid priority.");
    return { operationId, kind: "task" as const, task: {
      id: item.id === null ? null : subjectId(item.id), expectedUpdatedAt: version(item.expectedUpdatedAt),
      title, description: note(item.description), priority: item.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      subjectId: item.subjectId === null ? null : subjectId(item.subjectId),
      dueDate: item.dueDate === null ? null : day(item.dueDate),
      plannedMinutes: item.plannedMinutes === null ? null : number(item.plannedMinutes, 1440, true),
    } };
  }
  if (body.kind !== "day") throw new NativeInputError("Unsupported save.");
  const date = day(body.date);
  // Study dates follow the student's India calendar, never the server timezone.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (date > today) throw new NativeInputError("Study logs cannot be in the future.");
  if (!Array.isArray(body.entries) || body.entries.length > 12) throw new NativeInputError("Invalid subject entries.");
  const entries = body.entries.map(raw => {
    const entry = object(raw);
    return { subjectId: subjectId(entry.subjectId), expectedUpdatedAt: version(entry.expectedUpdatedAt),
      hoursStudied: number(entry.hoursStudied, 24), questionsSolved: number(entry.questionsSolved, 2147483647, true),
      intensityLevel: number(entry.intensityLevel, 5, true), disciplineScore: number(entry.disciplineScore, 100, true),
      completionPercent: number(entry.completionPercent, 100, true), notes: note(entry.notes) };
  }).sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  if (new Set(entries.map(e => e.subjectId)).size !== entries.length || entries.reduce((sum, e) => sum + e.hoursStudied, 0) > 24) throw new NativeInputError("Use each subject once and no more than 24 study hours.");
  const screen = body.screen === null ? null : object(body.screen);
  const screenTime = screen ? { expectedUpdatedAt: version(screen.expectedUpdatedAt), note: note(screen.note),
    ...Object.fromEntries(screenKeys.map(key => [key, number(screen[key], 24)])) as Record<typeof screenKeys[number], number> } : null;
  if (!entries.length && !screenTime) throw new NativeInputError("Add a study entry or screen-time record first.");
  return { operationId, kind: "day" as const, date, entries, screen: screenTime };
}
export type NativeWrite = ReturnType<typeof parseNativeWrite>;
export function checkVersion(actual: Date | null, expected: string | null) {
  if ((actual?.toISOString() ?? null) !== expected) throw new NativeInputError("This record changed on another device. Reload it and review your edits.", 409);
}
