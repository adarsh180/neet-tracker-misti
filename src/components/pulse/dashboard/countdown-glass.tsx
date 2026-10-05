"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
const START = new Date("2026-05-01T00:00:00+05:30").getTime();

/** Days to NEET on frosted glass, with a liquid bar for how much of the cycle is behind you. */
export function CountdownGlass({ target }: { target: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const t = now ?? Date.now();
  const end = new Date(target).getTime();
  const ms = Math.max(0, end - t);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const done = Math.max(0, Math.min(1, (t - START) / (end - START)));
  return (
    <div className="cg">
      <span className="cg-label">NEET UG · 2 May 2027</span>
      <div className="cg-days">
        {d}
        <small>days</small>
      </div>
      <div className="cg-clock" suppressHydrationWarning>
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>
      <div className="cg-journey" style={{ "--p": done } as React.CSSProperties}>
        <span className="cg-bar"><i /></span>
        <span className="cg-meta">
          <b>{Math.round(done * 100)}%</b> of the cycle behind you
        </span>
      </div>
    </div>
  );
}
