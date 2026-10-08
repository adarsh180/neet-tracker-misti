"use client";

import { useMemo, useState } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";

import { ExamAIPanel } from "@/components/exams/ai-panel";
import { Heat, PartsLedger, SubjectBars, SubjectRings, TargetCards, TestChart } from "@/components/exams/instruments";
import { SsSetup } from "@/components/exams/ss-setup";
import { useWorkspace } from "@/components/exams/use-workspace";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { computeWorkspace, runExamWhatIf } from "@/lib/exams/metrics";
import type { ExamKey } from "@/lib/exams/syllabus";

const REASON_LABEL: Record<string, string> = { concept: "Concept gap", recall: "Recall slip", calculation: "Calculation", misread: "Misread", guess: "Guessed", time: "Ran out of time" };

export function WorkspaceDashboard({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace(exam);
  const [zone, setZone] = useState<{ subject: string | null; chapter: string | null }>({ subject: null, chapter: null });
  const m = useMemo(
    () => (ws.state ? computeWorkspace({ tree: ws.tree, records: ws.state.records, zone, targetDate: ws.state.prefs.targetDate, hoursTarget: ws.state.prefs.hoursTarget }) : null),
    [ws.state, ws.tree, zone],
  );
  const odds = useMemo(() => {
    if (!m) return null;
    return runExamWhatIf(exam, { hoursPerDay: m.hoursPerDay, questionsPerDay: m.questionsPerDay, testsPerWeek: m.tests28 / 4, accuracy: m.accuracy ?? 0.65, revision: m.revisedShare }, { currentShare: m.testShare ?? m.coverage * 0.6, daysToExam: m.daysToExam, tests: m.tests.length });
  }, [m, exam]);

  if (!ws.state || !m) {
    if (ws.error) {
      return (
        <main className="xw-page">
          <div className="xw-empty"><b>Your {exam.toUpperCase()} workspace didn&apos;t load.</b>{ws.error}<button type="button" className="xw-btn" style={{ justifySelf: "start" }} onClick={() => void ws.load()}><RefreshCw size={14} /> Retry</button></div>
        </main>
      );
    }
    return <HeartLoader label={`Opening NEET ${exam.toUpperCase()}`} />;
  }

  const subject = ws.tree.subjects.find((s) => s.key === zone.subject) ?? null;
  const pct = (v: number) => `${Math.round(v * 100)}`;

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">
          <CalendarClock size={14} /> {ws.tree.title} · {m.daysToExam === null ? "set your exam date" : `${m.daysToExam} days to the exam`}
        </span>
        <h1 className="xw-title">{exam === "pg" ? <>Ward <em>round.</em></> : <>Theatre <em>list.</em></>}</h1>
        <p className="xw-lede">
          {exam === "pg"
            ? "NEET PG on its own: 19 subjects weighted by the paper, grand tests against MD/MS closing ranks, and nothing from NEET UG mixed in."
            : "NEET SS on its own: your group's feeder syllabus and the super-specialties you chose, weighted 40/60 the way the paper is set."}{" "}
          {ws.tree.note}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label className="xw-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            EXAM DATE
            <input
              type="date"
              className="xw-input"
              defaultValue={ws.state.prefs.targetDate ?? ""}
              onBlur={(e) => e.target.value !== (ws.state?.prefs.targetDate ?? "") && void ws.act({ action: "prefs", targetDate: e.target.value || null })}
            />
          </label>
          <label className="xw-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            HOURS / DAY TARGET
            <input
              type="number"
              className="xw-input"
              style={{ width: 80 }}
              min={2}
              max={16}
              step={0.5}
              defaultValue={ws.state.prefs.hoursTarget ?? 12}
              onBlur={(e) => Number(e.target.value) !== (ws.state?.prefs.hoursTarget ?? 12) && void ws.act({ action: "prefs", hoursTarget: Number(e.target.value) })}
            />
          </label>
        </div>
      </header>

      {exam === "ss" ? (
        <section className="xw-sect" style={{ marginTop: 0, marginBottom: 22 }}>
          <SsSetup value={ws.state.prefs.ss} saving={ws.saving} onSave={(v) => void ws.act({ action: "prefs", ss: v })} />
        </section>
      ) : null}

      <div className="xw-zone">
        <span>Zone</span>
        <select className="xw-select" value={zone.subject ?? ""} onChange={(e) => setZone({ subject: e.target.value || null, chapter: null })} aria-label="Subject zone">
          <option value="">Whole exam</option>
          {ws.tree.subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        {subject ? (
          <select className="xw-select" value={zone.chapter ?? ""} onChange={(e) => setZone({ subject: zone.subject, chapter: e.target.value || null })} aria-label="Chapter zone">
            <option value="">All chapters</option>
            {subject.chapters.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        ) : null}
        {zone.subject ? <button type="button" className="xw-btn is-sm" onClick={() => setZone({ subject: null, chapter: null })}>Reset zone</button> : null}
      </div>

      <section className="xw-card xw-hero">
        <SubjectRings m={m} center={{ value: m.readiness, label: `readiness · ${m.band}`, sub: zone.subject ? "for this zone" : "whole exam" }} />
        <div>
          <dl className="xw-stats">
            <div className="xw-stat"><dt>Covered</dt><dd>{pct(m.coverage)}<small>% marks</small></dd><span>{m.subjects.reduce((s, x) => s + x.doneItems, 0)} / {m.subjects.reduce((s, x) => s + x.items, 0)} topics</span></div>
            <div className="xw-stat"><dt>Revised</dt><dd>{pct(m.revisedShare)}<small>%</small></dd><span>{pct(m.twiceShare)}% twice</span></div>
            <div className="xw-stat"><dt>Test level</dt><dd className={m.testShare === null ? "" : m.testShare >= m.targets[0].share ? "t-good" : m.testShare >= m.targets[0].share - 0.08 ? "t-warn" : "t-bad"}>{m.testShare === null ? "—" : pct(m.testShare)}<small>{m.testShare === null ? "" : "% of max"}</small></dd><span>target ~{pct(m.targets[0].share)}%</span></div>
            <div className="xw-stat"><dt>{exam === "pg" ? "Projected AIR" : "MCQs / day"}</dt><dd>{exam === "pg" ? (odds?.rank && m.testShare !== null ? odds.rank.toLocaleString("en-IN") : "—") : Math.round(m.questionsPerDay)}</dd><span>{exam === "pg" ? (m.testShare === null ? "log a grand test first" : "at your current levers") : `${m.hoursPerDay.toFixed(1)}h a day`}</span></div>
          </dl>
          <PartsLedger parts={m.parts} lever={m.lever} />
        </div>
      </section>

      <section className="xw-sect xw-grid g2">
        <div className="xw-card">
          <h2>{zone.subject ? "Chapters by marks" : "Subjects by marks"}</h2>
          <p className="xw-sub">Bar length is what the subject is worth in the paper; fill is what you have finished. Tap one to zoom the whole dashboard into it.</p>
          <SubjectBars m={m} onPick={zone.subject ? undefined : (key) => setZone({ subject: key, chapter: null })} />
        </div>
        <div className="xw-card">
          <h2>{exam === "pg" ? "Seat odds" : "Target odds"}</h2>
          <p className="xw-sub">{exam === "pg" ? "From your test level and habits, projected to exam day against 2025 AIQ (General) closing ranks." : "From your test level and habits, projected to exam day against planning bars (NBEMS publishes no SS rank tables)."}</p>
          <TargetCards targets={odds?.targets ?? m.targets} rank={exam === "pg" && m.testShare !== null ? odds?.rank : null} />
        </div>
      </section>

      <section className="xw-sect xw-grid g2">
        <div className="xw-card">
          <h2>Study heatmap</h2>
          <p className="xw-sub">26 weeks of {exam.toUpperCase()} study logs only.</p>
          <Heat m={m} />
        </div>
        <div className="xw-card">
          <h2>Mistake patterns</h2>
          <p className="xw-sub">Why questions went wrong, from your error log.</p>
          {m.reasons.length ? (
            <div className="xw-subjects">
              {m.reasons.map(([r, n]) => (
                <div key={r} className="xw-subj">
                  <span><b>{REASON_LABEL[r] ?? r}</b></span>
                  <span className="xw-bar" style={{ "--d": n / Math.max(...m.reasons.map((x) => x[1])), "--r": 0, "--h": 350 } as React.CSSProperties}><i className="d" /></span>
                  <span className="num">{n}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="xw-empty"><b>No mistakes logged</b>Log wrong answers on the Log &amp; errors tab — patterns appear here.</div>
          )}
        </div>
      </section>

      <section className="xw-sect xw-card">
        <h2>Grand tests</h2>
        <p className="xw-sub">Score as a share of the maximum, with the target bands.</p>
        <TestChart m={m} />
      </section>

      <section className="xw-sect">
        <ExamAIPanel exam={exam} />
      </section>
    </main>
  );
}
