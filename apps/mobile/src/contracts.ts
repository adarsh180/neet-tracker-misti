export type Task = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "SKIPPED";
  priority: string;
  dueDate: string | null;
  plannedMinutes: number | null;
  description?: string | null;
  subjectId?: string | null;
  updatedAt?: string;
  subject?: { name: string; slug: string } | null;
};
export type Topic = {
  id: string;
  subjectId?: string;
  updatedAt?: string;
  name: string;
  chapter: string | null;
  classLevel: string | null;
  isCompleted: boolean;
  questionsSolved: number;
  _count?: { revisions: number };
};
export type Subject = {
  id: string;
  name: string;
  slug: string;
  topics: Topic[];
  chapterQuestionTotals?: { chapter: string | null; questions: number }[];
};
export type Metrics = {
  studentName: string;
  totalTopics: number;
  completedTopics: number;
  totalStudyHours: number;
  totalQuestions: number;
  streak: number;
  testCount: number;
  pulseDays: { date: string; hours: number | null }[];
};
export const SITE_URL = "https://neet-tracker-misti.vercel.app";
export const COOKIE_NAME = "neet_private_session";
export const REMINDER_ID = "neet-studio-daily-review";

export function extractSessionCookie(header: string | null): string {
  // Native only: keep the same revocable trusted-device session as the website.
  const value = header?.match(
    /(?:^|,\s*)neet_private_session=(v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:;|$)/,
  )?.[1];
  if (!value)
    throw new Error(
      "A secure device session was not returned. Please retry sign-in.",
    );
  return value;
}
export function apiUrl(path: string) {
  if (!/^\/api\/[a-zA-Z0-9/_?=&%-]+$/.test(path) || path.includes(".."))
    throw new Error("Unsupported API path");
  const url = new URL(path, SITE_URL);
  if (url.origin !== SITE_URL || !url.pathname.startsWith("/api/"))
    throw new Error("Unsupported API origin or path");
  return url.toString();
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullableString = (value: unknown) =>
  value === null || typeof value === "string";
export function parseTasks(value: unknown): Task[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (t) =>
        record(t) &&
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        typeof t.priority === "string" &&
        nullableString(t.dueDate) &&
        (t.plannedMinutes === null || count(t.plannedMinutes)) &&
        (t.subject == null ||
          (record(t.subject) &&
            typeof t.subject.name === "string" &&
            typeof t.subject.slug === "string")) &&
        ["TODO", "IN_PROGRESS", "DONE", "SKIPPED"].includes(String(t.status)),
    )
  )
    throw new Error("Your task list could not be read. Please refresh.");
  return value as Task[];
}
export function parseSubjects(value: unknown): Subject[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (s) =>
        record(s) &&
        typeof s.id === "string" &&
        typeof s.name === "string" &&
        typeof s.slug === "string" &&
        (s.chapterQuestionTotals === undefined ||
          (Array.isArray(s.chapterQuestionTotals) &&
            s.chapterQuestionTotals.every(
              (entry) =>
                record(entry) &&
                nullableString(entry.chapter) &&
                count(entry.questions),
            ))) &&
        Array.isArray(s.topics) &&
        s.topics.every(
          (t) =>
            record(t) &&
            typeof t.id === "string" &&
            typeof t.name === "string" &&
            typeof t.isCompleted === "boolean" &&
            nullableString(t.chapter) &&
            nullableString(t.classLevel) &&
            (t._count === undefined ||
              (record(t._count) && count(t._count.revisions))) &&
            count(t.questionsSolved),
        ),
    )
  )
    throw new Error("Your syllabus could not be read. Please refresh.");
  return value as Subject[];
}
export function parseMetrics(value: unknown): Metrics {
  if (
    !record(value) ||
    (record(value.dataHealth) && value.dataHealth.databaseAvailable === false)
  )
    throw new Error(
      "Saved study totals are temporarily unavailable. No progress has been reset.",
    );
  for (const key of [
    "totalTopics",
    "completedTopics",
    "totalStudyHours",
    "totalQuestions",
    "streak",
    "testCount",
  ])
    if (!count(value[key]))
      throw new Error("Incomplete study totals. Please refresh.");
  if (
    typeof value.studentName !== "string" ||
    !Array.isArray(value.pulseDays) ||
    !value.pulseDays.every(
      (day) =>
        record(day) &&
        typeof day.date === "string" &&
        (day.hours === null || count(day.hours)),
    )
  )
    throw new Error("Incomplete study history. Please refresh.");
  return value as Metrics;
}
export function parseTaskReceipt(
  value: unknown,
  id: string,
  status: Task["status"],
): Task {
  const [task] = parseTasks([value]);
  if (task.id !== id || task.status !== status)
    throw new Error("This change is not confirmed. Refresh before retrying.");
  return task;
}
export function parseReminderTime(value: string) {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new Error("Use a time like 20:30 (24-hour clock).");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}
export function groupChapters(subject: Subject) {
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      classLevel: string;
      topics: Topic[];
      questions: number;
    }
  >();
  for (const topic of subject.topics) {
    const name = topic.chapter || "General topics",
      classLevel = topic.classLevel || "Unassigned",
      key = `${classLevel}:${name}`;
    const group = map.get(key) || {
      key,
      name,
      classLevel,
      topics: [],
      questions: 0,
    };
    group.topics.push(topic);
    group.questions += topic.questionsSolved;
    map.set(key, group);
  }
  // Chapter-only totals do not carry class in the current web contract. Avoid
  // allocating them twice when the same chapter name exists in both classes.
  for (const entry of subject.chapterQuestionTotals || []) {
    const matches = [...map.values()].filter(
      (group) => group.name === (entry.chapter || "General topics"),
    );
    if (matches.length === 1) matches[0].questions += entry.questions;
  }
  return [...map.values()];
}
