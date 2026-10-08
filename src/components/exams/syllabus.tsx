"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

import { useWorkspace } from "@/components/exams/use-workspace";
import { HeartLoader } from "@/components/pulse/heart-loader";
import type { ProgressRow } from "@/lib/exams/metrics";
import type { ExamKey } from "@/lib/exams/syllabus";

const STATES = [
  { v: "todo", label: "To do" },
  { v: "reading", label: "Reading" },
  { v: "done", label: "Done" },
];

export function WorkspaceSyllabus({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace(exam);
  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => new Map((ws.state?.records.progress ?? []).map((r) => [r.itemKey, r])), [ws.state]);

  if (!ws.state) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening the syllabus" />;

  const subject = ws.tree.subjects.find((s) => s.key === subjectKey) ?? ws.tree.subjects[0];

  // Optimistic: update locally first, roll back if the save fails.
  const write = async (itemKey: string, patch: Partial<ProgressRow>, body: Record<string, unknown>) => {
    setError(null);
    const prev = rows.get(itemKey);
    const next: ProgressRow = { itemKey, status: "todo", revisions: 0, lastRevisedAt: null, questions: 0, ...prev, ...patch };
    ws.setState((s) => (s ? { ...s, records: { ...s.records, progress: [...s.records.progress.filter((r) => r.itemKey !== itemKey), next] } } : s));
    const res = await ws.act({ action: "progress", itemKey, ...body }, { reload: false });
    if (!res.ok) {
      setError(res.error);
      ws.setState((s) => (s ? { ...s, records: { ...s.records, progress: [...s.records.progress.filter((r) => r.itemKey !== itemKey), ...(prev ? [prev] : [])] } } : s));
    } else if (res.data?.row) {
      ws.setState((s) => (s ? { ...s, records: { ...s.records, progress: [...s.records.progress.filter((r) => r.itemKey !== itemKey), res.data.row] } } : s));
    }
  };

  const chapterStats = (items: Array<{ key: string; marks: number }>) => {
    const marks = items.reduce((s, i) => s + i.marks, 0) || 1;
    const done = items.reduce((s, i) => s + (rows.get(i.key)?.status === "done" ? i.marks : 0), 0);
    const rev = items.reduce((s, i) => s + ((rows.get(i.key)?.revisions ?? 0) > 0 ? i.marks : 0), 0);
    return { d: done / marks, r: rev / marks, n: items.filter((i) => rows.get(i.key)?.status === "done").length };
  };

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · syllabus</span>
        <h1 className="xw-title">Every topic, <em>by its marks.</em></h1>
        <p className="xw-lede">Mark a topic reading or done, and press “Revised” each time you revise it — revisions are what PG and SS reward. Each chapter shows what it is worth in the paper.</p>
      </header>

      <div className="xw-subjtabs" role="tablist" aria-label="Subjects">
        {ws.tree.subjects.map((s) => {
          const st = chapterStats(s.chapters.flatMap((c) => c.items));
          return (
            <button key={s.key} type="button" role="tab" aria-pressed={s.key === subject.key} onClick={() => setSubjectKey(s.key)} style={{ "--h": s.hue } as CSSProperties}>
              <i />{s.name} <span style={{ color: "var(--pl-ink-3)" }}>{Math.round(st.d * 100)}%</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="xw-error" role="alert">{error}</p> : null}

      <section className="xw-card xw-sect">
        <h2>{subject.name}</h2>
        <p className="xw-sub">{subject.group} · worth ~{Math.round(subject.marks)} of {ws.tree.totalMarks} marks · {subject.chapters.length} chapters</p>
        {subject.chapters.map((c) => {
          const st = chapterStats(c.items);
          const isOpen = open[c.key] ?? false;
          return (
            <div key={c.key} className="xw-chapter">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [c.key]: !isOpen }))}>
                <span><b>{c.name}</b><small>~{c.marks.toFixed(1)} marks · {st.n}/{c.items.length} done</small></span>
                <span className="xw-bar" style={{ "--d": st.d, "--r": st.r, "--h": subject.hue } as CSSProperties}><i className="d" /><i className="r" /></span>
                <span className="pct">{Math.round(st.d * 100)}%</span>
                <ChevronDown size={16} style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .3s" }} />
              </button>
              {isOpen ? (
                <div className="xw-items">
                  {c.items.map((it) => {
                    const r = rows.get(it.key);
                    const status = r?.status ?? "todo";
                    return (
                      <div key={it.key} className="xw-item" data-s={status}>
                        <span>
                          <b>{it.label}</b>
                          <small>~{it.marks.toFixed(2)} marks{r?.lastRevisedAt ? ` · last revised ${new Date(r.lastRevisedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</small>
                        </span>
                        <span className="acts">
                          <span className="xw-seg" role="group" aria-label={`Status of ${it.label}`}>
                            {STATES.map((s) => (
                              <button key={s.v} type="button" aria-pressed={status === s.v} onClick={() => status !== s.v && void write(it.key, { status: s.v }, { status: s.v })}>{s.label}</button>
                            ))}
                          </span>
                          <button type="button" className="xw-rev" onClick={() => void write(it.key, { status: "done", revisions: (r?.revisions ?? 0) + 1, lastRevisedAt: new Date().toISOString() }, { revise: true })} aria-label={`Log a revision of ${it.label}`}>
                            <RotateCcw size={12} /> Revised <b>×{r?.revisions ?? 0}</b>
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </main>
  );
}
