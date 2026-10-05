"use client";

import { useMemo, useState } from "react";

import { useWidth } from "@/components/pulse/use-width";
import type { PulseTest } from "@/lib/pulse-insights";

type Point = { t: number; score: number; kind: "attempt" | "mock"; label: string; sub: string };

const t = (iso: string) => new Date(iso).getTime();
const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Every real NEET attempt (big markers) and every mock scaled to /720 (small
 * markers), on one timeline up to exam day, against the three seat lines.
 */
export function ScoreHistory({
  attempts,
  tests,
  exam,
  thresholds,
}: {
  attempts: Array<{ year: number; score: number }>;
  tests: PulseTest[];
  exam: string;
  thresholds: Array<{ label: string; score: number; key: string }>;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(1000);
  const [hover, setHover] = useState<Point | null>(null);

  const points = useMemo<Point[]>(() => {
    const a: Point[] = attempts.map((x) => ({ t: t(`${x.year}-05-05T00:00:00Z`), score: x.score, kind: "attempt", label: `NEET ${x.year}`, sub: "real attempt" }));
    const m: Point[] = tests
      .filter((x) => x.score720 > 0)
      .map((x) => ({ t: t(`${x.date}T00:00:00Z`), score: x.score720, kind: "mock", label: x.name, sub: `${x.type.replaceAll("_", " ").toLowerCase()} · scaled to /720` }));
    return [...a, ...m].sort((p, q) => p.t - q.t);
  }, [attempts, tests]);

  const H = 300;
  const pad = { l: 44, r: 16, t: 20, b: 30 };
  const plotW = Math.max(120, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const start = points.length ? Math.min(...points.map((p) => p.t)) - 30 * 86_400_000 : t(exam) - 365 * 86_400_000;
  const end = t(exam) + 20 * 86_400_000;
  const x = (ms: number) => pad.l + ((ms - start) / (end - start)) * plotW;
  const y = (s: number) => pad.t + plotH - (s / 720) * plotH;
  const realPath = points
    .filter((p) => p.kind === "attempt")
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.score).toFixed(1)}`)
    .join(" ");
  const years = [];
  for (let yr = new Date(start).getUTCFullYear() + 1; yr <= new Date(end).getUTCFullYear(); yr++) years.push(yr);

  return (
    <div className="sh" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="NEET scores over time against seat thresholds">
        {[0, 180, 360, 540, 720].map((v) => (
          <g key={v} className="sh-grid">
            <line x1={pad.l} x2={pad.l + plotW} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {thresholds.map((th) => (
          <g key={th.key} className={`sh-th sh-th-${th.key}`}>
            <line x1={pad.l} x2={pad.l + plotW} y1={y(th.score)} y2={y(th.score)} />
            <text x={pad.l + 6} y={y(th.score) - 6}>{th.label} · {th.score}</text>
          </g>
        ))}
        {years.map((yr) => (
          <text key={yr} className="sh-x" x={x(t(`${yr}-01-01T00:00:00Z`))} y={H - 8} textAnchor="middle">{yr}</text>
        ))}
        <line className="sh-exam" x1={x(t(exam))} x2={x(t(exam))} y1={pad.t} y2={pad.t + plotH} />
        <text className="sh-exam-label" x={x(t(exam)) - 6} y={pad.t + 12} textAnchor="end">NEET 2027</text>
        <path className="sh-real" d={realPath} pathLength={1} />
        {points.map((p, i) => (
          <circle
            key={i}
            className={`sh-pt sh-${p.kind}${hover === p ? " is-hover" : ""}`}
            cx={x(p.t)}
            cy={y(p.score)}
            r={p.kind === "attempt" ? 7 : 4.5}
            onPointerEnter={() => setHover(p)}
            onPointerLeave={() => setHover(null)}
            style={{ "--i": i } as React.CSSProperties}
          />
        ))}
      </svg>
      {hover ? (
        <div className="pl-tip" style={{ left: Math.min(width - 90, Math.max(90, x(hover.t))), top: y(hover.score) }}>
          <span className="k">{fmt(hover.t)}</span>
          <strong>{hover.score}/720</strong>
          <div className="row"><span>{hover.label}</span></div>
          <div className="row"><span>{hover.sub}</span></div>
        </div>
      ) : null}
      <div className="sh-legend">
        <span><i className="sh-key-attempt" /> real NEET attempts</span>
        <span><i className="sh-key-mock" /> mocks, scaled to /720</span>
        <span><i className="sh-key-line" /> seat lines</span>
      </div>
    </div>
  );
}
