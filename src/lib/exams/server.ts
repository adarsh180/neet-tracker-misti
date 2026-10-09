import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { GATE_COOKIE, verifyGateToken } from "@/lib/exams/gate-token";
import { dayKey, type Records } from "@/lib/exams/metrics";
import { ssScope, type ExamKey, type ExamPrefs, type ExamSyllabus, type NodeRole, type SyllabusNode } from "@/lib/exams/syllabus";

export const EXAM_COOKIE = "neet-exam";
export const EXAMS = ["ug", "pg", "ss", "hub"] as const;
export type AnyExam = (typeof EXAMS)[number];

export const isWorkspaceExam = (v: unknown): v is ExamKey => v === "pg" || v === "ss";

/** API guard: a private session AND the exam currently opened must match the route. */
export async function guardExam(exam: string): Promise<{ ok: true; exam: ExamKey } | { ok: false; status: number; error: string }> {
  if (!isWorkspaceExam(exam)) return { ok: false, status: 404, error: "Unknown exam" };
  const session = await getPrivateSession();
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };
  const store = await cookies();
  if (store.get(EXAM_COOKIE)?.value !== exam || !verifyGateToken(store.get(GATE_COOKIE)?.value)) return { ok: false, status: 403, error: `Open ${exam.toUpperCase()} from the exam picker first.` };
  return { ok: true, exam };
}

export async function loadPrefs(exam: ExamKey): Promise<ExamPrefs> {
  const row = await db.examPreference.findUnique({ where: { exam } }).catch(() => null);
  return (row?.json as ExamPrefs | undefined) ?? {};
}

type NodeMeta = { weight?: number; hue?: number; group?: string; role?: NodeRole; ss?: string };
type NodeRow = { key: string; parentKey: string | null; level: number; name: string; detail: string | null; ord: number; meta: unknown; origin: string; hidden: boolean };
export const toNode = (r: NodeRow): SyllabusNode => {
  const m = (r.meta ?? {}) as NodeMeta;
  return {
    key: r.key, parent: r.parentKey, level: Math.min(4, Math.max(1, r.level)) as SyllabusNode["level"], name: r.name, detail: r.detail, ord: r.ord, hidden: r.hidden, user: r.origin === "user",
    ...(r.level === 1 ? { weight: m.weight ?? 0, hue: m.hue, group: m.ss ?? m.group, role: m.role } : {}),
  };
};

/**
 * The syllabus for a workspace: subjects, chapters and topics (hidden ones
 * included so they can be restored) plus how many subtopics each topic has.
 * NEET SS loads only the chosen group's paper and courses.
 */
export async function loadSyllabus(exam: ExamKey, prefs?: ExamPrefs): Promise<ExamSyllabus> {
  const p = prefs ?? (await loadPrefs(exam));
  const scope = exam === "ss" ? ssScope(p) : null;
  const inScope = scope ? { OR: [...scope.subjectKeys.map((k) => ({ key: { startsWith: `${k}.` } })), { key: { in: scope.subjectKeys } }, { key: { startsWith: `${scope.group.key}.u` } }] } : {};
  const [rows, subs] = await Promise.all([
    db.examNode.findMany({ where: { exam, level: { lte: 3 }, ...inScope }, select: { key: true, parentKey: true, level: true, name: true, detail: true, ord: true, meta: true, origin: true, hidden: true } }),
    db.examNode.groupBy({ by: ["parentKey"], where: { exam, level: 4, hidden: false, ...inScope }, _count: { _all: true } }),
  ]);
  const subCounts: Record<string, number> = {};
  for (const g of subs) if (g.parentKey) subCounts[g.parentKey] = g._count._all;
  return { nodes: rows.map(toNode), subCounts };
}

/** Exam-scoped records only — plus the shared mood log, the one thing all three exams share. */
export async function loadRecords(exam: ExamKey, prefs?: ExamPrefs): Promise<Records> {
  const [progress, logs, tests, errors, revisions, moods, syllabus] = await Promise.all([
    db.examProgress.findMany({ where: { exam } }),
    db.examStudyLog.findMany({ where: { exam }, orderBy: { logDate: "desc" }, take: 3000 }),
    db.examTest.findMany({ where: { exam }, orderBy: { takenAt: "asc" }, take: 500 }),
    db.examErrorEntry.findMany({ where: { exam }, orderBy: { createdAt: "desc" }, take: 1500 }),
    db.examRevisionLog.findMany({ where: { exam }, orderBy: { revisedOn: "desc" }, take: 3000 }),
    db.moodEntry.findMany({ orderBy: { date: "desc" }, take: 10, select: { energy: true, focus: true, stress: true } }),
    loadSyllabus(exam, prefs),
  ]);
  return {
    progress: progress.map((r) => ({ itemKey: r.itemKey, status: r.status, revisions: r.revisions, lastRevisedAt: r.lastRevisedAt?.toISOString() ?? null, questions: r.questions })),
    logs: logs.map((l) => ({ id: l.id, logDate: dayKey(l.logDate), subjectKey: l.subjectKey, chapterKey: l.chapterKey, itemKey: l.itemKey, activity: l.activity, minutes: l.minutes, questions: l.questions, correct: l.correct, note: l.note })),
    tests: tests.map((t) => ({ id: t.id, name: t.name, kind: t.kind, subjectKey: t.subjectKey, minutes: t.minutes, takenAt: dayKey(t.takenAt), score: t.score, maxScore: t.maxScore, correct: t.correct, wrong: t.wrong, skipped: t.skipped, note: t.note })),
    errors: errors.map((e) => ({ id: e.id, subjectKey: e.subjectKey, topic: e.topic, reason: e.reason, note: e.note, resolved: e.resolved, createdAt: e.createdAt.toISOString() })),
    revisions: revisions.map((r) => ({ id: r.id, itemKey: r.itemKey, subjectKey: r.subjectKey, revisedOn: dayKey(r.revisedOn), minutes: r.minutes, confidence: r.confidence, note: r.note })),
    moods,
    syllabus,
  };
}
