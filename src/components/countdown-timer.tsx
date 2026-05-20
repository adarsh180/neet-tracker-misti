"use client";

import { useEffect, useState } from "react";

const EXAM_DATE = new Date("2027-05-02T09:00:00+05:30");

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; }

function calcTime(): TimeLeft {
  const diff = Math.max(0, EXAM_DATE.getTime() - Date.now());
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

interface RingProps { value: number; max: number; color: string; size?: number; stroke?: number; }
function Ring({ value, max, color, size = 80, stroke = 4 }: RingProps) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / max) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {/* Track */}
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      {/* Progress */}
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.0,0.0,0.2,1)", filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}

function TimeUnit({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  return (
    <div className="ct-unit">
      <div className="ct-ring-wrap">
        <Ring value={value} max={max} color={color} size={76} stroke={4} />
        <div className="ct-ring-val" style={{ color }}>{String(value).padStart(2, "0")}</div>
      </div>
      <span className="ct-ring-label">{label}</span>
    </div>
  );
}

export default function CountdownTimer() {
  const [time, setTime] = useState<TimeLeft>(calcTime());

  useEffect(() => {
    const id = setInterval(() => setTime(calcTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalDays = Math.ceil((EXAM_DATE.getTime() - new Date("2025-05-02").getTime()) / (1000 * 60 * 60 * 24));
  const pct = Math.max(0, Math.min(100, ((totalDays - time.days) / totalDays) * 100));

  return (
    <div className="ct-card glass-card glass-card-gold animate-fade-in">
      {/* Ambient glow */}
      <div className="ct-ambient" />

      <div className="ct-top">
        <div>
          <div className="ct-badge">
            <span className="devanagari" style={{ color: "var(--gold)", fontSize: 14 }}>ॐ</span>
            <span>सरस्वत्यै नमः</span>
          </div>
          <h2 className="ct-title">NEET UG 2027</h2>
          <p className="ct-sub">2nd May, 2027 · <span className="text-gold">AIIMS Delhi</span> is the goal</p>
        </div>
        <div className="ct-pct-badge">
          <div className="ct-pct-ring">
            <Ring value={pct} max={100} color="var(--gold)" size={56} stroke={3.5} />
            <span className="ct-pct-val">{Math.round(pct)}%</span>
          </div>
          <span className="ct-pct-label">journey<br/>complete</span>
        </div>
      </div>

      <div className="ct-units">
        <TimeUnit value={time.days}    max={totalDays} label="DAYS"    color="hsl(38,80%,62%)"  />
        <div className="ct-sep">:</div>
        <TimeUnit value={time.hours}   max={24}        label="HOURS"   color="hsl(352,65%,60%)" />
        <div className="ct-sep">:</div>
        <TimeUnit value={time.minutes} max={60}        label="MINUTES" color="hsl(285,52%,62%)" />
        <div className="ct-sep">:</div>
        <TimeUnit value={time.seconds} max={60}        label="SECONDS" color="hsl(218,75%,65%)" />
      </div>

      <div className="ct-bar-wrap">
        <div className="progress-track" style={{ height: 4 }}>
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--gold), var(--rose))"
            }}
          />
        </div>
      </div>

      <style jsx>{`
        .ct-card {
          container-type: inline-size;
          padding: clamp(18px, 5cqw, 28px) clamp(18px, 6cqw, 32px);
          position: relative;
          overflow: hidden;
        }
        .ct-ambient {
          position: absolute; top: -60px; right: -60px;
          width: 200px; height: 200px; border-radius: 50%;
          background: radial-gradient(circle, hsla(38,72%,58%,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .ct-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 24px; gap: 16px;
        }
        .ct-top > div:first-child { min-width: 0; }
        .ct-badge {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--text-muted); padding: 4px 10px;
          background: var(--glass-ultra); border: 1px solid var(--glass-border);
          border-radius: var(--r-pill); margin-bottom: 8px;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ct-title {
          font-size: clamp(22px, 7cqw, 26px); font-weight: 800; color: var(--text-primary);
          margin-bottom: 4px;
        }
        .ct-sub { font-size: clamp(12px, 3.5cqw, 13px); color: var(--text-secondary); line-height: 1.45; }
        .ct-pct-badge { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .ct-pct-ring { position: relative; width: 56px; height: 56px; flex-shrink: 0; }
        .ct-pct-val {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; color: var(--gold);
        }
        .ct-pct-label { font-size: 11px; color: var(--text-muted); line-height: 1.4; text-align: center; }
        .ct-units {
          display: flex; align-items: center; justify-content: flex-start;
          gap: 8px; margin-bottom: 20px;
        }
        .ct-unit { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .ct-ring-wrap { position: relative; width: 76px; height: 76px; }
        .ct-ring-wrap svg,
        .ct-pct-ring svg { width: 100%; height: 100%; display: block; }
        .ct-ring-val {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums;
        }
        .ct-ring-label {
          font-size: 9.5px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .ct-sep { font-size: 28px; font-weight: 700; color: rgba(255,255,255,0.12); align-self: center; padding-bottom: 20px; }
        .ct-bar-wrap { margin-top: 4px; }

        @container (max-width: 430px) {
          .ct-top {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 12px;
            margin-bottom: 20px;
          }

          .ct-badge {
            max-width: min(100%, 150px);
            font-size: 9px;
            letter-spacing: 0.05em;
            padding: 4px 8px;
          }

          .ct-pct-badge {
            gap: 6px;
          }

          .ct-pct-ring {
            width: 48px;
            height: 48px;
          }

          .ct-pct-label {
            display: none;
          }

          .ct-units {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            align-items: start;
            gap: 8px;
          }

          .ct-sep {
            display: none;
          }

          .ct-ring-wrap {
            width: min(100%, 58px);
            height: auto;
            aspect-ratio: 1;
          }

          .ct-ring-val {
            font-size: clamp(15px, 5.6cqw, 19px);
          }

          .ct-ring-label {
            font-size: 7.5px;
            letter-spacing: 0.04em;
          }
        }

        @container (max-width: 300px) {
          .ct-units {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            row-gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
