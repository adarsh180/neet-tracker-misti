"use client";

import type { CSSProperties } from "react";

import type { Part, WorkspaceMetrics } from "@/lib/exams/metrics";

const toneOf = (s: number) => (s >= 0.7 ? "good" : s >= 0.4 ? "warn" : "bad");

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
  // Target labels sit above their line, nudged apart when the bands are close.
  const labelled = [...m.targets].sort((a, b) => b.share - a.share).reduce<Array<(typeof m.targets)[number] & { ly: number }>>((acc, t) => {
    const want = y(t.share) - 4;
    const prev = acc.at(-1);
    return [...acc, { ...t, ly: prev && want - prev.ly < 12 ? prev.ly + 12 : want }];
  }, []);
  const area = `${line} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  return (
    <div className="xw-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Test scores as share of maximum">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} className="grid" x1="34" x2={W - 20} y1={y(f)} y2={y(f)} />)}
        {labelled.map((t) => (
          <g key={t.key}>
            <line className="tgt" x1="34" x2={W - 20} y1={y(t.share)} y2={y(t.share)} />
            <text x={W - 22} y={t.ly} textAnchor="end">{t.label.split(" (")[0]} {Math.round(t.share * 100)}%</text>
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
