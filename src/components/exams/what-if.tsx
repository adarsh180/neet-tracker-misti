"use client";

import { useEffect, useMemo, useState } from "react";

import { TargetCards } from "@/components/exams/instruments";
import { useWorkspace } from "@/components/exams/workspace-context";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { computeWorkspace, runExamWhatIf, type Levers } from "@/lib/exams/metrics";
import type { ExamKey } from "@/lib/exams/syllabus";

const LEVERS: Array<{ key: keyof Levers; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint: string }> = [
  { key: "hoursPerDay", label: "Study hours a day", min: 0, max: 16, step: 0.5, fmt: (v) => `${v}h`, hint: "push-hard benchmark 12h" },
  { key: "questionsPerDay", label: "MCQs a day", min: 0, max: 500, step: 10, fmt: (v) => `${v}`, hint: "200+ keeps you exam-sharp" },
  { key: "testsPerWeek", label: "Grand tests a week", min: 0, max: 4, step: 0.5, fmt: (v) => `${v}`, hint: "one a week, two in the last 8 weeks" },
  { key: "accuracy", label: "Accuracy", min: 0.4, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, hint: "+4/−1 — skip when unsure" },
  { key: "revision", label: "Syllabus revised", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, hint: "share of the paper revised at least once" },
];

// Push-hard presets: 12h a day for both, everything else +20%.
const PRESETS: Array<{ id: string; label: string; levers: Levers | null }> = [
  { id: "you", label: "Your pace", levers: null },
  { id: "steady", label: "Steady", levers: { hoursPerDay: 12, questionsPerDay: 180, testsPerWeek: 1.2, accuracy: 0.84, revision: 0.84 } },
  { id: "topper", label: "Topper", levers: { hoursPerDay: 12, questionsPerDay: 360, testsPerWeek: 2.4, accuracy: 0.96, revision: 1 } },
];

export function WorkspaceWhatIf({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace();
  // Rank and seat odds are whole-paper outcomes, so this page always models the whole exam.
  const m = useMemo(() => (ws.state ? computeWorkspace({ tree: ws.tree, records: ws.state.records, targetDate: ws.state.prefs.targetDate, hoursTarget: ws.state.prefs.hoursTarget }) : null), [ws.state, ws.tree]);
  const observed = useMemo<Levers | null>(
    () => (m ? { hoursPerDay: Math.round(m.hoursPerDay * 2) / 2, questionsPerDay: Math.round(m.questionsPerDay / 10) * 10, testsPerWeek: Math.round((m.tests28 / 4) * 2) / 2, accuracy: Math.round((m.accuracy ?? 0.65) * 100) / 100, revision: Math.round(m.revisedShare * 20) / 20 } : null),
    [m],
  );
  const [levers, setLevers] = useState<Levers | null>(null);
  const [preset, setPreset] = useState("you");
  useEffect(() => {
    if (observed && !levers) setLevers(observed);
  }, [observed, levers]);

  if (!m || !levers || !observed) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Loading the model" />;
  const r = runExamWhatIf(exam, levers, { currentShare: m.testShare ?? m.coverage * 0.6, daysToExam: m.daysToExam, tests: m.tests.length });

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · what-if</span>
        <h1 className="xw-title">Move a habit, <em>watch the rank.</em></h1>
        <p className="xw-lede">Starts from your real pace. Effort lifts your level toward the ceiling your accuracy allows; the targets never move. {m.daysToExam === null ? "Set the exam date on the dashboard for a sharper projection." : `${m.daysToExam} days to the exam.`}{ws.subject ? ` Rank is a whole-paper outcome, so this page models the whole exam even with ${ws.subject.name} in focus.` : ""}</p>
      </header>
      <section className="xw-grid g2">
        <div className="xw-card">
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
            <h2>Levers</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className={`xw-btn is-sm ${preset === p.id ? "is-primary" : ""}`} onClick={() => { setPreset(p.id); setLevers(p.levers ?? observed); }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="xw-levers">
            {LEVERS.map((l) => (
              <label key={l.key} className="xw-lev">
                <header><b>{l.label}</b><span>{l.fmt(levers[l.key])}</span></header>
                <input type="range" min={l.min} max={l.max} step={l.step} value={levers[l.key]} onChange={(e) => { setPreset("custom"); setLevers({ ...levers, [l.key]: Number(e.target.value) }); }} />
                <small>{l.hint}</small>
              </label>
            ))}
          </div>
        </div>
        <div className="xw-card">
          <h2>Projection</h2>
          <dl className="xw-stats" style={{ marginBottom: 16 }}>
            <div className="xw-stat"><dt>Projected level</dt><dd>{Math.round(r.projected * 100)}<small>% of max</small></dd><span>≈ {Math.round(r.projected * ws.tree.totalMarks)}/{ws.tree.totalMarks}</span></div>
            <div className="xw-stat"><dt>Ceiling</dt><dd>{Math.round(r.ceiling * 100)}<small>%</small></dd><span>what this accuracy allows</span></div>
            <div className="xw-stat"><dt>Range</dt><dd>±{Math.round(r.sigma * 100)}<small>%</small></dd><span>narrows with more tests</span></div>
            {r.rank ? <div className="xw-stat"><dt>≈ AIR</dt><dd>{r.rank.toLocaleString("en-IN")}</dd><span>2025 NEET PG data</span></div> : null}
          </dl>
          <TargetCards targets={r.targets} />
        </div>
      </section>
    </main>
  );
}
