"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";

import { useWorkspace } from "@/components/exams/use-workspace";
import { HeartLoader } from "@/components/pulse/heart-loader";
import type { ExamKey } from "@/lib/exams/syllabus";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const REASONS = [
  ["concept", "Concept gap"],
  ["recall", "Recall slip"],
  ["calculation", "Calculation"],
  ["misread", "Misread the question"],
  ["guess", "Guessed"],
  ["time", "Ran out of time"],
];

export function WorkspaceLog({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace(exam);
  const [logError, setLogError] = useState<string | null>(null);
  const [errError, setErrError] = useState<string | null>(null);
  if (!ws.state) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening your log" />;
  const subjects = ws.tree.subjects;
  const nameOf = (k: string) => subjects.find((s) => s.key === k)?.name ?? k;

  const submit = (action: string, setErr: (v: string | null) => void) => async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const res = await ws.act({ action, ...Object.fromEntries(new FormData(form).entries()) });
    if (!res.ok) setErr(res.error);
    else {
      setErr(null);
      form.reset();
    }
  };

  const logs = ws.state.records.logs;
  const errors = ws.state.records.errors;

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · log & errors</span>
        <h1 className="xw-title">Log the day, <em>close the gaps.</em></h1>
        <p className="xw-lede">Hours and MCQs feed consistency and practice; every wrong answer you log here becomes a mistake to close. Only {exam.toUpperCase()} — nothing reaches NEET UG.</p>
      </header>

      <section className="xw-grid g2">
        <form className="xw-card xw-form" onSubmit={submit("log", setLogError)}>
          <h2>Study session</h2>
          <div className="xw-row">
            <label className="xw-field">DATE<input className="xw-input" type="date" name="logDate" defaultValue={today()} /></label>
            <label className="xw-field">SUBJECT
              <select className="xw-select" name="subjectKey">{subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
            </label>
          </div>
          <div className="xw-row">
            <label className="xw-field">MINUTES<input className="xw-input" type="number" name="minutes" min={0} max={960} /></label>
            <label className="xw-field">MCQS<input className="xw-input" type="number" name="questions" min={0} /></label>
            <label className="xw-field">RIGHT<input className="xw-input" type="number" name="correct" min={0} /></label>
          </div>
          <label className="xw-field">NOTE<textarea className="xw-input" name="note" maxLength={4000} /></label>
          {logError ? <p className="xw-error" role="alert">{logError}</p> : null}
          <button type="submit" className="xw-btn is-primary" disabled={ws.saving}>Save session</button>
        </form>

        <form className="xw-card xw-form" onSubmit={submit("error", setErrError)}>
          <h2>Log a mistake</h2>
          <div className="xw-row">
            <label className="xw-field">SUBJECT
              <select className="xw-select" name="subjectKey">{subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
            </label>
            <label className="xw-field">WHY IT WENT WRONG
              <select className="xw-select" name="reason">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
          </div>
          <label className="xw-field">TOPIC / QUESTION<input className="xw-input" name="topic" maxLength={200} required placeholder="e.g. Kartagener syndrome — triad" /></label>
          <label className="xw-field">THE FIX<textarea className="xw-input" name="note" maxLength={4000} placeholder="The line you'll remember next time" /></label>
          {errError ? <p className="xw-error" role="alert">{errError}</p> : null}
          <button type="submit" className="xw-btn is-primary" disabled={ws.saving}>Save mistake</button>
        </form>
      </section>

      <section className="xw-sect xw-grid g2">
        <div className="xw-card">
          <h2>Recent sessions</h2>
          {logs.length ? (
            <div className="xw-scroll">
              <table className="xw-table">
                <thead><tr><th>DATE</th><th>SUBJECT</th><th className="num">MIN</th><th className="num">MCQ</th><th className="num">RIGHT</th><th /></tr></thead>
                <tbody>
                  {logs.slice(0, 40).map((l) => (
                    <tr key={l.id}>
                      <td>{l.logDate}</td>
                      <td>{nameOf(l.subjectKey)}</td>
                      <td className="num">{l.minutes}</td>
                      <td className="num">{l.questions}</td>
                      <td className="num">{l.correct ?? "—"}</td>
                      <td><button type="button" className="xw-btn is-sm" aria-label="Delete session" onClick={() => void ws.act({ action: "deleteLog", id: l.id })}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="xw-empty"><b>No sessions yet</b>Your first session lights up the heatmap.</div>}
        </div>
        <div className="xw-card">
          <h2>Error log</h2>
          {errors.length ? (
            <div className="xw-items" style={{ padding: 0 }}>
              {errors.slice(0, 60).map((e) => (
                <div key={e.id} className="xw-item" data-s={e.resolved ? "done" : "todo"}>
                  <span>
                    <b>{e.topic}</b>
                    <small>{nameOf(e.subjectKey)} · {REASONS.find((r) => r[0] === e.reason)?.[1] ?? e.reason}{e.note ? ` — ${e.note}` : ""}</small>
                  </span>
                  <span className="acts">
                    <button type="button" className={`xw-btn is-sm ${e.resolved ? "" : "is-primary"}`} onClick={() => void ws.act({ action: "resolveError", id: e.id, resolved: !e.resolved })}>
                      <Check size={13} /> {e.resolved ? "Closed" : "Close"}
                    </button>
                    <button type="button" className="xw-btn is-sm" aria-label="Delete mistake" onClick={() => void ws.act({ action: "deleteError", id: e.id })}><Trash2 size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
          ) : <div className="xw-empty"><b>No mistakes logged</b>Every wrong answer you log becomes a pattern on the dashboard.</div>}
        </div>
      </section>
    </main>
  );
}
