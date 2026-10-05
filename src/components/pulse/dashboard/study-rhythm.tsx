"use client";

import { useMemo, useState } from "react";

import { useWidth } from "@/components/pulse/use-width";
import type { PulseDay } from "@/lib/pulse-insights";

const RANGES = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All", days: 0 },
] as const;

const METRICS = [
  { id: "hours", label: "Hours", unit: "h", target: 8, peak: 12, min: 14 },
  { id: "questions", label: "MCQs", unit: "", target: 150, peak: 250, min: 300 },
] as const;

type Slot = { date: string; day: PulseDay | null; avg: number };

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const fmt = (key: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { ...o, timeZone: "UTC" });

/**
 * Study rhythm — one glass bar per calendar day (hours or MCQs) with a
 * seven-day average line, the 8h target and the 12h peak marked. Bars glow
 * brighter as days get bigger; a dot on the floor is a day with no log.
 */
export function StudyRhythm({ days, today }: { days: PulseDay[]; today: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("90");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["id"]>("hours");
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(1000);
  const m = METRICS.find((x) => x.id === metric)!;
  const val = (d: PulseDay | null) => (d ? (metric === "hours" ? d.hours : d.questions) : 0);

  const slots = useMemo<Slot[]>(() => {
    if (!days.length) return [];
    const map = new Map(days.map((d) => [d.date, d]));
    const out: Slot[] = [];
    for (let k = days[0].date; k <= today; k = addDays(k, 1)) out.push({ date: k, day: map.get(k) ?? null, avg: 0 });
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      const from = Math.max(0, i - 6);
      for (let j = from; j <= i; j++) sum += val(out[j].day);
      out[i].avg = sum / (i - from + 1);
    }
    const r = RANGES.find((x) => x.id === range)!;
    return r.days ? out.slice(-r.days) : out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, today, range, metric]);

  if (!slots.length) {
    return (
      <div className="pl-empty">
        <strong>No rhythm yet</strong>
        Log a day on Daily Goals and your bars start here.
      </div>
    );
  }

  const H = 290;
  const pad = { l: 38, r: 10, t: 18, b: 28 };
  const plotW = Math.max(120, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const maxV = Math.max(m.min, ...slots.map((s) => val(s.day)));
  const step = plotW / slots.length;
  const barW = Math.max(2, Math.min(16, step * 0.64));
  const x = (i: number) => pad.l + step * i + step / 2;
  const y = (v: number) => pad.t + plotH - (v / maxV) * plotH;
  const avgPath = slots.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s.avg).toFixed(1)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(slots.length / Math.max(3, Math.floor(plotW / 90))));
  const logged = slots.filter((s) => s.day && val(s.day) > 0);
  const hs = hover !== null ? slots[hover] : null;
  const grid = metric === "hours" ? [4, 8, 12] : [100, 150, 250];

  return (
    <div className="sr">
      <div className="sr-tools">
        <div className="sr-stats">
          <span><b>{logged.length}</b> logged of {slots.length} days</span>
          <span>
            <b>{(logged.reduce((t, s) => t + val(s.day), 0) / slots.length).toFixed(metric === "hours" ? 1 : 0)}{m.unit}</b> per calendar day
          </span>
        </div>
        <div className="sr-switches">
          <div className="pl-seg" style={{ "--n": METRICS.length, "--i": METRICS.findIndex((x) => x.id === metric) } as React.CSSProperties}>
            {METRICS.map((x) => (
              <button key={x.id} type="button" aria-pressed={metric === x.id} onClick={() => setMetric(x.id)}>{x.label}</button>
            ))}
          </div>
          <div className="pl-seg" style={{ "--n": RANGES.length, "--i": RANGES.findIndex((x) => x.id === range) } as React.CSSProperties}>
            {RANGES.map((x) => (
              <button key={x.id} type="button" aria-pressed={range === x.id} onClick={() => setRange(x.id)}>{x.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="sr-plot" ref={ref}>
        <svg width={width} height={H} role="img" aria-label={`Daily ${m.label.toLowerCase()} with a seven-day average`}>
          <defs>
            <linearGradient id="sr-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="sr-g0" />
              <stop offset="100%" className="sr-g1" />
            </linearGradient>
          </defs>
          {grid.filter((g) => g <= maxV).map((g) => (
            <g key={g} className={`sr-grid${g === m.target ? " is-target" : g === m.peak ? " is-peak" : ""}`}>
              <line x1={pad.l} x2={pad.l + plotW} y1={y(g)} y2={y(g)} />
              <text x={pad.l - 8} y={y(g) + 3.5} textAnchor="end">{g}{m.unit}</text>
            </g>
          ))}
          <line className="sr-base" x1={pad.l} x2={pad.l + plotW} y1={y(0)} y2={y(0)} />
          <g key={`${range}-${metric}`}>
            {slots.map((s, i) => {
              const v = val(s.day);
              if (!s.day || v <= 0) return <circle key={s.date} className="sr-miss" cx={x(i)} cy={y(0) - 3} r={Math.min(1.6, barW / 2)} />;
              const tier = v >= m.peak ? "peak" : v >= m.target ? "good" : "low";
              return (
                <rect
                  key={s.date}
                  className={`sr-bar ${tier}${hover === i ? " is-hover" : ""}`}
                  x={x(i) - barW / 2}
                  y={y(v)}
                  width={barW}
                  height={Math.max(1, y(0) - y(v))}
                  rx={Math.min(barW / 2, 5)}
                  style={{ "--i": i } as React.CSSProperties}
                />
              );
            })}
          </g>
          <path className="sr-avg" d={avgPath} pathLength={1} key={`avg-${range}-${metric}`} />
          {slots.map((s, i) => (i % labelEvery === 0 ? (
            <text key={s.date} className="sr-x" x={x(i)} y={H - 8} textAnchor="middle">{fmt(s.date)}</text>
          ) : null))}
          {hs ? (
            <g className="sr-cross">
              <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={y(0)} />
              <circle cx={x(hover!)} cy={y(hs.avg)} r={4} />
            </g>
          ) : null}
          <rect
            className="sr-hit"
            x={pad.l}
            y={pad.t}
            width={plotW}
            height={plotH}
            onPointerMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHover(Math.max(0, Math.min(slots.length - 1, Math.floor((e.clientX - box.left - pad.l) / step))));
            }}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hs ? (
          <div className="pl-tip" style={{ left: Math.min(width - 90, Math.max(90, x(hover!))), top: y(Math.max(val(hs.day), hs.avg)) }}>
            <span className="k">{fmt(hs.date, { weekday: "short", day: "numeric", month: "short" })}</span>
            <strong>{hs.day ? `${hs.day.hours}h` : "No log"}</strong>
            {hs.day ? (
              <>
                <div className="row"><span>MCQs</span><b>{hs.day.questions}</b></div>
                <div className="row"><span>Discipline</span><b>{hs.day.discipline || "—"}</b></div>
              </>
            ) : null}
            <div className="row"><span>7-day avg</span><b>{hs.avg.toFixed(metric === "hours" ? 1 : 0)}{m.unit}</b></div>
          </div>
        ) : null}
      </div>
      <div className="sr-legend">
        <span><i className="k-peak" />{m.peak}{m.unit}+ peak</span>
        <span><i className="k-good" />{m.target}{m.unit}+ target</span>
        <span><i className="k-low" />below target</span>
        <span><i className="k-line" />7-day average</span>
      </div>
    </div>
  );
}
