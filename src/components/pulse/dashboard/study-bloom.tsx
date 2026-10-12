"use client";

import type { CSSProperties, ReactNode } from "react";

import type { PulseInsights } from "@/lib/pulse-insights";

type Subject = PulseInsights["subjects"][number];

/* One petal per subject, at the four points of the compass. */
const ORDER: Array<{ key: Subject["key"]; angle: number; color: string; short: string }> = [
  { key: "Physics", angle: -90, color: "var(--physics, #5b8def)", short: "Physics" },
  { key: "Chemistry", angle: 0, color: "var(--chemistry, #a974e0)", short: "Chemistry" },
  { key: "Botany", angle: 90, color: "var(--botany, #33b76b)", short: "Botany" },
  { key: "Zoology", angle: 180, color: "var(--zoology, #e7a63a)", short: "Zoology" },
];
const R0 = 44; // centre disc
const L = 118; // full petal length = the whole subject
const W = 50; // petal half-width

const rad = (d: number) => (d * Math.PI) / 180;
function petal(len: number, w = W) {
  // A soft teardrop pointing up from the centre disc.
  const t = -R0 - len;
  return `M0 ${-R0}C${w * 0.95} ${-R0 - len * 0.22} ${w * 0.78} ${t + len * 0.18} 0 ${t}C${-w * 0.78} ${t + len * 0.18} ${-w * 0.95} ${-R0 - len * 0.22} 0 ${-R0}Z`;
}

/**
 * The light-mode companion to the hologram: a clay flower drawn from the real
 * numbers. Each petal is a subject and grows with the share of its topics
 * finished; dew drops on a petal are revisions waiting; the centre is today.
 * Pure SVG + CSS (no WebGL), so it is light on the phone and never blends into
 * the lavender page.
 */
export function StudyBloom({ subjects, today, aside }: { subjects: Subject[]; today: PulseInsights["today"]; aside?: ReactNode }) {
  const bySubject = new Map(subjects.map((s) => [s.key, s]));
  const done = subjects.reduce((s, x) => s + x.done, 0);
  const total = subjects.reduce((s, x) => s + x.topics, 0);
  const due = subjects.reduce((s, x) => s + x.pendingRevisions, 0);
  const summary = ORDER.map((o) => `${o.key} ${Math.round((bySubject.get(o.key)?.completion ?? 0) * 100)}%`).join(", ");

  return (
    <section className="sb" data-aside={aside ? "true" : undefined} aria-label="Your study bloom">
      <div className="sb-body">
        <div className="sb-stage">
          <div className="sb-head">
            <strong>YOUR STUDY BLOOM</strong>
            <span>Every petal is a subject. It grows as you finish topics.</span>
          </div>
          <div className="sb-head is-right">
            <strong>{done} / {total} topics</strong>
            <span>{due ? `${due} revision${due === 1 ? "" : "s"} due` : "No revisions waiting"}</span>
          </div>

          <span className="sb-pollen" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</span>

          <svg className="sb-flower" viewBox="-300 -212 600 424" role="img" aria-label={`Study bloom — ${summary}. Today ${today.hours} hours, ${today.streak}-day streak.`}>
            <defs>
              {ORDER.map((o) => (
                <linearGradient key={o.key} id={`sb-g-${o.key}`} x1="0" y1="0" x2="0" y2="-1" gradientUnits="objectBoundingBox">
                  <stop offset="0" stopColor={o.color} stopOpacity="0.95" />
                  <stop offset="1" stopColor={o.color} stopOpacity="0.62" />
                </linearGradient>
              ))}
              <radialGradient id="sb-centre" cx="40%" cy="32%" r="75%">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="var(--sb-centre-edge, #e9e1fb)" />
              </radialGradient>
              <radialGradient id="sb-dew" cx="35%" cy="30%" r="70%">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.75" />
                <stop offset="1" stopColor="#c9d7ff" stopOpacity="0.55" />
              </radialGradient>
              <filter id="sb-soft" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="6" dy="9" stdDeviation="9" floodColor="#5a3fa8" floodOpacity="0.2" />
              </filter>
            </defs>

            {/* Sepals between the petals */}
            {[45, 135, 225, 315].map((a, i) => (
              <path key={a} className="sb-sepal" d={petal(56, 22)} transform={`rotate(${a + 90})`} style={{ "--i": i } as CSSProperties} />
            ))}

            {ORDER.map((o, i) => {
              const s = bySubject.get(o.key);
              const c = Math.max(0, Math.min(1, s?.completion ?? 0));
              const level = Math.max(0.06, c) * L;
              const drops = Math.min(4, s?.pendingRevisions ?? 0);
              const tip = polarXY(R0 + L + 26, o.angle);
              return (
                <g key={o.key} className="sb-petal" style={{ "--i": i, "--c": o.color } as CSSProperties}>
                  <g transform={`rotate(${o.angle + 90})`}>
                    {/* the whole subject, as a pressed outline */}
                    <path className="sb-ghost" d={petal(L)} />
                    {/* what is finished: the petal fills from the centre like a tube */}
                    <clipPath id={`sb-clip-${o.key}`}>
                      <rect className="sb-level" x={-W - 2} y={-R0 - level} width={W * 2 + 4} height={level + 1} />
                    </clipPath>
                    <g clipPath={`url(#sb-clip-${o.key})`} filter="url(#sb-soft)">
                      <path className="sb-fill" d={petal(L)} fill={`url(#sb-g-${o.key})`} />
                      <path className="sb-shine" d={petal(L * 0.86, W * 0.5)} transform={`translate(${-W * 0.2} 0)`} />
                      <rect className="sb-meniscus" x={-W} y={-R0 - level} width={W * 2} height="2.2" />
                    </g>
                    {Array.from({ length: drops }, (_, k) => (
                      <circle key={k} className="sb-dew" cx={(k % 2 ? 1 : -1) * (10 + k * 4)} cy={-R0 - 22 - k * 22} r={5.5 - k * 0.4} fill="url(#sb-dew)" style={{ "--k": k } as CSSProperties} />
                    ))}
                  </g>
                  <text className="sb-label" x={tip.x} y={tip.y} textAnchor={o.angle === 0 ? "start" : o.angle === 180 ? "end" : "middle"} dominantBaseline="middle">
                    <tspan className="n">{o.short}</tspan>
                    <tspan className="v" dx="7">{Math.round(c * 100)}%</tspan>
                  </text>
                </g>
              );
            })}

            <circle className="sb-centre" r={R0} fill="url(#sb-centre)" filter="url(#sb-soft)" />
            <text className="sb-today" y="-2" textAnchor="middle">{today.hours ? (Math.round(today.hours * 10) / 10).toString() : "0"}<tspan className="u">h</tspan></text>
            <text className="sb-today-sub" y="19" textAnchor="middle">{today.streak ? `${today.streak}-day streak` : "today"}</text>
          </svg>

          <div className="sb-legend" aria-hidden="true">
            <span><i className="dew" /> dew drop = a revision due</span>
            <span><i className="ghost" /> outline = the whole subject</span>
          </div>
        </div>
        {aside ? <div className="sb-aside">{aside}</div> : null}
      </div>
    </section>
  );
}

function polarXY(r: number, deg: number) {
  return { x: Math.round(Math.cos(rad(deg)) * r), y: Math.round(Math.sin(rad(deg)) * r) };
}
