"use client";

import { useMemo, useState } from "react";

import { Roll } from "@/components/pulse/roll";
import { runSeatModel, type SeatInputs, type SeatLevers, type SeatTier } from "@/lib/seat-model";

type LeverKey = keyof SeatLevers;

const LEVERS: Array<{ key: LeverKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint: string }> = [
  { key: "hoursPerDay", label: "Study hours a day", min: 0, max: 14, step: 0.25, fmt: (v) => `${Number.isInteger(v) ? v : v.toFixed(2)}h`, hint: "every day, rest days included" },
  { key: "questionsPerDay", label: "MCQs a day", min: 0, max: 400, step: 5, fmt: (v) => `${v}`, hint: "timed, from NCERT + PYQs" },
  { key: "mocksPerWeek", label: "Full mocks a week", min: 0, max: 4, step: 0.5, fmt: (v) => `${v}`, hint: "three hours, 180 questions" },
  { key: "accuracy", label: "Accuracy", min: 0.5, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, hint: "+4 right, −1 wrong" },
  { key: "revision", label: "Revisions on time", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, hint: "share of finished topics" },
];

const PRESETS: Array<{ id: string; label: string; levers: SeatLevers | null }> = [
  { id: "you", label: "Your pace", levers: null },
  // Push-hard benchmarks: 12h a day for both, every other lever +20% (accuracy and revision capped near 100%).
  { id: "steady", label: "Steady", levers: { hoursPerDay: 12, questionsPerDay: 180, mocksPerWeek: 1.5, accuracy: 0.97, revision: 0.84 } },
  { id: "aiims", label: "AIIMS routine", levers: { hoursPerDay: 12, questionsPerDay: 310, mocksPerWeek: 2.5, accuracy: 0.99, revision: 1 } },
];

const fmtAir = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);

function Vial({ tier, index }: { tier: SeatTier; index: number }) {
  const top = 34;
  const bottom = 206;
  const level = bottom - tier.p * (bottom - top);
  const id = `vial-${tier.key}`;
  return (
    <figure className="sv-vial" style={{ "--vi": index } as React.CSSProperties}>
      <svg viewBox="0 0 64 228" aria-hidden="true">
        <defs>
          <clipPath id={id}>
            <path d="M14 26 V196 a18 18 0 0 0 36 0 V26 Z" />
          </clipPath>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop className="sv-g0" offset="0%" />
            <stop className="sv-g1" offset="100%" />
          </linearGradient>
        </defs>
        <path className="sv-tube" d="M14 26 V196 a18 18 0 0 0 36 0 V26 Z" />
        <g clipPath={`url(#${id})`}>
          <g className="sv-level" style={{ transform: `translateY(${level}px)` }}>
            <path className="sv-liquid" d="M-40 4 Q-30 -2 -20 4 T0 4 T20 4 T40 4 T60 4 T80 4 T100 4 V260 H-40 Z" fill={`url(#${id}-g)`} />
            {[18, 30, 42].map((x, i) => (
              <circle key={x} className="sv-bubble" cx={x} cy={14} r={1.6 + (i % 2)} style={{ animationDelay: `${i * 0.9 + index * 0.4}s` }} />
            ))}
          </g>
        </g>
        <rect className="sv-lip" x="8" y="18" width="48" height="9" rx="4.5" />
        <path className="sv-shine" d="M21 40 V180" />
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="sv-tick" x1="44" x2="50" y1={bottom - f * (bottom - top)} y2={bottom - f * (bottom - top)} />
        ))}
      </svg>
      <figcaption>
        <strong>
          <Roll value={tier.p * 100} decimals={tier.p < 0.1 ? 1 : 0} suffix={<small>%</small>} />
        </strong>
        <span>{tier.label}</span>
        <em>needs ~{tier.threshold}/720 · AIR ≤ {fmtAir(tier.air)}</em>
      </figcaption>
    </figure>
  );
}

export function SeatOdds({ inputs, observed, attempts }: { inputs: SeatInputs; observed: SeatLevers; attempts: Array<{ year: number; score: number }> }) {
  const [levers, setLevers] = useState<SeatLevers>(observed);
  const [preset, setPreset] = useState("you");
  const result = useMemo(() => runSeatModel(inputs, levers), [inputs, levers]);
  const pos = (s: number) => `${(Math.max(0, Math.min(720, s)) / 720) * 100}%`;

  return (
    <div className="sv">
      <div className="sv-top">
        <div className="sv-read">
          <span className="sv-label">Projected NEET 2027 score</span>
          <div className="sv-score">
            <Roll value={result.projected} />
            <small>/720</small>
          </div>
          <p className="sv-sub">
            likely <b>{result.low}–{result.high}</b> · AIR around <b>{fmtAir(result.air)}</b>
            <span> (best {fmtAir(result.airBest)}, worst {fmtAir(result.airWorst)})</span>
          </p>
          {result.gainVsLast !== null ? (
            <p className={`sv-gain ${result.gainVsLast >= 0 ? "up" : "down"}`}>
              {result.gainVsLast >= 0 ? "+" : ""}
              {result.gainVsLast} marks on your 2026 attempt
            </p>
          ) : null}
          <p className="sv-note">
            Today you sit near <b>{inputs.currentScore}</b> ({inputs.currentBasis === "mocks" ? `from ${inputs.mockCount} full mocks` : inputs.currentBasis === "chapters" ? "from chapter mastery" : "from your last attempt"}). At{" "}
            {Math.round(levers.accuracy * 100)}% accuracy the paper caps you near <b>{result.ceiling}</b>.
          </p>
        </div>
        <div className="sv-vials" aria-label="Chance of each seat tier">
          {result.tiers.map((tier, i) => (
            <Vial key={tier.key} tier={tier} index={i} />
          ))}
        </div>
      </div>

      {/* The journey ruler: every real attempt, today, the projection and each seat's bar. */}
      <div className="sv-ruler" role="img" aria-label={`Score journey from ${attempts[0]?.score ?? 0} to a projected ${result.projected} out of 720`}>
        <div className="sv-ruler-track">
          <i className="sv-band" style={{ left: pos(result.low), width: `calc(${pos(result.high)} - ${pos(result.low)})` }} />
          {result.tiers.map((t) => (
            <span key={t.key} className={`sv-flag sv-flag-${t.key}`} style={{ left: pos(t.threshold) }}>
              <b>{t.threshold}</b>
              <em>{t.label}</em>
            </span>
          ))}
          {attempts.map((a) => (
            <span key={a.year} className="sv-past" style={{ left: pos(a.score) }} title={`NEET ${a.year}: ${a.score}`}>
              <i />
              <em>{a.year}</em>
            </span>
          ))}
          <span className="sv-now" style={{ left: pos(inputs.currentScore) }}>
            <i />
            <em>now</em>
          </span>
          <span className="sv-proj" style={{ left: pos(result.projected) }}>
            <i />
            <em>May 2027</em>
          </span>
        </div>
        <div className="sv-scale" aria-hidden="true">
          {[0, 180, 360, 540, 720].map((v) => (
            <span key={v} style={{ left: pos(v) }}>{v}</span>
          ))}
        </div>
      </div>

      <div className="sv-levers">
        <div className="sv-levers-head">
          <h3>What if you changed the routine?</h3>
          <div className="pl-seg" style={{ "--n": PRESETS.length, "--i": Math.max(0, PRESETS.findIndex((p) => p.id === preset)) } as React.CSSProperties}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => {
                  setPreset(p.id);
                  setLevers(p.levers ?? observed);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sv-sliders">
          {LEVERS.map((l) => {
            const v = levers[l.key];
            const fill = (v - l.min) / (l.max - l.min);
            const mark = (observed[l.key] - l.min) / (l.max - l.min);
            return (
              <label key={l.key} className="sv-slider" style={{ "--fill": fill, "--mark": Math.max(0, Math.min(1, mark)) } as React.CSSProperties}>
                <span className="sv-slider-top">
                  <span>{l.label}</span>
                  <b>{l.fmt(v)}</b>
                </span>
                <span className="sv-track">
                  <input
                    type="range"
                    min={l.min}
                    max={l.max}
                    step={l.step}
                    value={v}
                    aria-valuetext={l.fmt(v)}
                    onChange={(e) => {
                      setPreset("custom");
                      setLevers((cur) => ({ ...cur, [l.key]: Number(e.target.value) }));
                    }}
                  />
                  <i className="sv-mark" aria-hidden="true" />
                </span>
                <span className="sv-slider-hint">
                  {l.hint} · you: {l.fmt(observed[l.key])}
                </span>
              </label>
            );
          })}
        </div>
        <details className="sv-how">
          <summary>How this is worked out</summary>
          <p>
            Your current level blends recent full-length mock scores (newest counts most) with chapter mastery from the
            rank engine, falling back to your last real attempt. Growth until 2 May 2027 depends on the effort you keep
            up — hours, MCQs, full mocks and revision — and shrinks as the remaining headroom shrinks. Accuracy sets a
            hard ceiling, because with +4/−1 marking about 178 attempts can never score more than 178 × (5 × accuracy − 1).
            The projected score is turned into an All-India Rank with the calibrated marks-vs-rank tables from recent
            years, and each seat chance is the probability of reaching the score that historically got that rank. The
            band narrows as you log more full mocks. It is a planning instrument, not a promise.
          </p>
        </details>
      </div>
    </div>
  );
}
