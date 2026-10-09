import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { randomBytes } from "node:crypto";

import { guardExam, loadPrefs, loadRecords, loadSyllabus, toNode } from "@/lib/exams/server";
import { buildTree, ssScope, treeKeys, type ExamKey, type ExamPrefs, type ExamTree } from "@/lib/exams/syllabus";
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

/** The tree as it stands now (from the database). `raw` keeps hidden nodes, so they can be restored. */
async function treeFor(exam: ExamKey, opts: { raw?: boolean } = {}) {
  const prefs = await loadPrefs(exam);
  return buildTree(exam, prefs, await loadSyllabus(exam, prefs), opts);
}
const LEVEL_NAME = ["", "subject", "chapter", "topic", "subtopic"];
const newKey = (prefix: string | null) => `${prefix ? `${prefix}.` : ""}u${randomBytes(4).toString("hex")}`;
/** A node the client may act on: in this exam and, for SS, inside the chosen group's subjects. */
async function nodeInScope(exam: ExamKey, key: string) {
  if (!key || key.length > 191) return null;
  const node = await db.examNode.findUnique({ where: { exam_key: { exam, key } } });
  if (!node) return null;
  if (exam === "ss") {
    const { group, subjectKeys } = ssScope(await loadPrefs(exam));
    const ok = subjectKeys.some((k) => key === k || key.startsWith(`${k}.`)) || key.startsWith(`${group.key}.u`);
    if (!ok) return null;
  }
  return node;
}
const subjectOf = (tree: ExamTree, key: string) => tree.subjects.find((s) => key === s.key || key.startsWith(`${s.key}.`))?.key ?? null;

/** Everything a workspace page needs: its preferences and its own records. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ exam: string }> }) {
  const g = await guardExam((await params).exam);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    // One chapter's subtopics (loaded when the chapter opens).
    const chapter = req.nextUrl.searchParams.get("subtopics");
    if (chapter) {
      if (!(await nodeInScope(g.exam, chapter))) return NextResponse.json({ error: "Unknown chapter" }, { status: 404 });
      const rows = await db.examNode.findMany({ where: { exam: g.exam, level: 4, key: { startsWith: `${chapter}.` } }, select: { key: true, parentKey: true, level: true, name: true, detail: true, ord: true, meta: true, origin: true, hidden: true } });
      return NextResponse.json({ nodes: rows.map(toNode) });
    }
    const prefs = await loadPrefs(g.exam);
    const records = await loadRecords(g.exam, prefs);
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
      case "subtick": {
        const key = String(body.key ?? "");
        const node = await nodeInScope(exam, key);
        if (!node || node.level !== 4 || node.hidden || !node.parentKey) return bad("Unknown subtopic");
        const done = body.done !== false;
        await db.examProgress.upsert({ where: { exam_itemKey: { exam, itemKey: key } }, create: { exam, itemKey: key, status: done ? "done" : "todo" }, update: { status: done ? "done" : "todo" } });
        // The topic follows its checklist upward (all ticked → done, some → reading); it is never demoted.
        const topicKey = node.parentKey;
        const siblings = await db.examNode.findMany({ where: { exam, parentKey: topicKey, level: 4, hidden: false }, select: { key: true } });
        const doneCount = await db.examProgress.count({ where: { exam, status: "done", itemKey: { in: siblings.map((x) => x.key) } } });
        const topic = await db.examProgress.findUnique({ where: { exam_itemKey: { exam, itemKey: topicKey } } });
        const before = topic?.status ?? "todo";
        let after = before;
        if (siblings.length && doneCount === siblings.length) after = "done";
        else if (doneCount > 0 && before === "todo") after = "reading";
        if (after !== before) await db.examProgress.upsert({ where: { exam_itemKey: { exam, itemKey: topicKey } }, create: { exam, itemKey: topicKey, status: after }, update: { status: after } });
        return NextResponse.json({ ok: true, topic: { itemKey: topicKey, status: after }, done: doneCount, of: siblings.length });
      }
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

      /* ── The syllabus itself: every level can be added, edited, removed, restored ── */
      case "node.add": {
        const name = str(body.name, 200);
        if (!name) return bad("Give it a name");
        const parentKey = typeof body.parentKey === "string" && body.parentKey ? body.parentKey : null;
        const count = await db.examNode.count({ where: { exam, origin: "user" } });
        if (count >= 5000) return bad("That is a lot of your own items — tidy up some first");
        const prefs = await loadPrefs(exam);
        let level = 1;
        let meta: Record<string, unknown> | undefined;
        if (parentKey) {
          const parent = await nodeInScope(exam, parentKey);
          if (!parent || parent.hidden) return bad("That parent no longer exists");
          if (parent.level >= 4) return bad("Subtopics are the deepest level — add a note instead");
          level = parent.level + 1;
        } else {
          const w = Number(body.weight);
          meta = exam === "ss"
            ? { role: "custom", ss: ssScope(prefs).group.key, weight: 0, hue: 300 }
            : { role: "custom", weight: Number.isFinite(w) && w >= 0 && w <= 100 ? w : 0, hue: Math.floor(Math.random() * 360), group: "Your subjects" };
        }
        const prefix = parentKey ?? (exam === "ss" ? ssScope(prefs).group.key : null);
        const last = await db.examNode.findFirst({ where: { exam, parentKey }, orderBy: { ord: "desc" }, select: { ord: true } });
        const key = newKey(prefix);
        await db.examNode.create({ data: { exam, key, parentKey, level, name, detail: str(body.detail, 4000), ord: (last?.ord ?? 0) + 1, origin: "user", ...(meta ? { meta: meta as object } : {}) } });
        return NextResponse.json({ ok: true, key, level: LEVEL_NAME[level] });
      }
      case "node.edit": {
        const node = await nodeInScope(exam, String(body.key ?? ""));
        if (!node) return bad("Unknown item");
        const data: { name?: string; detail?: string | null; meta?: object } = {};
        if (body.name !== undefined) {
          const name = str(body.name, 200);
          if (!name) return bad("A name cannot be empty");
          data.name = name;
        }
        if (body.detail !== undefined) data.detail = str(body.detail, 4000);
        if (node.level === 1 && body.weight !== undefined && exam === "pg") {
          const w = Number(body.weight);
          if (!Number.isFinite(w) || w < 0 || w > 100) return bad("Weight is 0–100");
          data.meta = { ...((node.meta as object) ?? {}), weight: w };
        }
        await db.examNode.update({ where: { id: node.id }, data });
        return NextResponse.json({ ok: true });
      }
      case "node.remove": {
        const node = await nodeInScope(exam, String(body.key ?? ""));
        if (!node) return NextResponse.json({ ok: true });
        if (node.origin !== "user") {
          await db.examNode.update({ where: { id: node.id }, data: { hidden: true } });
          return NextResponse.json({ ok: true, restorable: true });
        }
        // Your own item: gone for good, with everything under it and its progress.
        const under = { exam, OR: [{ key: node.key }, { key: { startsWith: `${node.key}.` } }] };
        const progressUnder = { exam, OR: [{ itemKey: node.key }, { itemKey: { startsWith: `${node.key}.` } }] };
        await db.$transaction([db.examNode.deleteMany({ where: under }), db.examProgress.deleteMany({ where: progressUnder }), db.examRevisionLog.deleteMany({ where: progressUnder })]);
        return NextResponse.json({ ok: true, restorable: false });
      }
      case "node.restore": {
        const node = await nodeInScope(exam, String(body.key ?? ""));
        if (!node) return bad("Unknown item");
        await db.examNode.update({ where: { id: node.id }, data: { hidden: false } });
        return NextResponse.json({ ok: true });
      }
      case "node.move": {
        const node = await nodeInScope(exam, String(body.key ?? ""));
        if (!node) return bad("Unknown item");
        const dir = body.dir === "up" ? -1 : 1;
        const sibs = await db.examNode.findMany({ where: { exam, parentKey: node.parentKey, level: node.level }, orderBy: [{ ord: "asc" }, { name: "asc" }], select: { id: true, key: true } });
        const i = sibs.findIndex((x) => x.key === node.key);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= sibs.length) return NextResponse.json({ ok: true });
        [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
        await db.$transaction(sibs.map((x, k) => db.examNode.update({ where: { id: x.id }, data: { ord: k + 1 } })));
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
          const specialties = (Array.isArray(body.ss.specialties) ? body.ss.specialties : []).filter((k: unknown) => group.courses.some((c) => c.key === k && c.subject)).slice(0, 4);
          next.ss = { group: group.key, specialties };
        }
        if ("focus" in body) {
          if (body.focus === null) next.focus = null;
          else {
            const tree = buildTree(exam, next, await loadSyllabus(exam, next));
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
