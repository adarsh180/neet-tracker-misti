"use client";

import { useMemo, useState } from "react";
import { CalendarClock, RefreshCw, Settings2 } from "lucide-react";

import { ExamAIPanel } from "@/components/exams/ai-panel";
import { Heat, PartsLedger, TargetCards, TestChart } from "@/components/exams/instruments";
import { Allocation, RevisionLadder, SubjectTests, TimeStack } from "@/components/exams/report";
import { SpiralDish } from "@/components/exams/spiral";
import { SsSetup } from "@/components/exams/ss-setup";
import { useWorkspace } from "@/components/exams/workspace-context";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { runExamWhatIf } from "@/lib/exams/metrics";
import type { ExamKey } from "@/lib/exams/syllabus";

const REASON_LABEL: Record<string, string> = { concept: "Concept gap", recall: "Recall slip", calculation: "Calculation", misread: "Misread", guess: "Guessed", time: "Ran out of time" };

export function WorkspaceDashboard({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace();
  const m = ws.m;
  const [settings, setSettings] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const odds = useMemo(() => {
    if (!m || ws.focus) return null;
    return runExamWhatIf(exam, { hoursPerDay: m.hoursPerDay, questionsPerDay: m.questionsPerDay, testsPerWeek: m.tests28 / 4, accuracy: m.accuracy ?? 0.65, revision: m.revisedShare }, { currentShare: m.testShare ?? m.coverage * 0.6, daysToExam: m.daysToExam, tests: m.tests.length });
  }, [m, exam, ws.focus]);

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

  const base = `/${exam}`;
  const prefs = ws.state.prefs;
  const hoursTarget = prefs.hoursTarget ?? 12;
  const ssUnset = exam === "ss" && !prefs.ss;
  const scope = ws.subject ? ws.subject.name : "the whole exam";

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">
          <CalendarClock size={14} /> {ws.tree.title} · {m.daysToExam === null ? "set your exam date" : `${m.daysToExam} days to the exam`}
        </span>
        <h1 className="xw-title">
          {ws.subject ? <>{ws.subject.name}<em>.</em></> : exam === "pg" ? <>Ward <em>round.</em></> : <>Theatre <em>list.</em></>}
        </h1>
        <p className="xw-lede">
          {ws.subject
            ? `Every figure on this page is ${ws.subject.name} only — its topics, sessions, revisions, tests and mistakes. ~${Math.round(ws.subject.marks)} of ${ws.tree.totalMarks} marks. Change the subject from the menu at the top.`
            : exam === "pg"
              ? "NEET PG on its own: 19 subjects weighted by the paper, grand tests against MD/MS closing ranks. Pick one subject from the menu at the top to see only that subject."
              : "NEET SS on its own: your group's question paper as NBEMS sets it — the feeder PG-exit curriculum (or Critical Care / Medical Oncology topics) — plus the courses you are aiming at, for depth."}
        </p>
        <div className="xw-head-tools">
          <button type="button" className="xw-btn is-sm" aria-expanded={settings} onClick={() => setSettings((s) => !s)}><Settings2 size={14} /> Exam date &amp; daily target</button>
          {settings ? (
            <div className="xw-settings">
              <label className="xw-field">Exam date
                <input type="date" className="xw-input" defaultValue={prefs.targetDate ?? ""} onBlur={(e) => e.target.value !== (prefs.targetDate ?? "") && void ws.act({ action: "prefs", targetDate: e.target.value || null })} />
              </label>
              <label className="xw-field">Hours a day target
                <input type="number" className="xw-input" style={{ width: 90 }} min={2} max={16} step={0.5} defaultValue={hoursTarget} onBlur={(e) => Number(e.target.value) !== hoursTarget && void ws.act({ action: "prefs", hoursTarget: Number(e.target.value) })} />
              </label>
            </div>
          ) : null}
        </div>
      </header>

      {exam === "ss" ? (
        <details className="xw-card xw-ss" open={ssUnset}>
          <summary>{ssUnset ? "Choose your group and specialties first" : `${ws.tree.title.replace("NEET SS · ", "")} · ${ws.tree.subjects.length - 1} specialt${ws.tree.subjects.length === 2 ? "y" : "ies"} — change`}</summary>
          <SsSetup value={prefs.ss} saving={ws.saving} onSave={(v) => void ws.act({ action: "prefs", ss: v })} />
        </details>
      ) : null}

      {/* 1 · The dish and the index — no figure appears twice on this page. */}
      <section className="xw-hero2">
        <div className="xw-card xw-dish-card">
          <div className="xw-card-head">
            <h2>Spiral of topics</h2>
            <span className="xw-chip">{ws.subject ? `${ws.subject.chapters.length} chapters` : `${ws.tree.subjects.length} subjects`} · {m.items.length} topics</span>
          </div>
          <p className="xw-sub">{ws.subject ? "Chapters wind out from the centre in syllabus order." : "Subjects wind out from the centre, each in its own colour."}</p>
          {statusError ? <p className="xw-error" role="alert">{statusError}</p> : null}
          <SpiralDish m={m} base={base} onStatus={async (k, s) => setStatusError(await ws.setStatus(k, s))} />
        </div>
        <div className="xw-card xw-index">
          <div className="xw-index-top">
            <div>
              <span className="xw-index-label">Readiness for {scope}</span>
              <strong className="xw-index-num">{m.readiness}<small>/100</small></strong>
            </div>
            <span className={`xw-band b-${m.band.toLowerCase().replace(/[^a-z]/g, "")}`}>{m.band}</span>
          </div>
          <PartsLedger parts={m.parts} lever={m.lever} />
        </div>
      </section>

      {/* 2 · The detailed report */}
      <div className="xw-report-head">
        <h2>Report</h2>
        <p>{ws.subject ? `${ws.subject.name} only.` : "Whole exam."} Minutes, revision depth, allocation, tests and mistakes.</p>
      </div>

      <section className="xw-grid g2">
        <div className="xw-card">
          <h2>Where the minutes went</h2>
          <p className="xw-sub">30 days of sessions and revisions, stacked by activity. The dashed line is your {hoursTarget}h target.</p>
          <TimeStack m={m} hoursTarget={hoursTarget} />
        </div>
        <div className="xw-card">
          <h2>Revision depth</h2>
          <p className="xw-sub">Finished topics by how many times you have revised them, and what is due today.</p>
          <RevisionLadder m={m} base={base} />
        </div>
      </section>

      <section className="xw-sect xw-grid g2">
        <div className="xw-card">
          <h2>{ws.subject ? "Chapters: marks vs your time" : "Subjects: marks vs your time"}</h2>
          <p className="xw-sub">Fill = covered. The thin bars compare each one&apos;s share of the paper with your share of time on it; the tag shows over- or under-investment in points.{ws.subject ? "" : " Tap a subject to focus on it."}</p>
          <Allocation m={m} onPick={ws.subject ? undefined : (k) => ws.setFocus(k)} />
        </div>
        <div className="xw-card">
          <h2>{ws.subject ? `${ws.subject.name} tests` : "Grand tests"}</h2>
          <p className="xw-sub">{ws.subject ? "Only tests tagged with this subject." : "Every test, as a share of the maximum, against the target bands."}</p>
          <TestChart m={m} />
          {!ws.subject ? (
            <>
              <h3 className="xw-h3">Level by subject</h3>
              <SubjectTests m={m} onPick={(k) => ws.setFocus(k)} />
            </>
          ) : null}
        </div>
      </section>

      {!ws.subject && odds ? (
        <section className="xw-sect xw-card">
          <h2>{exam === "pg" ? "Seat odds" : "Target odds"}</h2>
          <p className="xw-sub">{exam === "pg" ? "Your test level and habits, projected to exam day against 2025 AIQ (General) closing ranks." : "Your test level and habits, projected to exam day against planning bars (NBEMS publishes no SS rank tables)."}</p>
          <TargetCards targets={odds.targets} rank={exam === "pg" && m.testShare !== null ? odds.rank : null} />
        </section>
      ) : null}

      <section className="xw-sect xw-grid g2">
        <div className="xw-card">
          <h2>Study calendar</h2>
          <p className="xw-sub">26 weeks of {ws.subject ? ws.subject.name : exam.toUpperCase()} minutes, sessions and revisions together.</p>
          <Heat m={m} />
        </div>
        <div className="xw-card">
          <h2>Mistake patterns</h2>
          <p className="xw-sub">Why questions went wrong{ws.subject ? ` in ${ws.subject.name}` : ""}, from your error log.</p>
          {m.reasons.length ? (
            <div className="xw-reasons">
              {m.reasons.map(([r, n]) => (
                <div key={r} style={{ "--v": n / Math.max(...m.reasons.map((x) => x[1])) } as React.CSSProperties}>
                  <span>{REASON_LABEL[r] ?? r}</span>
                  <i />
                  <b>{n}</b>
                </div>
              ))}
              <p className="xw-sub" style={{ margin: "6px 0 0" }}>{m.errors.filter((e) => e.resolved).length} of {m.errors.length} closed.</p>
            </div>
          ) : (
            <div className="xw-empty"><b>No mistakes logged</b>Log wrong answers on the Log &amp; errors tab — patterns appear here.</div>
          )}
        </div>
      </section>

      <section className="xw-sect">
        <ExamAIPanel exam={exam} scope={ws.subject?.name ?? null} />
      </section>
    </main>
  );
}
