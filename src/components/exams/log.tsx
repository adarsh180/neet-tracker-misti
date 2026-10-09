"use client";

import { useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";

import { useWorkspace } from "@/components/exams/workspace-context";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { ACTIVITIES } from "@/lib/exams/metrics";
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
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`);

export function WorkspaceLog({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace();
  const [logError, setLogError] = useState<string | null>(null);
  const [errError, setErrError] = useState<string | null>(null);
  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [chapterKey, setChapterKey] = useState("");
  const [activity, setActivity] = useState("study");
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");

  const subjects = ws.tree.subjects;
  const sKey = subjectKey ?? ws.focus ?? subjects[0]?.key ?? "";
  const subject = subjects.find((s) => s.key === sKey) ?? subjects[0];
  const chapter = subject?.chapters.find((c) => c.key === chapterKey) ?? null;
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of subjects) {
      map.set(s.key, s.name);
      for (const c of s.chapters) {
        map.set(c.key, c.name);
        for (const i of c.items) if (i.key !== c.key) map.set(i.key, i.label);
      }
    }
    return map;
  }, [subjects]);

  if (!ws.state) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening your log" />;

  const inView = (k: string) => !ws.focus || k === ws.focus;
  const logs = ws.state.records.logs.filter((l) => inView(l.subjectKey));
  const errors = ws.state.records.errors.filter((e) => inView(e.subjectKey));
  const todayMin = logs.filter((l) => l.logDate === today()).reduce((s, l) => s + l.minutes, 0) + ws.state.records.revisions.filter((r) => r.revisedOn === today() && inView(r.subjectKey)).reduce((s, r) => s + r.minutes, 0);

  const submitLog = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries());
    const minutes = Math.round((Number(hours) || 0) * 60 + (Number(mins) || 0));
    const res = await ws.act({ action: "log", ...f, subjectKey: sKey, chapterKey: chapterKey || null, activity, minutes });
    if (!res.ok) setLogError(res.error);
    else {
      setLogError(null);
      form.reset();
      setHours("");
      setMins("");
    }
  };
  const submitError = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const res = await ws.act({ action: "error", ...Object.fromEntries(new FormData(form).entries()) });
    if (!res.ok) setErrError(res.error);
    else {
      setErrError(null);
      form.reset();
    }
  };

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · log &amp; errors{ws.subject ? ` · ${ws.subject.name}` : ""}</span>
        <h1 className="xw-title">Log the day, <em>to the minute.</em></h1>
        <p className="xw-lede">
          Every session with its subject, chapter, topic and what kind of work it was. Minutes feed consistency and the time report; MCQs feed practice and accuracy; every wrong answer becomes a mistake to close. {hm(todayMin)} logged today{ws.subject ? ` in ${ws.subject.name}` : ""}.
        </p>
      </header>

      <section className="xw-grid g2">
        <form className="xw-card xw-form" onSubmit={submitLog} key={`log-${ws.focus ?? "all"}`}>
          <h2>Study session</h2>
          <div className="xw-acts" role="group" aria-label="What kind of work">
            {ACTIVITIES.map((a) => (
              <button key={a.key} type="button" aria-pressed={activity === a.key} onClick={() => setActivity(a.key)}>{a.label}</button>
            ))}
          </div>
          <div className="xw-row">
            <label className="xw-field">Subject
              <select className="xw-select" value={sKey} onChange={(e) => { setSubjectKey(e.target.value); setChapterKey(""); }}>
                {subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </label>
            <label className="xw-field">Chapter
              <select className="xw-select" value={chapterKey} onChange={(e) => setChapterKey(e.target.value)}>
                <option value="">Whole subject</option>
                {subject?.chapters.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </label>
            <label className="xw-field">Topic
              <select className="xw-select" name="itemKey" disabled={!chapter || (chapter.items.length === 1 && chapter.items[0].key === chapter.key)} defaultValue="">
                <option value="">Whole chapter</option>
                {chapter && !(chapter.items.length === 1 && chapter.items[0].key === chapter.key) ? chapter.items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>) : null}
              </select>
            </label>
          </div>
          <div className="xw-row">
            <label className="xw-field">Date<input className="xw-input" type="date" name="logDate" defaultValue={today()} max={today()} /></label>
            <label className="xw-field">Hours<input className="xw-input" type="number" min={0} max={16} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" /></label>
            <label className="xw-field">Minutes<input className="xw-input" type="number" min={0} max={959} value={mins} onChange={(e) => setMins(e.target.value)} placeholder="45" /></label>
          </div>
          <div className="xw-row">
            <label className="xw-field">MCQs done<input className="xw-input" type="number" name="questions" min={0} /></label>
            <label className="xw-field">Right<input className="xw-input" type="number" name="correct" min={0} /></label>
          </div>
          <label className="xw-field">Note<textarea className="xw-input" name="note" maxLength={4000} placeholder="What you covered, what to come back to" /></label>
          {logError ? <p className="xw-error" role="alert">{logError}</p> : null}
          <button type="submit" className="xw-btn is-primary" disabled={ws.saving}>Save session</button>
        </form>

        <form className="xw-card xw-form" onSubmit={submitError} key={`err-${ws.focus ?? "all"}`}>
          <h2>Log a mistake</h2>
          <div className="xw-row">
            <label className="xw-field">Subject
              <select className="xw-select" name="subjectKey" defaultValue={ws.focus ?? subjects[0]?.key}>{subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
            </label>
            <label className="xw-field">Why it went wrong
              <select className="xw-select" name="reason">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
          </div>
          <label className="xw-field">Topic / question<input className="xw-input" name="topic" maxLength={200} required placeholder="e.g. Kartagener syndrome — triad" /></label>
          <label className="xw-field">The fix<textarea className="xw-input" name="note" maxLength={4000} placeholder="The line you'll remember next time" /></label>
          {errError ? <p className="xw-error" role="alert">{errError}</p> : null}
          <button type="submit" className="xw-btn is-primary" disabled={ws.saving}>Save mistake</button>
        </form>
      </section>

      <section className="xw-sect xw-grid g2">
        <div className="xw-card">
          <h2>Sessions{ws.subject ? ` · ${ws.subject.name}` : ""}</h2>
          {logs.length ? (
            <div className="xw-scroll">
              <table className="xw-table">
                <thead><tr><th>Date</th><th>What</th><th>Kind</th><th className="num">Time</th><th className="num">MCQ</th><th /></tr></thead>
                <tbody>
                  {logs.slice(0, 60).map((l) => (
                    <tr key={l.id}>
                      <td>{l.logDate}</td>
                      <td>
                        {labels.get(l.subjectKey) ?? l.subjectKey}
                        {l.chapterKey ? <small className="xw-note">{labels.get(l.chapterKey) ?? "removed chapter"}{l.itemKey && l.itemKey !== l.chapterKey ? ` › ${labels.get(l.itemKey) ?? "removed topic"}` : ""}</small> : null}
                        {l.note ? <small className="xw-note">{l.note}</small> : null}
                      </td>
                      <td><span className="xw-pill">{ACTIVITIES.find((a) => a.key === l.activity)?.label ?? l.activity}</span></td>
                      <td className="num">{hm(l.minutes)}</td>
                      <td className="num">{l.questions ? `${l.correct ?? "—"}/${l.questions}` : "—"}</td>
                      <td><button type="button" className="xw-btn is-sm" aria-label="Delete session" onClick={() => void ws.act({ action: "deleteLog", id: l.id })}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="xw-empty"><b>No sessions {ws.subject ? `in ${ws.subject.name} ` : ""}yet</b>Your first session lights up the calendar and the time report.</div>}
        </div>
        <div className="xw-card">
          <h2>Error log{ws.subject ? ` · ${ws.subject.name}` : ""}</h2>
          {errors.length ? (
            <div className="xw-items" style={{ padding: 0 }}>
              {errors.slice(0, 60).map((e) => (
                <div key={e.id} className="xw-item" data-s={e.resolved ? "done" : "todo"}>
                  <span>
                    <b>{e.topic}</b>
                    <small>{labels.get(e.subjectKey) ?? e.subjectKey} · {REASONS.find((r) => r[0] === e.reason)?.[1] ?? e.reason}{e.note ? ` — ${e.note}` : ""}</small>
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
