import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { dayKey, type Records } from "@/lib/exams/metrics";
import type { Customisations, ExamKey, ExamPrefs } from "@/lib/exams/syllabus";

export const EXAM_COOKIE = "neet-exam";
export const EXAMS = ["ug", "pg", "ss"] as const;
export type AnyExam = (typeof EXAMS)[number];

export const isWorkspaceExam = (v: unknown): v is ExamKey => v === "pg" || v === "ss";

/** API guard: a private session AND the exam currently opened must match the route. */
export async function guardExam(exam: string): Promise<{ ok: true; exam: ExamKey } | { ok: false; status: number; error: string }> {
  if (!isWorkspaceExam(exam)) return { ok: false, status: 404, error: "Unknown exam" };
  const session = await getPrivateSession();
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };
  const store = await cookies();
  if (store.get(EXAM_COOKIE)?.value !== exam) return { ok: false, status: 403, error: `Open ${exam.toUpperCase()} from the exam picker first.` };
  return { ok: true, exam };
}

export async function loadPrefs(exam: ExamKey): Promise<ExamPrefs> {
  const row = await db.examPreference.findUnique({ where: { exam } }).catch(() => null);
  return (row?.json as ExamPrefs | undefined) ?? {};
}

/** Your own chapters/topics, renames and hides for this exam. */
export async function loadCustom(exam: ExamKey): Promise<Customisations> {
  const [items, overrides] = await Promise.all([
    db.examCustomItem.findMany({ where: { exam }, orderBy: { createdAt: "asc" } }),
    db.examItemOverride.findMany({ where: { exam } }),
  ]);
  return {
    items: items.map((i) => ({ id: i.id, subjectKey: i.subjectKey, chapterKey: i.chapterKey, kind: i.kind === "chapter" ? "chapter" : "topic", name: i.name })),
    overrides: overrides.map((o) => ({ itemKey: o.itemKey, hidden: o.hidden, rename: o.rename })),
  };
}

/** Exam-scoped records only — plus the shared mood log, the one thing all three exams share. */
export async function loadRecords(exam: ExamKey): Promise<Records> {
  const [progress, logs, tests, errors, revisions, moods, custom] = await Promise.all([
    db.examProgress.findMany({ where: { exam } }),
    db.examStudyLog.findMany({ where: { exam }, orderBy: { logDate: "desc" }, take: 3000 }),
    db.examTest.findMany({ where: { exam }, orderBy: { takenAt: "asc" }, take: 500 }),
    db.examErrorEntry.findMany({ where: { exam }, orderBy: { createdAt: "desc" }, take: 1500 }),
    db.examRevisionLog.findMany({ where: { exam }, orderBy: { revisedOn: "desc" }, take: 3000 }),
    db.moodEntry.findMany({ orderBy: { date: "desc" }, take: 10, select: { energy: true, focus: true, stress: true } }),
    loadCustom(exam),
  ]);
  return {
    progress: progress.map((r) => ({ itemKey: r.itemKey, status: r.status, revisions: r.revisions, lastRevisedAt: r.lastRevisedAt?.toISOString() ?? null, questions: r.questions })),
    logs: logs.map((l) => ({ id: l.id, logDate: dayKey(l.logDate), subjectKey: l.subjectKey, chapterKey: l.chapterKey, itemKey: l.itemKey, activity: l.activity, minutes: l.minutes, questions: l.questions, correct: l.correct, note: l.note })),
    tests: tests.map((t) => ({ id: t.id, name: t.name, kind: t.kind, subjectKey: t.subjectKey, minutes: t.minutes, takenAt: dayKey(t.takenAt), score: t.score, maxScore: t.maxScore, correct: t.correct, wrong: t.wrong, skipped: t.skipped, note: t.note })),
    errors: errors.map((e) => ({ id: e.id, subjectKey: e.subjectKey, topic: e.topic, reason: e.reason, note: e.note, resolved: e.resolved, createdAt: e.createdAt.toISOString() })),
    revisions: revisions.map((r) => ({ id: r.id, itemKey: r.itemKey, subjectKey: r.subjectKey, revisedOn: dayKey(r.revisedOn), minutes: r.minutes, confidence: r.confidence, note: r.note })),
    moods,
    custom,
  };
}
