import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { guardExam, loadPrefs, loadRecords } from "@/lib/exams/server";
import { buildTree, type ExamPrefs } from "@/lib/exams/syllabus";
import { NEET_SS_GROUPS } from "@/data/exams/neet-ss";

export const dynamic = "force-dynamic";

const REASONS = new Set(["concept", "recall", "calculation", "misread", "guess", "time"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? new Date(`${v}T00:00:00Z`) : new Date());

/** Everything a workspace page needs: its preferences and its own records. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ exam: string }> }) {
  const g = await guardExam((await params).exam);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    const [prefs, records] = await Promise.all([loadPrefs(g.exam), loadRecords(g.exam)]);
    return NextResponse.json({ prefs, records });
  } catch (error) {
    console.error("[exams] load failed", error);
    return NextResponse.json({ error: "The database is waking up — try again in a moment." }, { status: 503 });
  }
}

/** One endpoint, explicit actions — every write is scoped to this exam only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ exam: string }> }) {
  const g = await guardExam((await params).exam);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const exam = g.exam;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "progress": {
        const prefs = await loadPrefs(exam);
        const tree = buildTree(exam, prefs);
        const valid = new Set(tree.subjects.flatMap((s) => s.chapters.flatMap((c) => c.items.map((i) => i.key))));
        const itemKey = String(body.itemKey ?? "");
        if (!valid.has(itemKey)) return NextResponse.json({ error: "Unknown syllabus item" }, { status: 400 });
        const status = body.status === "done" ? "done" : body.status === "reading" ? "reading" : "todo";
        const revise = body.revise === true;
        const row = await db.examProgress.upsert({
          where: { exam_itemKey: { exam, itemKey } },
          create: { exam, itemKey, status: revise ? "done" : status, revisions: revise ? 1 : 0, lastRevisedAt: revise ? new Date() : null },
          update: revise ? { status: "done", revisions: { increment: 1 }, lastRevisedAt: new Date() } : { status },
        });
        return NextResponse.json({ ok: true, row: { itemKey, status: row.status, revisions: row.revisions, lastRevisedAt: row.lastRevisedAt?.toISOString() ?? null, questions: row.questions } });
      }
      case "log": {
        const minutes = int(body.minutes, 960);
        const questions = int(body.questions, 2000);
        if (!minutes && !questions) return NextResponse.json({ error: "Add minutes or questions" }, { status: 400 });
        const correct = body.correct === null || body.correct === undefined || body.correct === "" ? null : Math.min(questions, int(body.correct, 2000));
        await db.examStudyLog.create({ data: { exam, logDate: date(body.logDate), subjectKey: str(body.subjectKey, 96) ?? "general", minutes, questions, correct, note: str(body.note, 4000) } });
        return NextResponse.json({ ok: true });
      }
      case "deleteLog":
        await db.examStudyLog.deleteMany({ where: { exam, id: String(body.id) } });
        return NextResponse.json({ ok: true });
      case "test": {
        const maxScore = Number(body.maxScore);
        const score = Number(body.score);
        if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) return NextResponse.json({ error: "Score and max score are required" }, { status: 400 });
        await db.examTest.create({
          data: {
            exam,
            name: str(body.name, 160) ?? "Grand test",
            kind: body.kind === "subject" ? "subject" : body.kind === "mock" ? "mock" : "grand",
            takenAt: date(body.takenAt),
            score,
            maxScore,
            correct: body.correct === "" || body.correct == null ? null : int(body.correct, 400),
            wrong: body.wrong === "" || body.wrong == null ? null : int(body.wrong, 400),
            skipped: body.skipped === "" || body.skipped == null ? null : int(body.skipped, 400),
            note: str(body.note, 4000),
          },
        });
        return NextResponse.json({ ok: true });
      }
      case "deleteTest":
        await db.examTest.deleteMany({ where: { exam, id: String(body.id) } });
        return NextResponse.json({ ok: true });
      case "error": {
        const topic = str(body.topic, 200);
        if (!topic) return NextResponse.json({ error: "What was the question about?" }, { status: 400 });
        await db.examErrorEntry.create({ data: { exam, subjectKey: str(body.subjectKey, 96) ?? "general", topic, reason: REASONS.has(body.reason) ? body.reason : "concept", note: str(body.note, 4000) } });
        return NextResponse.json({ ok: true });
      }
      case "resolveError":
        await db.examErrorEntry.updateMany({ where: { exam, id: String(body.id) }, data: { resolved: body.resolved !== false } });
        return NextResponse.json({ ok: true });
      case "deleteError":
        await db.examErrorEntry.deleteMany({ where: { exam, id: String(body.id) } });
        return NextResponse.json({ ok: true });
      case "prefs": {
        const current = await loadPrefs(exam);
        const next: ExamPrefs = { ...current };
        if (body.targetDate === null || (typeof body.targetDate === "string" && DATE.test(body.targetDate))) next.targetDate = body.targetDate;
        if (typeof body.hoursTarget === "number" && body.hoursTarget >= 2 && body.hoursTarget <= 16) next.hoursTarget = body.hoursTarget;
        if (exam === "ss" && body.ss && typeof body.ss === "object") {
          const group = NEET_SS_GROUPS.find((x) => x.key === body.ss.group);
          if (!group) return NextResponse.json({ error: "Unknown SS group" }, { status: 400 });
          const specialties = (Array.isArray(body.ss.specialties) ? body.ss.specialties : []).filter((k: unknown) => group.specialties.some((s) => s.key === k)).slice(0, 4);
          next.ss = { group: group.key, specialties: specialties.length ? specialties : [group.specialties[0].key] };
        }
        await db.examPreference.upsert({ where: { exam }, create: { exam, json: next }, update: { json: next } });
        return NextResponse.json({ ok: true, prefs: next });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[exams] write failed", action, error);
    return NextResponse.json({ error: "Could not save — the database may be waking up. Try again." }, { status: 503 });
  }
}
