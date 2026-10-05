"use client";

import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import SmoothLink from "@/components/layout/smooth-link";
import { LabTube, type Tone } from "@/components/pulse/lab-tube";

export type HeadStat = {
  label: string;
  value: ReactNode;
  unit?: string;
  /** 0..1 — draws a small tube beside the figure. */
  level?: number | null;
  tone?: Tone;
  color?: string;
  note?: string;
};

/**
 * The page head every app screen shares: a kicker, a two-line display title
 * whose second line carries the living accent, a lede, actions, and an
 * optional row of small tube readouts (or any instrument as `aside`).
 */
export function PulseHead({
  kicker,
  deva,
  title,
  accent,
  lede,
  actions,
  stats,
  aside,
  back,
  className,
}: {
  kicker: ReactNode;
  deva?: string;
  title: string;
  accent?: string;
  lede?: ReactNode;
  actions?: ReactNode;
  stats?: HeadStat[];
  aside?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={`ph ${aside ? "ph-has-aside" : ""} ${className ?? ""}`}>
      <div className="ph-copy">
        {back ? (
          <SmoothLink href={back.href} className="ph-back" direction="back">
            <ArrowLeft size={15} /> {back.label}
          </SmoothLink>
        ) : null}
        <span className="pl-kicker">
          <span className="pl-live">{kicker}</span>
          {deva ? <span className="pl-deva">{deva}</span> : null}
        </span>
        <h1 className="pl-title ph-title">
          <span className="pl-line"><span>{title}</span></span>
          {accent ? (
            <span className="pl-line">
              <span style={{ "--l": 1 } as CSSProperties}><em>{accent}</em></span>
            </span>
          ) : null}
        </h1>
        {lede ? <p className="pl-lede">{lede}</p> : null}
        {actions ? <div className="ph-actions">{actions}</div> : null}
      </div>
      {aside ? <div className="ph-aside">{aside}</div> : null}
      {stats?.length ? (
        <dl className="ph-stats">
          {stats.map((s, i) => (
            <div key={s.label} className={`ph-stat tone-${s.tone ?? "accent"}`} style={{ "--i": i } as CSSProperties}>
              {s.level !== undefined && s.level !== null ? (
                <LabTube level={s.level} tone={s.tone ?? "accent"} color={s.color} index={i} className="ph-tube" />
              ) : null}
              <div>
                <dt>{s.label}</dt>
                <dd>
                  {s.value}
                  {s.unit ? <small>{s.unit}</small> : null}
                </dd>
                {s.note ? <span className="ph-note">{s.note}</span> : null}
              </div>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
