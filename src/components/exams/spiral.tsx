"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";

import type { WorkspaceMetrics } from "@/lib/exams/metrics";

type Item = WorkspaceMetrics["items"][number];

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const R = 186;
const C = 200;

/**
 * Spiral dots: every topic of the subject in focus (or of the whole exam) laid
 * on a sunflower spiral, in syllabus order, so chapters sit in bands from the
 * centre out. Dot size = the marks it carries; filled = done, half = reading,
 * rings = revisions, a pulse = revision due today.
 */
export function SpiralDish({ m, base, onStatus }: { m: WorkspaceMetrics; base: string; onStatus?: (key: string, status: string) => void }) {
  const [hot, setHot] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const dots = useMemo(() => {
    const n = m.items.length || 1;
    const avgMarks = m.items.reduce((s, i) => s + i.marks, 0) / n || 1;
    // An open centre (the readout sits there); topics fill the ring outward at equal area each.
    const hole = R * 0.34;
    const step = Math.sqrt((R * R - hole * hole) / (n + 0.5));
    const chapterIndex = new Map<string, number>();
    m.items.forEach((i) => !chapterIndex.has(i.chapterKey) && chapterIndex.set(i.chapterKey, chapterIndex.size));
    const single = new Set(m.items.map((i) => i.subjectKey)).size === 1;
    return m.items.map((it, i) => {
      const r = Math.sqrt(hole * hole + step * step * (i + 0.5));
      const a = i * GOLDEN;
      const size = Math.max(1.4, Math.min(step * 0.52, step * 0.36 * Math.sqrt(it.marks / avgMarks)));
      // Inside one subject, neighbouring chapters shift hue a little so the bands read apart.
      const ci = chapterIndex.get(it.chapterKey) ?? 0;
      const hue = single ? (it.hue + ((ci % 5) - 2) * 14 + 360) % 360 : it.hue;
      return { ...it, x: C + r * Math.cos(a), y: C + r * Math.sin(a), size, hue, i };
    });
  }, [m.items]);

  const sel = dots.find((d) => d.key === (hot ?? pinned)) ?? null;
  const doneMarks = m.items.reduce((s, i) => s + (i.status === "done" ? i.marks : 0), 0);
  const allMarks = m.items.reduce((s, i) => s + i.marks, 0) || 1;
  const counts = { done: m.items.filter((i) => i.status === "done").length, reading: m.items.filter((i) => i.status === "reading").length, due: m.dueItems.length };

  if (!m.items.length) return <div className="xw-empty"><b>No topics in view</b>Add a chapter on the Syllabus tab, or pick another subject.</div>;

  return (
    <div className="xw-spiral">
      <div className="xw-spiral-plate" onMouseLeave={() => setHot(null)}>
        <svg viewBox="0 0 400 400" role="img" aria-label={`${counts.done} of ${m.items.length} topics done`}>
          <circle className="rim" cx={C} cy={C} r={R + 10} />
          <circle className="rim2" cx={C} cy={C} r={R + 4} />
          <circle className="arc" cx={C} cy={C} r={R + 10} pathLength={100} strokeDasharray={`${(doneMarks / allMarks) * 100} 100`} transform={`rotate(-90 ${C} ${C})`} />
          {dots.map((d) => (
            <g
              key={d.key}
              className={`dot s-${d.status}${d.due ? " is-due" : ""}${sel?.key === d.key ? " is-sel" : ""}`}
              style={{ "--h": d.hue, "--t": `${Math.min(1.3, d.i * (1.3 / Math.max(1, dots.length)))}s` } as CSSProperties}
              onMouseEnter={() => setHot(d.key)}
              onClick={() => setPinned((p) => (p === d.key ? null : d.key))}
            >
              {d.due ? <circle className="due" cx={d.x} cy={d.y} r={d.size + 3.2} /> : null}
              {Array.from({ length: Math.min(3, d.revisions) }, (_, k) => <circle key={k} className="ring" cx={d.x} cy={d.y} r={d.size + 1.6 + k * 1.7} />)}
              <circle className="core" cx={d.x} cy={d.y} r={d.size} />
              {d.status === "reading" ? <path className="half" d={`M${d.x - d.size},${d.y} a${d.size},${d.size} 0 0 0 ${d.size * 2},0 z`} /> : null}
            </g>
          ))}
        </svg>
        <div className="xw-spiral-read" aria-live="polite">
          {sel ? <Readout d={sel} /> : (
            <>
              <strong>{Math.round((doneMarks / allMarks) * 100)}<small>%</small></strong>
              <span>of the marks covered</span>
            </>
          )}
        </div>
      </div>
      <div className="xw-spiral-side">
        <dl className="xw-spiral-counts">
          <div><dt>Done</dt><dd>{counts.done}<small>/{m.items.length}</small></dd></div>
          <div><dt>Reading</dt><dd>{counts.reading}</dd></div>
          <div><dt>Revision due</dt><dd className={counts.due ? "t-warn" : ""}>{counts.due}</dd></div>
        </dl>
        {pinned && sel ? (
          <div className="xw-spiral-card">
            <b>{sel.label}</b>
            <small>{sel.subject} › {sel.chapter}</small>
            <div className="xw-seg" role="group" aria-label="Status">
              {["todo", "reading", "done"].map((s) => (
                <button key={s} type="button" aria-pressed={sel.status === s} onClick={() => onStatus?.(sel.key, s)}>{s === "todo" ? "To do" : s === "reading" ? "Reading" : "Done"}</button>
              ))}
            </div>
            <Link className="xw-btn is-sm" href={`${base}/syllabus?open=${encodeURIComponent(sel.chapterKey)}`}>Log a revision in the syllabus</Link>
          </div>
        ) : (
          <p className="xw-spiral-hint">Hover a dot to read it; tap to pin it and change its status here.</p>
        )}
        <ul className="xw-spiral-key">
          <li><i className="k-todo" />to do</li>
          <li><i className="k-reading" />reading</li>
          <li><i className="k-done" />done</li>
          <li><i className="k-ring" />each ring = a revision</li>
          <li><i className="k-due" />revision due</li>
          <li><i className="k-size" />size = marks</li>
        </ul>
      </div>
    </div>
  );
}

function Readout({ d }: { d: Item }) {
  const last = d.lastRevisedAt ? new Date(d.lastRevisedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  return (
    <>
      <em style={{ "--h": d.hue } as CSSProperties}>{d.chapter}</em>
      <b>{d.label}</b>
      <span>
        {d.status === "done" ? "done" : d.status === "reading" ? "reading" : "to do"} · {d.revisions}× revised{last ? ` · last ${last}` : ""}
      </span>
      <span>~{d.marks.toFixed(2)} marks{d.due ? " · due now" : ""}</span>
    </>
  );
}
