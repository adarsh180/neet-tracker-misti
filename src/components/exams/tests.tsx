"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { TestChart } from "@/components/exams/instruments";
import { useWorkspace } from "@/components/exams/use-workspace";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { computeWorkspace, rankForShare } from "@/lib/exams/metrics";
import type { ExamKey } from "@/lib/exams/syllabus";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function WorkspaceTests({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace(exam);
  const [error, setError] = useState<string | null>(null);
  const m = useMemo(() => (ws.state ? computeWorkspace({ tree: ws.tree, records: ws.state.records, targetDate: ws.state.prefs.targetDate }) : null), [ws.state, ws.tree]);
  if (!ws.state || !m) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening tests" />;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const res = await ws.act({ action: "test", ...Object.fromEntries(f.entries()) });
    if (!res.ok) setError(res.error);
    else {
      setError(null);
      form.reset();
    }
  };

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · tests</span>
        <h1 className="xw-title">Grand <em>tests.</em></h1>
        <p className="xw-lede">Log every grand test, subject test and mock. Scores are compared as a share of the maximum, so a {ws.tree.questions}-question paper and a 100-question test read on one scale.</p>
      </header>

      <section className="xw-grid g2">
        <form className="xw-card xw-form" onSubmit={submit}>
          <h2>Record a test</h2>
          <div className="xw-row">
            <label className="xw-field">NAME<input className="xw-input" name="name" maxLength={160} placeholder="GT 04" required /></label>
            <label className="xw-field">TYPE
              <select className="xw-select" name="kind" defaultValue="grand"><option value="grand">Grand test</option><option value="subject">Subject test</option><option value="mock">Mock</option></select>
            </label>
            <label className="xw-field">DATE<input className="xw-input" type="date" name="takenAt" defaultValue={today()} /></label>
          </div>
          <div className="xw-row">
            <label className="xw-field">SCORE<input className="xw-input" type="number" step="any" name="score" required /></label>
            <label className="xw-field">MAX<input className="xw-input" type="number" step="any" name="maxScore" defaultValue={ws.tree.totalMarks} required /></label>
            <label className="xw-field">RIGHT<input className="xw-input" type="number" name="correct" min={0} /></label>
            <label className="xw-field">WRONG<input className="xw-input" type="number" name="wrong" min={0} /></label>
            <label className="xw-field">SKIPPED<input className="xw-input" type="number" name="skipped" min={0} /></label>
          </div>
          <label className="xw-field">NOTES<textarea className="xw-input" name="note" maxLength={4000} placeholder="Where marks leaked, time per section…" /></label>
          {error ? <p className="xw-error" role="alert">{error}</p> : null}
          <button type="submit" className="xw-btn is-primary" disabled={ws.saving}>{ws.saving ? "Saving…" : "Save test"}</button>
        </form>
        <div className="xw-card">
          <h2>Trend</h2>
          <p className="xw-sub">Recency-weighted level: <b style={{ color: "var(--pl-ink)" }}>{m.testShare === null ? "—" : `${Math.round(m.testShare * 100)}%`}</b>{exam === "pg" && m.testShare !== null ? ` ≈ AIR ${rankForShare(m.testShare).toLocaleString("en-IN")} on 2025 data` : ""} · accuracy {m.accuracy === null ? "—" : `${Math.round(m.accuracy * 100)}%`}</p>
          <TestChart m={m} />
        </div>
      </section>

      <section className="xw-sect xw-card">
        <h2>All tests</h2>
        {m.tests.length ? (
          <div className="xw-scroll">
            <table className="xw-table">
              <thead><tr><th>DATE</th><th>TEST</th><th className="num">SCORE</th><th className="num">%</th><th className="num">R / W / S</th>{exam === "pg" ? <th className="num">≈ AIR</th> : null}<th /></tr></thead>
              <tbody>
                {[...m.tests].reverse().map((t) => (
                  <tr key={t.id}>
                    <td>{t.takenAt}</td>
                    <td>{t.name} <span className="xw-pill">{t.kind}</span></td>
                    <td className="num">{t.score}/{t.maxScore}</td>
                    <td className="num">{Math.round((t.score / t.maxScore) * 100)}%</td>
                    <td className="num">{t.correct ?? "—"} / {t.wrong ?? "—"} / {t.skipped ?? "—"}</td>
                    {exam === "pg" ? <td className="num">{rankForShare(t.score / t.maxScore).toLocaleString("en-IN")}</td> : null}
                    <td><button type="button" className="xw-btn is-sm" aria-label={`Delete ${t.name}`} onClick={() => void ws.act({ action: "deleteTest", id: t.id })}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="xw-empty"><b>No tests yet</b>Your first grand test sets the baseline for the seat odds.</div>
        )}
      </section>
    </main>
  );
}
