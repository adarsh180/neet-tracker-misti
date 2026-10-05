import { NeetLogoMark } from "@/components/brand/neet-logo-mark";

export const ECG_PATH =
  "M0 72 H40 Q48 60 56 72 H70 L78 84 L88 18 L98 108 L106 72 H120 Q134 52 148 72 H190 Q198 60 206 72 H220 L228 84 L238 18 L248 108 L256 72 H270 Q284 52 298 72 H340";

/** Gradient for the trace, drawn from the live accent palette. */
export function TraceGradient() {
  return (
    <defs>
      <linearGradient id="pl-trace-grad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
        <stop className="pl-trace-g0" offset="0%" />
        <stop className="pl-trace-g1" offset="55%" />
        <stop className="pl-trace-g2" offset="100%" />
      </linearGradient>
    </defs>
  );
}

/**
 * Heartbeat loader: a single fine heartbeat sweeps through a frosted glass
 * capsule while the NEET DOCTOR mark beats in time. Every colour comes from the live accent,
 * so it follows light/dark and the minute palette.
 */
export function HeartLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="pl-loader" role="status" aria-live="polite">
      <div className="pl-loader-monitor pl-glass">
        <svg viewBox="0 0 340 130" preserveAspectRatio="none" aria-hidden="true">
          <TraceGradient />
          <path className="pl-ecg-ghost" d={ECG_PATH} />
          <path className="pl-ecg-trace" d={ECG_PATH} pathLength={1} />
        </svg>
      </div>
      <div className="pl-loader-row">
        <span className="pl-loader-heart" aria-hidden="true">
          <NeetLogoMark size={30} />
        </span>
        <span className="pl-loader-text">{label}</span>
      </div>
    </div>
  );
}
