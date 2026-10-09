"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { TestChart } from "@/components/exams/instruments";
import { SubjectTests } from "@/components/exams/report";
import { useWorkspace } from "@/components/exams/workspace-context";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { rankForShare } from "@/lib/exams/metrics";
import type { ExamKey } from "@/lib/exams/syllabus";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function WorkspaceTests({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace();
  const m = ws.m;
  const [error, setError] = useState<string | null>(null);
  if (!ws.state || !m) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening tests" />;

  const nameOf = (k: string | null) => (k ? ws.tree.subjects.find((s) => s.key === k)?.name ?? "Removed subject" : "Full paper");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const res = await ws.act({ action: "test", ...Object.fromEntries(new FormData(form).entries()) });
    if (!res.ok) setError(res.error);
    else {
      setError(null);
      form.reset();
    }
  };

  const shares = m.tests.map((t) => t.score / t.maxScore);
  const best = shares.length ? Math.max(...shares) : null;
  const last = shares.at(-1) ?? null;
  const prev = shares.length > 1 ? shares.at(-2)! : null;
  const timed = m.tests.filter((t) => t.minutes && (t.correct ?? 0) + (t.wrong ?? 0) > 0);
  const perQ = timed.length ? timed.reduce((s, t) => s + t.minutes!, 0) / timed.reduce((s, t) => s + (t.correct ?? 0) + (t.wrong ?? 0), 0) : null;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}`);

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · tests{ws.subject ? ` · ${ws.subject.name}` : ""}</span>
        <h1 className="xw-title">{ws.subject ? <>{ws.subject.name} <em>tests.</em></> : <>Grand <em>tests.</em></>}</h1>
        <p className="xw-lede">
          Tag each test with its subject — or leave it as a full paper. Scores read as a share of the maximum, so a {ws.tree.questions}-question paper and a 50-question subject test sit on one scale.
          {ws.subject ? ` Showing ${ws.subject.name} tests only.` : ""}
        </p>
      </header>

      <dl className="xw-figs">
        <div><dt>Recent level</dt><dd>{pct(m.testShare)}<small>{m.testShare === null ? "" : "%"}</small></dd><span>recency-weighted{exam === "pg" && m.testShare !== null && !ws.subject ? ` · ≈ AIR ${rankForShare(m.testShare).toLocaleString("en-IN")}` : ""}</span></div>
        <div><dt>Last vs previous</dt><dd className={last !== null && prev !== null ? (last >= prev ? "t-good" : "t-bad") : ""}>{last !== null && prev !== null ? `${last >= prev ? "+" : "−"}${Math.abs(Math.round((last - prev) * 100))}` : "—"}<small>{prev !== null ? " pts" : ""}</small></dd><span>{last !== null ? `last ${pct(last)}%` : "no tests yet"}</span></div>
        <div><dt>Best</dt><dd>{pct(best)}<small>{best === null ? "" : "%"}</small></dd><span>{m.tests.length} test{m.tests.length === 1 ? "" : "s"} in view</span></div>
        <div><dt>Accuracy</dt><dd>{pct(m.accuracy)}<small>{m.accuracy === null ? "" : "%"}</small></dd><span>right ÷ attempted</span></div>
        <div><dt>Pace</dt><dd>{perQ === null ? "—" : perQ.toFixed(2)}<small>{perQ === null ? "" : " min/Q"}</small></dd><span>the paper allows ≈ {((exam === "pg" ? 210 : 150) / ws.tree.questions).toFixed(2)} min/Q</span></div>
      </dl>

      <section className="xw-sect xw-grid g2">
        <form className="xw-card xw-form" onSubmit={submit} key={ws.focus ?? "all"}>
          <h2>Record a test</h2>
          <div className="xw-row">
            <label className="xw-field">Name<input className="xw-input" name="name" maxLength={160} placeholder={ws.subject ? `${ws.subject.name} test 03` : "GT 04"} required /></label>
            <label className="xw-field">Subject
              <select className="xw-select" name="subjectKey" defaultValue={ws.focus ?? ""}>
                <option value="">Full paper (grand test)</option>
                {ws.tree.subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
            <label className="xw-field">Date<input className="xw-input" type="date" name="takenAt" defaultValue={today()} max={today()} /></label>
          </div>
          <div className="xw-row">
            <label className="xw-field">Score<input className="xw-input" type="number" step="any" name="score" required /></label>
            <label className="xw-field">Out of<input className="xw-input" type="number" step="any" name="maxScore" defaultValue={ws.focus ? 200 : ws.tree.totalMarks} required /></label>
            <label className="xw-field">Minutes taken<input className="xw-input" type="number" name="minutes" min={0} max={600} /></label>
          </div>
          <div className="xw-row">
            <label className="xw-field">Right<input className="xw-input" type="number" name="correct" min={0} /></label>
            <label className="xw-field">Wrong<input className="xw-input" type="number" name="wrong" min={0} /></label>
            <label className="xw-field">Skipped<input className="xw-input" type="number" name="skipped" min={0} /></label>
          </div>
          <label className="xw-field">Notes<textarea className="xw-input" name="note" maxLength={4000} placeholder="Where marks leaked, time per section…" /></label>
          {error ? <p className="xw-error" role="alert">{error}</p> : null}
          <button type="submit" className="xw-btn is-primary" disabled={ws.saving}>{ws.saving ? "Saving…" : "Save test"}</button>
        </form>
        <div className="xw-card">
          <h2>Trend</h2>
          <p className="xw-sub">Each test as a share of its maximum, with the target bands.</p>
          <TestChart m={m} />
          {!ws.subject ? (
            <>
              <h3 className="xw-h3">Level by subject</h3>
              <SubjectTests m={m} onPick={(k) => ws.setFocus(k)} />
            </>
          ) : null}
        </div>
      </section>

      <section className="xw-sect xw-card">
        <h2>{ws.subject ? `${ws.subject.name} tests` : "All tests"}</h2>
        {m.tests.length ? (
          <div className="xw-scroll">
            <table className="xw-table">
              <thead><tr><th>Date</th><th>Test</th><th>Subject</th><th className="num">Score</th><th className="num">%</th><th className="num">R / W / S</th><th className="num">Min</th>{exam === "pg" ? <th className="num">≈ AIR</th> : null}<th /></tr></thead>
              <tbody>
                {[...m.tests].reverse().map((t) => (
                  <tr key={t.id}>
                    <td>{t.takenAt}</td>
                    <td>{t.name}{t.note ? <small className="xw-note">{t.note}</small> : null}</td>
                    <td>{nameOf(t.subjectKey)}</td>
                    <td className="num">{t.score}/{t.maxScore}</td>
                    <td className="num">{Math.round((t.score / t.maxScore) * 100)}%</td>
                    <td className="num">{t.correct ?? "—"} / {t.wrong ?? "—"} / {t.skipped ?? "—"}</td>
                    <td className="num">{t.minutes ?? "—"}</td>
                    {exam === "pg" ? <td className="num">{t.subjectKey ? "—" : rankForShare(t.score / t.maxScore).toLocaleString("en-IN")}</td> : null}
                    <td><button type="button" className="xw-btn is-sm" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete “${t.name}”?`) && void ws.act({ action: "deleteTest", id: t.id })}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="xw-empty"><b>No tests {ws.subject ? `in ${ws.subject.name} ` : ""}yet</b>{ws.subject ? "Record one above with this subject selected." : "Your first grand test sets the baseline for the seat odds."}</div>
        )}
      </section>
    </main>
  );
}
