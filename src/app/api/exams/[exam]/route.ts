import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { guardExam, loadCustom, loadPrefs, loadRecords } from "@/lib/exams/server";
import { buildTree, treeKeys, type ExamKey, type ExamPrefs, type ExamTree } from "@/lib/exams/syllabus";
import { NEET_SS_GROUPS } from "@/data/exams/neet-ss";

export const dynamic = "force-dynamic";

const REASONS = new Set(["concept", "recall", "calculation", "misread", "guess", "time"]);
const ACTIVITIES = new Set(["study", "revision", "practice", "test"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`));
const optInt = (v: unknown, max: number) => (v === "" || v === null || v === undefined ? null : int(v, max));
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** The tree as it stands now — with your own chapters and topics. `raw` ignores hides, so hidden items can be restored. */
async function treeFor(exam: ExamKey, opts: { raw?: boolean } = {}) {
  const [prefs, custom] = await Promise.all([loadPrefs(exam), loadCustom(exam)]);
  return buildTree(exam, prefs, opts.raw ? { items: custom.items, overrides: [] } : custom);
}
const subjectOf = (tree: ExamTree, key: string) => tree.subjects.find((s) => key === s.key || key.startsWith(`${s.key}.`))?.key ?? null;

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
        const keys = treeKeys(await treeFor(exam));
        const itemKey = String(body.itemKey ?? "");
        if (!keys.items.has(itemKey)) return bad("Unknown syllabus item");
        const status = body.status === "done" ? "done" : body.status === "reading" ? "reading" : "todo";
        const row = await db.examProgress.upsert({
          where: { exam_itemKey: { exam, itemKey } },
          create: { exam, itemKey, status },
          update: { status },
        });
        return NextResponse.json({ ok: true, row: { itemKey, status: row.status, revisions: row.revisions, lastRevisedAt: row.lastRevisedAt?.toISOString() ?? null, questions: row.questions } });
      }

      /* ── Revision: every pass is its own event (minutes, confidence) ── */
      case "revision": {
        const tree = await treeFor(exam);
        const itemKey = String(body.itemKey ?? "");
        if (!treeKeys(tree).items.has(itemKey)) return bad("Unknown syllabus item");
        const revisedOn = date(body.revisedOn);
        const confidence = body.confidence === null || body.confidence === undefined || body.confidence === "" ? null : Math.max(1, Math.min(5, int(body.confidence, 5)));
        await db.examRevisionLog.create({ data: { exam, itemKey, subjectKey: subjectOf(tree, itemKey) ?? "general", revisedOn, minutes: int(body.minutes, 600), confidence, note: str(body.note, 2000) } });
        const prev = await db.examProgress.findUnique({ where: { exam_itemKey: { exam, itemKey } } });
        const last = prev?.lastRevisedAt && prev.lastRevisedAt > revisedOn ? prev.lastRevisedAt : revisedOn;
        await db.examProgress.upsert({
          where: { exam_itemKey: { exam, itemKey } },
          create: { exam, itemKey, status: "done", revisions: 1, lastRevisedAt: revisedOn },
          update: { status: "done", revisions: { increment: 1 }, lastRevisedAt: last },
        });
        return NextResponse.json({ ok: true });
      }
      case "deleteRevision": {
        const row = await db.examRevisionLog.findFirst({ where: { exam, id: String(body.id) } });
        if (!row) return NextResponse.json({ ok: true });
        await db.examRevisionLog.delete({ where: { id: row.id } });
        const latest = await db.examRevisionLog.findFirst({ where: { exam, itemKey: row.itemKey }, orderBy: { revisedOn: "desc" } });
        const prev = await db.examProgress.findUnique({ where: { exam_itemKey: { exam, itemKey: row.itemKey } } });
        if (prev) await db.examProgress.update({ where: { id: prev.id }, data: { revisions: Math.max(0, prev.revisions - 1), lastRevisedAt: latest?.revisedOn ?? null } });
        return NextResponse.json({ ok: true });
      }

      /* ── Your own syllabus: add, rename, hide, restore, delete ──────── */
      case "addChapter": {
        const tree = await treeFor(exam);
        const subjectKey = String(body.subjectKey ?? "");
        const name = str(body.name, 200);
        if (!tree.subjects.some((s) => s.key === subjectKey)) return bad("Pick a subject");
        if (!name) return bad("Give the chapter a name");
        const count = await db.examCustomItem.count({ where: { exam } });
        if (count >= 2000) return bad("That is a lot of custom items — tidy up some first");
        const row = await db.examCustomItem.create({ data: { exam, subjectKey, kind: "chapter", name } });
        return NextResponse.json({ ok: true, key: `${subjectKey}.x${row.id}` });
      }
      case "addTopic": {
        const tree = await treeFor(exam);
        const chapterKey = String(body.chapterKey ?? "");
        const name = str(body.name, 200);
        if (!treeKeys(tree).chapters.has(chapterKey)) return bad("Pick a chapter");
        if (!name) return bad("Give the topic a name");
        const subjectKey = subjectOf(tree, chapterKey);
        if (!subjectKey) return bad("Pick a chapter");
        const count = await db.examCustomItem.count({ where: { exam } });
        if (count >= 2000) return bad("That is a lot of custom items — tidy up some first");
        const row = await db.examCustomItem.create({ data: { exam, subjectKey, chapterKey, kind: "topic", name } });
        return NextResponse.json({ ok: true, key: `${chapterKey}.x${row.id}` });
      }
      case "rename":
      case "hide":
      case "unhide": {
        const keys = treeKeys(await treeFor(exam, { raw: true }));
        const itemKey = String(body.itemKey ?? "");
        if (!keys.items.has(itemKey) && !keys.chapters.has(itemKey)) return bad("Unknown chapter or topic");
        const data = action === "rename" ? { rename: str(body.name, 200) } : { hidden: action === "hide" };
        await db.examItemOverride.upsert({ where: { exam_itemKey: { exam, itemKey } }, create: { exam, itemKey, ...data }, update: data });
        return NextResponse.json({ ok: true });
      }
      case "deleteCustom": {
        const row = await db.examCustomItem.findFirst({ where: { exam, id: String(body.id) } });
        if (!row) return NextResponse.json({ ok: true });
        const key = row.kind === "chapter" ? `${row.subjectKey}.x${row.id}` : `${row.chapterKey}.x${row.id}`;
        await db.$transaction([
          db.examCustomItem.deleteMany({ where: { exam, OR: [{ id: row.id }, { chapterKey: key }] } }),
          db.examProgress.deleteMany({ where: { exam, OR: [{ itemKey: key }, { itemKey: { startsWith: `${key}.` } }] } }),
          db.examRevisionLog.deleteMany({ where: { exam, OR: [{ itemKey: key }, { itemKey: { startsWith: `${key}.` } }] } }),
          db.examItemOverride.deleteMany({ where: { exam, OR: [{ itemKey: key }, { itemKey: { startsWith: `${key}.` } }] } }),
        ]);
        return NextResponse.json({ ok: true });
      }

      /* ── Study sessions, to the minute ──────────────────────────────── */
      case "log": {
        const minutes = int(body.minutes, 960);
        const questions = int(body.questions, 2000);
        if (!minutes && !questions) return bad("Add minutes or questions");
        const tree = await treeFor(exam);
        const keys = treeKeys(tree);
        const itemKey = typeof body.itemKey === "string" && keys.items.has(body.itemKey) ? body.itemKey : null;
        const chapterKey = typeof body.chapterKey === "string" && keys.chapters.has(body.chapterKey) ? body.chapterKey : null;
        const subjectKey = keys.subjects.has(body.subjectKey) ? (body.subjectKey as string) : subjectOf(tree, chapterKey ?? itemKey ?? "") ?? "general";
        const correct = body.correct === null || body.correct === undefined || body.correct === "" ? null : Math.min(questions, int(body.correct, 2000));
        await db.examStudyLog.create({
          data: { exam, logDate: date(body.logDate), subjectKey, chapterKey, itemKey, activity: ACTIVITIES.has(body.activity) ? body.activity : "study", minutes, questions, correct, note: str(body.note, 4000) },
        });
        return NextResponse.json({ ok: true });
      }
      case "deleteLog":
        await db.examStudyLog.deleteMany({ where: { exam, id: String(body.id) } });
        return NextResponse.json({ ok: true });

      case "test": {
        const maxScore = Number(body.maxScore);
        const score = Number(body.score);
        if (!Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) return bad("Score and max score are required");
        const keys = treeKeys(await treeFor(exam));
        const subjectKey = typeof body.subjectKey === "string" && keys.subjects.has(body.subjectKey) ? body.subjectKey : null;
        await db.examTest.create({
          data: {
            exam,
            name: str(body.name, 160) ?? (subjectKey ? "Subject test" : "Grand test"),
            kind: subjectKey ? "subject" : body.kind === "mock" ? "mock" : "grand",
            subjectKey,
            minutes: optInt(body.minutes, 600),
            takenAt: date(body.takenAt),
            score: Math.min(score, maxScore),
            maxScore,
            correct: optInt(body.correct, 400),
            wrong: optInt(body.wrong, 400),
            skipped: optInt(body.skipped, 400),
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
        if (!topic) return bad("What was the question about?");
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
          if (!group) return bad("Unknown SS group");
          const specialties = (Array.isArray(body.ss.specialties) ? body.ss.specialties : []).filter((k: unknown) => group.specialties.some((s) => s.key === k)).slice(0, 4);
          next.ss = { group: group.key, specialties: specialties.length ? specialties : [group.specialties[0].key] };
        }
        if ("focus" in body) {
          if (body.focus === null) next.focus = null;
          else {
            const tree = buildTree(exam, next);
            if (!tree.subjects.some((s) => s.key === body.focus)) return bad("Unknown subject");
            next.focus = body.focus;
          }
        }
        await db.examPreference.upsert({ where: { exam }, create: { exam, json: next }, update: { json: next } });
        return NextResponse.json({ ok: true, prefs: next });
      }
      default:
        return bad("Unknown action");
    }
  } catch (error) {
    console.error("[exams] write failed", action, error);
    return NextResponse.json({ error: "Could not save — the database may be waking up. Try again." }, { status: 503 });
  }
}
