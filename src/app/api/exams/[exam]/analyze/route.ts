import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { computeWorkspace } from "@/lib/exams/metrics";
import { guardExam, loadPrefs, loadRecords } from "@/lib/exams/server";
import { buildTree, focusOf } from "@/lib/exams/syllabus";
import { chatWithAI } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ exam: string }> }) {
  const g = await guardExam((await params).exam);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const items = await db.examAnalysis.findMany({ where: { exam: g.exam }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => []);
  return NextResponse.json({ items: items.map((a) => ({ id: a.id, text: a.text, createdAt: a.createdAt.toISOString() })) });
}

/** Runs only when asked. Reads this exam's data only — never UG or the other workspace. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ exam: string }> }) {
  const g = await guardExam((await params).exam);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const [prefs, records] = await Promise.all([loadPrefs(g.exam), loadRecords(g.exam)]);
  const tree = buildTree(g.exam, prefs, records.syllabus);
  const focus = focusOf(tree, prefs);
  const m = computeWorkspace({ tree, records, focus, targetDate: prefs.targetDate, hoursTarget: prefs.hoursTarget });
  const weakest = [...m.subjects].sort((a, b) => b.marks - b.done - (a.marks - a.done)).slice(0, 5);
  const summary = {
    exam: tree.title,
    scope: m.focusName ? `Subject in focus: ${m.focusName} (all figures below are for this subject only)` : "Whole exam",
    paper: `${tree.questions} MCQs, ${tree.totalMarks} marks, +4/−1`,
    daysToExam: m.daysToExam,
    readiness: `${m.readiness}/100 (${m.band})`,
    parts: m.parts.map((p) => `${p.label}: ${Math.round(p.score * p.weight * 10) / 10}/${p.weight} — ${p.value}`),
    coverage: `${Math.round(m.coverage * 100)}% of marks covered, ${Math.round(m.revisedShare * 100)}% revised, ${Math.round(m.twiceShare * 100)}% twice`,
    tests: m.tests.slice(-6).map((t) => `${t.takenAt} ${t.name}: ${t.score}/${t.maxScore}`),
    projectedRank: m.projectedRank,
    targets: m.targets.map((t) => `${t.label} ≈ ${Math.round(t.share * 100)}% of max`),
    biggestGaps: weakest.map((s) => `${s.name}: ${Math.round(s.marks - s.done)} of ${Math.round(s.marks)} marks not done`),
    mistakeReasons: m.reasons.slice(0, 4).map(([r, n]) => `${r} ×${n}`),
    timeSplit28d: Object.entries(m.byActivity).map(([k, v]) => `${k} ${Math.round(v / 60)}h`).join(", "),
    revisionLadder: `never revised ${m.ladder[0]}, once ${m.ladder[1]}, twice ${m.ladder[2]}, 3+ ${m.ladder[3]} (finished topics)`,
    revisionsDue: m.dueItems.slice(0, 8).map((i) => `${i.subject} › ${i.label}`),
    avgConfidence: m.avgConfidence === null ? null : `${m.avgConfidence.toFixed(1)}/5`,
    hours: `${m.hoursPerDay.toFixed(1)}h/day, ${Math.round(m.questionsPerDay)} MCQs/day, ${m.loggedDays28}/28 days logged`,
  };
  try {
    const res = await chatWithAI(
      [
        { role: "system", content: "You are a strict, caring mentor for a medical student preparing for an NBEMS exam. Be honest and specific; never invent progress not in the data." },
        {
          role: "user",
          content: `Live tracker data:\n${JSON.stringify(summary, null, 2)}\n\nWrite markdown with: **Verdict** (one paragraph), **What the numbers show** (3 bullets), **Biggest risks** (3 bullets), **Next 7 days** (day-by-day: subjects by marks gap, MCQ targets, one grand test, revision blocks), **One habit to fix**. Under 420 words.`,
        },
      ],
      1400,
      0.4,
      28000,
    );
    const text = res.content.trim();
    const saved = await db.examAnalysis.create({ data: { exam: g.exam, model: res.model, text } }).catch(() => null);
    return NextResponse.json({ id: saved?.id ?? null, text, createdAt: new Date().toISOString() });
  } catch (error) {
    console.error("[exams/analyze]", error);
    return NextResponse.json({ error: "The AI mentor is busy right now — your metrics are unaffected. Try again shortly." }, { status: 503 });
  }
}
