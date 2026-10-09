"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type { WorkspaceMetrics } from "@/lib/exams/metrics";
import type { TreeSubject } from "@/lib/exams/syllabus";

type Item = WorkspaceMetrics["items"][number];

const C = 210;
const R = 192;
const HOLE = 44;

/**
 * The subject page's spiral: one Archimedean arm from the centre outward,
 * with every topic of the subject as a dot at equal spacing along it, in
 * syllabus order. Each chapter owns one stretch of the arm (numbered where it
 * starts, coloured as a band), so you can read exactly where a chapter sits
 * and which of its topics are done, being read, revised or due.
 */
export function ChapterSpiral({ subject, items, onStatus, onOpen }: { subject: TreeSubject; items: Item[]; onStatus: (key: string, status: string) => void; onOpen: (chapterKey: string) => void }) {
  const [hot, setHot] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [chHot, setChHot] = useState<string | null>(null);

  const layout = useMemo(() => {
    const byKey = new Map(items.map((i) => [i.key, i]));
    const ordered = subject.chapters.flatMap((c, ci) => c.items.map((it, ti) => {
      const m = byKey.get(it.key);
      return { key: it.key, label: it.label, marks: it.marks, chapterKey: c.key, chapter: c.name, ci, ti, status: m?.status ?? "todo", revisions: m?.revisions ?? 0, due: m?.due ?? false, lastRevisedAt: m?.lastRevisedAt ?? null };
    }));
    const n = ordered.length;
    const turns = Math.max(2.2, Math.min(5.5, Math.sqrt(n) / 2.1));
    const tMax = turns * 2 * Math.PI;
    const c = (R - HOLE) / tMax;
    // Arc length from 0 to θ is HOLE·θ + c·θ²/2; place dots at equal arc steps.
    const total = HOLE * tMax + (c * tMax * tMax) / 2;
    const step = total / Math.max(1, n);
    const at = (s: number) => (-HOLE + Math.sqrt(HOLE * HOLE + 2 * c * s)) / c;
    const pt = (t: number) => {
      const r = HOLE + c * t;
      return { x: C + r * Math.cos(t - Math.PI / 2), y: C + r * Math.sin(t - Math.PI / 2), r };
    };
    const avg = ordered.reduce((s, i) => s + i.marks, 0) / (n || 1) || 1;
    const size = Math.max(2.2, Math.min(7.5, step * 0.34));
    const dots = ordered.map((d, i) => {
      const t = at(step * (i + 0.5));
      return { ...d, t, ...pt(t), size: size * Math.max(0.75, Math.min(1.35, Math.sqrt(d.marks / avg))), i };
    });
    // One band of the arm per chapter: sampled path from its first to last dot.
    const bands = subject.chapters.map((ch, ci) => {
      const own = dots.filter((d) => d.ci === ci);
      if (!own.length) return null;
      const t0 = Math.max(0, own[0].t - (step / (HOLE + c * own[0].t)) * 0.5);
      const t1 = own[own.length - 1].t + (step / (HOLE + c * own[own.length - 1].t)) * 0.5;
      const pts: string[] = [];
      for (let k = 0; k <= 24; k++) {
        const p = pt(t0 + ((t1 - t0) * k) / 24);
        pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      const head = own[0];
      // Number badge just outside the arm where the chapter begins.
      const out = 1 + 13 / head.r;
      const done = own.filter((d) => d.status === "done").length;
      return { key: ch.key, name: ch.name, ci, path: `M${pts.join("L")}`, bx: C + (head.x - C) * out, by: C + (head.y - C) * out, total: own.length, done, revised: own.filter((d) => d.revisions > 0).length, due: own.filter((d) => d.due).length };
    }).filter((b): b is NonNullable<typeof b> => Boolean(b));
    return { dots, bands };
  }, [subject, items]);

  const hueOf = (ci: number) => (subject.hue + ((ci * 47) % 150) - 60 + 360) % 360;
  const sel = layout.dots.find((d) => d.key === (hot ?? pinned)) ?? null;
  const focusCh = chHot ?? sel?.chapterKey ?? null;
  if (!layout.dots.length) return null;
  const done = layout.dots.filter((d) => d.status === "done").length;

  return (
    <div className="xw-cs">
      <div className="xw-cs-plate" onMouseLeave={() => setHot(null)}>
        <svg viewBox="0 0 420 420" role="img" aria-label={`${subject.name}: ${done} of ${layout.dots.length} topics done across ${layout.bands.length} chapters`}>
          <circle className="well" cx={C} cy={C} r={R + 16} />
          {layout.bands.map((b) => (
            <path key={b.key} className={`band${focusCh === b.key ? " is-on" : focusCh ? " is-off" : ""}`} d={b.path} style={{ "--h": hueOf(b.ci) } as CSSProperties} />
          ))}
          {layout.dots.map((d) => (
            <g
              key={d.key}
              className={`dot s-${d.status}${d.due ? " is-due" : ""}${sel?.key === d.key ? " is-sel" : ""}${focusCh && focusCh !== d.chapterKey ? " is-off" : ""}`}
              style={{ "--h": hueOf(d.ci), "--t": `${Math.min(1.4, d.i * 0.012)}s` } as CSSProperties}
              onMouseEnter={() => setHot(d.key)}
              onClick={() => setPinned((p) => (p === d.key ? null : d.key))}
            >
              <title>{`${d.ci + 1}. ${d.chapter} › ${d.label}`}</title>
              {d.due ? <circle className="due" cx={d.x} cy={d.y} r={d.size + 3} /> : null}
              {Array.from({ length: Math.min(3, d.revisions) }, (_, k) => <circle key={k} className="ring" cx={d.x} cy={d.y} r={d.size + 1.6 + k * 1.6} />)}
              <circle className="core" cx={d.x} cy={d.y} r={d.size} />
              {d.status === "reading" ? <path className="half" d={`M${d.x - d.size},${d.y} a${d.size},${d.size} 0 0 0 ${d.size * 2},0 z`} /> : null}
            </g>
          ))}
          {layout.bands.map((b) => (
            <g key={`n${b.key}`} className={`num${focusCh === b.key ? " is-on" : ""}`} style={{ "--h": hueOf(b.ci) } as CSSProperties} onMouseEnter={() => setChHot(b.key)} onMouseLeave={() => setChHot(null)} onClick={() => onOpen(b.key)}>
              <circle cx={b.bx} cy={b.by} r={8} />
              <text x={b.bx} y={b.by} dy="0.35em">{b.ci + 1}</text>
            </g>
          ))}
        </svg>
        <div className="xw-cs-read" aria-live="polite">
          {sel ? (
            <>
              <em style={{ "--h": hueOf(sel.ci) } as CSSProperties}>{sel.ci + 1} · {sel.chapter}</em>
              <b>{sel.label}</b>
              <span>{sel.status === "done" ? "done" : sel.status === "reading" ? "reading" : "to do"} · {sel.revisions}× revised{sel.due ? " · due now" : ""}</span>
              <span>topic {sel.ti + 1} · ~{sel.marks.toFixed(2)} marks</span>
            </>
          ) : (
            <>
              <strong>{done}<small>/{layout.dots.length}</small></strong>
              <span>topics done</span>
            </>
          )}
        </div>
      </div>

      <div className="xw-cs-side">
        {pinned && sel ? (
          <div className="xw-spiral-card">
            <b>{sel.label}</b>
            <small>{sel.ci + 1}. {sel.chapter}</small>
            <div className="xw-seg" role="group" aria-label="Status">
              {["todo", "reading", "done"].map((s) => (
                <button key={s} type="button" aria-pressed={sel.status === s} onClick={() => onStatus(sel.key, s)}>{s === "todo" ? "To do" : s === "reading" ? "Reading" : "Done"}</button>
              ))}
            </div>
            <button type="button" className="xw-btn is-sm" onClick={() => onOpen(sel.chapterKey)}>Open chapter to revise or edit</button>
          </div>
        ) : <p className="xw-spiral-hint">Hover a dot for its topic; tap to pin it and set its status. Numbers mark where each chapter starts on the arm — tap one to open it below.</p>}
        <ol className="xw-cs-legend">
          {layout.bands.map((b) => (
            <li key={b.key} className={focusCh === b.key ? "is-on" : ""} style={{ "--h": hueOf(b.ci), "--p": b.done / b.total } as CSSProperties}>
              <button type="button" onMouseEnter={() => setChHot(b.key)} onMouseLeave={() => setChHot(null)} onFocus={() => setChHot(b.key)} onBlur={() => setChHot(null)} onClick={() => onOpen(b.key)}>
                <i>{b.ci + 1}</i>
                <span><b>{b.name}</b><small>{b.done}/{b.total} done · {b.revised} revised{b.due ? ` · ${b.due} due` : ""}</small></span>
                <span className="mini"><i /></span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
