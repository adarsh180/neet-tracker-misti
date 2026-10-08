"use client";

import { useState, type CSSProperties } from "react";

import type { Part, WorkspaceMetrics } from "@/lib/exams/metrics";

const toneOf = (s: number) => (s >= 0.7 ? "good" : s >= 0.4 ? "warn" : "bad");

/** One arc per subject: length = its share of the paper's marks, fill = marks done. */
export function SubjectRings({ m, center }: { m: WorkspaceMetrics; center: { value: number; label: string; sub?: string } }) {
  const [hot, setHot] = useState<string | null>(null);
  const total = m.subjects.reduce((s, x) => s + x.marks, 0) || 1;
  const gap = m.subjects.length > 1 ? 0.8 : 0;
  let cursor = 0;
  const arcs = m.subjects.map((s) => {
    const start = (cursor / total) * 100;
    const len = Math.max(0.4, (s.marks / total) * 100 - gap);
    cursor += s.marks;
    return { ...s, start, len };
  });
  const h = m.subjects.find((s) => s.key === hot) ?? null;
  return (
    <div className="xw-rings" onMouseLeave={() => setHot(null)}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle className="spin" cx="110" cy="110" r="104" />
        <g transform="rotate(-90 110 110)">
          {arcs.map((a, i) => {
            const fill = Math.max(0.25, a.len * (a.done / Math.max(1, a.marks)));
            const rev = a.len * (a.revised / Math.max(1, a.marks));
            return (
              <g key={a.key} className={hot && hot !== a.key ? "is-dim" : ""} onMouseEnter={() => setHot(a.key)} style={{ "--i": i } as CSSProperties}>
                <circle className="trk" cx="110" cy="110" r="88" strokeWidth="18" pathLength={100} strokeDasharray={`${a.len} ${100 - a.len}`} strokeDashoffset={-a.start} />
                <circle className="fil" cx="110" cy="110" r="88" strokeWidth="18" pathLength={100} stroke={`hsl(${a.hue}, 72%, 56%)`} strokeDasharray={`${fill} ${100 - fill}`} strokeDashoffset={-a.start} />
                {rev > 0.2 ? <circle className="rev" cx="110" cy="110" r="70" strokeWidth="4" pathLength={100} strokeDasharray={`${rev} ${100 - rev}`} strokeDashoffset={-a.start} /> : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="xw-ring-read">
        {h ? (
          <>
            <strong>{Math.round((h.done / Math.max(1, h.marks)) * 100)}<small>%</small></strong>
            <span>{h.name}</span>
            <em>{Math.round(h.done)} / {Math.round(h.marks)} marks · {h.doneItems}/{h.items} topics</em>
          </>
        ) : (
          <>
            <strong>{center.value}<small>/100</small></strong>
            <span>{center.label}</span>
            {center.sub ? <em>{center.sub}</em> : null}
          </>
        )}
      </div>
    </div>
  );
}

export function PartsLedger({ parts, lever }: { parts: Part[]; lever: { label: string; points: number } | null }) {
  return (
    <>
      <ul className="xw-ledger">
        {parts.map((p) => (
          <li key={p.key} className={`tone-${toneOf(p.score)} ${p.evidence ? "" : "no-ev"}`} style={{ "--s": p.score } as CSSProperties}>
            <span className="n"><b>{p.label}</b><small>{p.value}</small></span>
            <span className="b"><i /></span>
            <span className="p">{Math.round(p.score * p.weight * 10) / 10}<small>/{p.weight}</small></span>
            <span className="w">{p.evidence ? p.note : `No evidence yet — ${p.note}`}</span>
          </li>
        ))}
      </ul>
      {lever ? <p className="xw-lever">Biggest lever: <b>{lever.label.toLowerCase()}</b> — up to <b>+{lever.points}</b> points waiting.</p> : null}
    </>
  );
}

export function SubjectBars({ m, onPick }: { m: WorkspaceMetrics; onPick?: (key: string) => void }) {
  const list = [...m.subjects].sort((a, b) => b.marks - a.marks);
  return (
    <div className="xw-subjects">
      {list.map((s) => (
        <button key={s.key} type="button" className="xw-subj" onClick={() => onPick?.(s.key)} style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: onPick ? "pointer" : "default" }}>
          <span><b>{s.name}</b><small>{s.group} · {Math.round(s.marks)} marks</small></span>
          <span className="xw-bar" style={{ "--d": s.done / Math.max(1, s.marks), "--r": s.revised / Math.max(1, s.marks), "--h": s.hue } as CSSProperties}><i className="d" /><i className="r" /></span>
          <span className="num">{Math.round(s.done)}/{Math.round(s.marks)}</span>
        </button>
      ))}
      <div className="xw-legend"><span><i style={{ background: "var(--x-a1)" }} />done (by marks)</span><span><i style={{ background: "repeating-linear-gradient(135deg, var(--pl-ink-3) 0 2px, transparent 2px 5px)" }} />revised</span></div>
    </div>
  );
}

export function Heat({ m }: { m: WorkspaceMetrics }) {
  const lv = (x: number) => (x <= 0 ? 0 : x < 120 ? 1 : x < 300 ? 2 : x < 540 ? 3 : 4);
  return (
    <>
      <div className="xw-heat" role="img" aria-label="Study minutes per day, last 26 weeks">
        {m.calendar.map((d) => <i key={d.date} data-l={lv(d.minutes)} title={`${d.date} · ${(d.minutes / 60).toFixed(1)}h`} />)}
      </div>
      <div className="xw-legend"><span>less</span>{[1, 2, 3, 4].map((l) => <i key={l} style={{ background: l === 4 ? "var(--x-a2)" : `color-mix(in srgb, var(--x-a1) ${[0, 28, 55, 85][l]}%, transparent)` }} />)}<span>9h+ days</span></div>
    </>
  );
}

export function TestChart({ m }: { m: WorkspaceMetrics }) {
  const pts = m.tests.map((t) => ({ ...t, share: t.maxScore ? t.score / t.maxScore : 0 }));
  if (!pts.length) return <div className="xw-empty"><b>No tests yet</b>Log grand tests on the Tests tab — the line climbs toward the target bands.</div>;
  const W = 640;
  const H = 220;
  const x = (i: number) => (pts.length === 1 ? W / 2 : 34 + (i / (pts.length - 1)) * (W - 54));
  const y = (s: number) => H - 26 - s * (H - 46);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.share)}`).join(" ");
  const area = `${line} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  return (
    <div className="xw-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Test scores as share of maximum">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} className="grid" x1="34" x2={W - 20} y1={y(f)} y2={y(f)} />)}
        {m.targets.map((t) => (
          <g key={t.key}>
            <line className="tgt" x1="34" x2={W - 20} y1={y(t.share)} y2={y(t.share)} />
            <text x={W - 22} y={y(t.share) - 4} textAnchor="end">{t.label.split(" (")[0]} {Math.round(t.share * 100)}%</text>
          </g>
        ))}
        <path className="area" d={area} />
        <path className="line" d={line} />
        {pts.map((p, i) => <circle key={p.id} className="dot" cx={x(i)} cy={y(p.share)} r="4"><title>{`${p.takenAt} · ${p.name} · ${p.score}/${p.maxScore}`}</title></circle>)}
        {[0, 0.5, 1].map((f) => <text key={f} x="0" y={y(f) + 4}>{Math.round(f * 100)}%</text>)}
      </svg>
    </div>
  );
}

export function TargetCards({ targets, rank }: { targets: Array<{ key: string; label: string; share: number; note: string; p?: number }>; rank?: number | null }) {
  return (
    <div className="xw-odds">
      {targets.map((t, i) => (
        <div key={t.key} className="xw-odd" style={{ "--i": i, "--p": t.p ?? 0 } as CSSProperties}>
          <strong>{t.p === undefined ? `${Math.round(t.share * 100)}` : t.p < 0.1 ? (t.p * 100).toFixed(1) : Math.round(t.p * 100)}<small>{t.p === undefined ? "% of max" : "% chance"}</small></strong>
          <span>{t.label}</span>
          <em>needs ~{Math.round(t.share * 100)}% of max · {t.note}</em>
        </div>
      ))}
      {rank ? (
        <div className="xw-odd" style={{ "--i": targets.length, "--p": 0 } as CSSProperties}>
          <strong>{rank.toLocaleString("en-IN")}</strong>
          <span>Projected AIR</span>
          <em>from the what-if model at your current levers</em>
        </div>
      ) : null}
    </div>
  );
}
