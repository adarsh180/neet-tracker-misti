"use client";

import { useId, type CSSProperties } from "react";

export type Tone = "good" | "warn" | "bad" | "accent" | "muted";

/**
 * One glass test tube with a moving liquid level. The dashboard seat vials,
 * the Practice Arena lab and the page heads all share it, so the meniscus,
 * bubbles and tick marks read the same everywhere.
 *  level  0..1 fill height          target  0..1 dashed "aim" line
 *  tone   colour band, or `color` for a fixed subject colour
 */
export function LabTube({
  level,
  target,
  tone = "accent",
  color,
  index = 0,
  empty = false,
  className,
}: {
  level: number;
  target?: number | null;
  tone?: Tone;
  color?: string;
  index?: number;
  empty?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const top = 34;
  const bottom = 206;
  const clamp = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  const y = bottom - (empty ? 0 : clamp) * (bottom - top);
  const ty = target == null ? null : bottom - Math.max(0, Math.min(1, target)) * (bottom - top);
  return (
    <svg
      viewBox="0 0 64 228"
      aria-hidden="true"
      className={`lt lt-${tone} ${empty ? "lt-empty" : ""} ${className ?? ""}`}
      style={{ "--vi": index, ...(color ? { "--tc": color } : null) } as CSSProperties}
    >
      <defs>
        <clipPath id={`${uid}-c`}>
          <path d="M14 26 V196 a18 18 0 0 0 36 0 V26 Z" />
        </clipPath>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop className="lt-g0" offset="0%" />
          <stop className="lt-g1" offset="100%" />
        </linearGradient>
      </defs>
      <path className="lt-tube" d="M14 26 V196 a18 18 0 0 0 36 0 V26 Z" />
      <g clipPath={`url(#${uid}-c)`}>
        <g className="lt-level" style={{ transform: `translateY(${y}px)` }}>
          <path className="lt-liquid" d="M-40 4 Q-30 -2 -20 4 T0 4 T20 4 T40 4 T60 4 T80 4 T100 4 V260 H-40 Z" fill={`url(#${uid}-g)`} />
          {[18, 30, 42].map((x, i) => (
            <circle key={x} className="lt-bubble" cx={x} cy={14} r={1.6 + (i % 2)} style={{ animationDelay: `${i * 0.9 + index * 0.4}s` }} />
          ))}
        </g>
      </g>
      <rect className="lt-lip" x="8" y="18" width="48" height="9" rx="4.5" />
      <path className="lt-shine" d="M21 40 V180" />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} className="lt-tick" x1="44" x2="50" y1={bottom - f * (bottom - top)} y2={bottom - f * (bottom - top)} />
      ))}
      {ty !== null ? <line className="lt-target" x1="6" x2="58" y1={ty} y2={ty} /> : null}
    </svg>
  );
}

export function toneFor(value: number, good: number, warn: number, lowerIsBetter = false): Tone {
  if (lowerIsBetter) return value <= good ? "good" : value <= warn ? "warn" : "bad";
  return value >= good ? "good" : value >= warn ? "warn" : "bad";
}
