"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";

import SmoothLink from "@/components/layout/smooth-link";
import { Roll } from "@/components/pulse/roll";
import { SyllabusDish } from "@/components/pulse/dashboard/syllabus-dish";
import type { Readiness, SyllabusCompletion } from "@/lib/readiness";

const toneOf = (s: number) => (s >= 0.7 ? "good" : s >= 0.4 ? "warn" : "bad");
const BANDS = ["Foundation", "Building", "Competitive", "Strong", "Exam-ready"];

/* A round-bottom flask filled to the readiness score. */
function Flask({ level, tone }: { level: number; tone: string }) {
  const uid = useId().replace(/:/g, "");
  const top = 82; // where the bulb meets the neck
  const bottom = 210;
  const y = bottom - Math.max(0, Math.min(1, level)) * (bottom - top);
  const body = "M86 12 V76 A68 68 0 1 0 114 76 V12 Z";
  return (
    <svg viewBox="0 0 200 220" className={`rf-flask tone-${tone}`} aria-hidden="true">
      <defs>
        <clipPath id={`${uid}-c`}>
          <path d={body} />
        </clipPath>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop className="rf-g0" offset="0%" />
          <stop className="rf-g1" offset="100%" />
        </linearGradient>
      </defs>
      <path className="rf-glass" d={body} />
      <g clipPath={`url(#${uid}-c)`}>
        <g className="rf-level" style={{ transform: `translateY(${y}px)` }}>
          <path className="rf-liquid" d="M-80 4 Q-60 -4 -40 4 T0 4 T40 4 T80 4 T120 4 T160 4 T200 4 T240 4 V240 H-80 Z" fill={`url(#${uid}-g)`} />
          {[70, 100, 128, 88, 116].map((x, i) => (
            <circle key={i} className="rf-bubble" cx={x} cy={18} r={2 + (i % 3)} style={{ animationDelay: `${i * 0.7}s` }} />
          ))}
        </g>
      </g>
      <rect className="rf-lip" x="80" y="6" width="40" height="9" rx="4.5" />
      <path className="rf-shine" d="M62 110 A48 48 0 0 0 66 170" />
      {[0.25, 0.5, 0.75].map((f) => {
        const ty = bottom - f * (bottom - top);
        return <line key={f} className="rf-tick" x1="150" x2="160" y1={ty} y2={ty} />;
      })}
    </svg>
  );
}

export function ReadinessFlask({ readiness, syllabus }: { readiness: Readiness; syllabus: SyllabusCompletion }) {
  const [active, setActive] = useState<string | null>(null);
  const activePart = readiness.parts.find((p) => p.key === active) ?? null;
  const shown = activePart ? activePart.score : readiness.score / 100;
  const tone = toneOf(shown);

  return (
    <div className="rf">
      <div className="rf-syl pl-glass">
        <SyllabusDish syllabus={syllabus} />
      </div>

      {/* Readiness today. */}
      <div className="rf-ready pl-glass" onMouseLeave={() => setActive(null)}>
        <span className="rf-k">Exam readiness today</span>
        <div className="rf-flask-wrap">
          <Flask level={shown} tone={tone} />
          <div className={`rf-read tone-${tone}`}>
            {activePart ? (
              <>
                <strong>
                  {Math.round(activePart.score * activePart.weight)}
                  <small>/{activePart.weight}</small>
                </strong>
                <span>{activePart.label}</span>
              </>
            ) : (
              <>
                <strong>
                  <Roll value={readiness.score} />
                  <small>/100</small>
                </strong>
                <span>{readiness.band}</span>
              </>
            )}
          </div>
        </div>
        <div className="rf-bands">
          {BANDS.map((b) => (
            <span key={b} className={b === readiness.band ? "is-on" : ""}>{b}</span>
          ))}
        </div>
        <p className="rf-note">Where you stand now — not a forecast. Eight signals, each weighted by how much it decides the paper.</p>
      </div>

      <div className="rf-ledger">
        <ol>
          {readiness.parts.map((p, i) => {
            const pts = Math.round(p.score * p.weight * 10) / 10;
            return (
              <li
                key={p.key}
                className={`tone-${toneOf(p.score)} ${active === p.key ? "is-on" : ""} ${p.evidence ? "" : "no-evidence"}`}
                style={{ "--s": p.score, "--i": i } as CSSProperties}
                onMouseEnter={() => setActive(p.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(p.key)}
                onBlur={() => setActive(null)}
              >
                <SmoothLink href={p.href} className="rf-row">
                  <span className="rf-name">
                    <b>{p.label}</b>
                    <small>{p.value}</small>
                  </span>
                  <span className="rf-bar" aria-hidden="true"><i /></span>
                  <span className="rf-pts">
                    <b>{pts % 1 ? pts.toFixed(1) : pts}</b>
                    <small>/{p.weight}</small>
                  </span>
                  <span className="rf-why">{p.evidence ? p.note : `No evidence yet — ${p.note}`}</span>
                  <ArrowUpRight size={15} className="rf-go" aria-hidden="true" />
                </SmoothLink>
              </li>
            );
          })}
        </ol>
        {readiness.lever ? (
          <p className="rf-lever">
            Biggest lever: <b>{readiness.lever.label.toLowerCase()}</b> — up to <b>+{readiness.lever.points}</b> points are waiting there.
          </p>
        ) : null}
      </div>
    </div>
  );
}
