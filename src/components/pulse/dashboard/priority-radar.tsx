"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import SmoothLink from "@/components/layout/smooth-link";
import type { PulseInsights, PulseZoneChapter } from "@/lib/pulse-insights";

type Subject = PulseInsights["subjects"][number];
type Zone = "danger" | "watch" | "safe";

/* Each subject owns a quarter of the dial. */
const QUADRANTS: Array<{ key: Subject["key"]; mid: number; color: string }> = [
  { key: "Physics", mid: -90, color: "var(--physics)" },
  { key: "Chemistry", mid: 0, color: "var(--chemistry)" },
  { key: "Botany", mid: 90, color: "var(--botany)" },
  { key: "Zoology", mid: 180, color: "var(--zoology)" },
];
/* Rings from the centre out: what is locked in, what needs watching, what is slipping. */
const BANDS: Record<Zone, [number, number]> = { safe: [38, 98], watch: [98, 164], danger: [164, 236] };
const ZONES: Array<{ key: Zone; label: string; hint: string }> = [
  { key: "danger", label: "Danger", hint: "marks slipping now" },
  { key: "watch", label: "Watch", hint: "keep an eye on" },
  { key: "safe", label: "Safe", hint: "locked in" },
];
const ZONE_OF: Record<string, Zone> = { HIGH: "danger", MEDIUM: "watch", LOW: "safe" };
const SPAN = 90;
const EDGE = 9; // keeps beads off the quadrant dividers

const rad = (d: number) => (d * Math.PI) / 180;
const xy = (r: number, deg: number) => ({ x: Math.cos(rad(deg)) * r, y: Math.sin(rad(deg)) * r });
const clean = (name: string) => name.replace(/^\d+\s*/, "");
const keyOf = (c: PulseZoneChapter) => `${c.subject}|${c.chapter}`;

type Bead = PulseZoneChapter & { id: string; zone: Zone; x: number; y: number; r: number; i: number };

function place(chapters: PulseZoneChapter[]): Bead[] {
  const beads: Bead[] = [];
  for (const q of QUADRANTS) {
    for (const z of ZONES) {
      const group = chapters
        .filter((c) => c.subject === q.key && (ZONE_OF[c.priority] ?? "watch") === z.key)
        .sort((a, b) => b.damage - a.damage || b.marks - a.marks);
      const [inner, outer] = BANDS[z.key];
      group.forEach((c, k) => {
        const t = 1 - Math.max(0, Math.min(100, c.mastery)) / 100; // weaker sits further out
        const lane = group.length > 5 ? (k % 2 ? 0.2 : -0.2) : 0; // two lanes when crowded
        const r = inner + 12 + (outer - inner - 24) * Math.max(0, Math.min(1, t + lane));
        const a = q.mid - SPAN / 2 + EDGE + ((SPAN - EDGE * 2) * (k + 0.5)) / group.length;
        const p = xy(r, a);
        beads.push({ ...c, id: keyOf(c), zone: z.key, x: p.x, y: p.y, r: Math.min(12.5, 4 + Math.sqrt(Math.max(0, c.marks)) * 1.7), i: beads.length });
      });
    }
  }
  return beads;
}

/**
 * Light mode's dashboard hero: every chapter as a clay bead on a radar. The
 * quarter is the subject, the ring is the zone (from the rank model's
 * priority), the bead's size is how many marks NEET puts on it and the further
 * out it sits the weaker it is. Danger beads pulse; tap one for its numbers.
 */
export function PriorityRadar({ zones, subjects, aside }: { zones: PulseZoneChapter[]; subjects: Subject[]; aside?: ReactNode }) {
  const beads = useMemo(() => place(zones), [zones]);
  const [focus, setFocus] = useState<Subject["key"] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const scope = focus ? beads.filter((b) => b.subject === focus) : beads;
  const tally = ZONES.map((z) => {
    const list = scope.filter((b) => b.zone === z.key);
    return { ...z, count: list.length, risk: Math.round(list.reduce((s, b) => s + b.damage, 0)) };
  });
  const totalRisk = Math.round(scope.reduce((s, b) => s + b.damage, 0));
  const riskBy = (key: string) => Math.round(beads.filter((b) => b.subject === key).reduce((s, b) => s + b.damage, 0));
  const danger = scope.filter((b) => b.zone === "danger").sort((a, b) => b.damage - a.damage).slice(0, 5);
  const urgent = new Set(danger.map((b) => b.id)); // only the top five pulse
  const active = beads.find((b) => b.id === (hover ?? picked)) ?? null;
  const slug = (key: string) => subjects.find((s) => s.key === key)?.slug ?? key.toLowerCase();
  const pick = (id: string) => setPicked((p) => (p === id ? null : id));
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(id);
    }
  };

  if (!beads.length) return null;

  return (
    <section className="pr" data-aside={aside ? "true" : undefined} aria-label="Priority radar">
      <div className="pr-stage">
        <div className="pr-head">
          <strong>PRIORITY RADAR</strong>
          <span>Every chapter, placed by how safe it is. Outer ring first.</span>
        </div>
        <div className="pr-dial">
          <span className="pr-sweep" aria-hidden="true" />
          <svg className="pr-svg" viewBox="-340 -292 680 584" role="group" aria-label={`Priority radar: ${tally.map((t) => `${t.count} ${t.label.toLowerCase()}`).join(", ")}`}>
            <defs>
              <filter id="pr-inset" x="-5%" y="-5%" width="110%" height="110%">
                <feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
                <feGaussianBlur in="inv" stdDeviation="6" />
                <feOffset dx="4" dy="6" result="blur" />
                <feFlood floodColor="#4b2f9e" floodOpacity="0.2" />
                <feComposite in2="blur" operator="in" />
                <feComposite in2="SourceAlpha" operator="in" result="shade" />
                <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="shade" /></feMerge>
              </filter>
              <filter id="pr-lift" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="2.5" dy="4" stdDeviation="3.5" floodColor="#3d2588" floodOpacity="0.28" />
              </filter>
              {(["danger", "watch", "safe"] as Zone[]).map((z) => (
                <radialGradient key={z} id={`pr-b-${z}`} cx="34%" cy="28%" r="78%">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="0.32" stopColor={`var(--pr-${z}-hi)`} />
                  <stop offset="1" stopColor={`var(--pr-${z})`} />
                </radialGradient>
              ))}
              <radialGradient id="pr-hub" cx="38%" cy="30%" r="80%">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="1" stopColor="#ebe4fb" />
              </radialGradient>
            </defs>

            {/* the three rings, pressed into the clay */}
            <circle className="pr-ring is-danger" r={BANDS.danger[1]} filter="url(#pr-inset)" />
            <circle className="pr-ring is-watch" r={BANDS.watch[1]} filter="url(#pr-inset)" />
            <circle className="pr-ring is-safe" r={BANDS.safe[1]} filter="url(#pr-inset)" />
            {[45, 135, 225, 315].map((a) => {
              const p = xy(BANDS.danger[1], a);
              return <line key={a} className="pr-div" x1="0" y1="0" x2={p.x} y2={p.y} />;
            })}
            {ZONES.map((z) => {
              const p = xy((BANDS[z.key][0] + BANDS[z.key][1]) / 2, -45);
              return <text key={z.key} className={`pr-zlabel is-${z.key}`} x={p.x} y={p.y} transform={`rotate(-45 ${p.x} ${p.y})`} textAnchor="middle" dominantBaseline="middle">{z.label.toUpperCase()}</text>;
            })}

            {/* subject names around the rim: tap to focus one subject */}
            {QUADRANTS.map((q) => {
              const p = xy(q.mid === 0 || q.mid === 180 ? 248 : 262, q.mid);
              const on = focus === q.key;
              return (
                <g key={q.key} className="pr-qlabel" data-on={on || undefined} data-dim={(focus && !on) || undefined} role="button" tabIndex={0} aria-pressed={on}
                  onClick={() => setFocus(on ? null : q.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(on ? null : q.key); } }}
                  style={{ "--c": q.color } as CSSProperties}>
                  <text x={p.x} y={p.y - 7} textAnchor={q.mid === 0 ? "start" : q.mid === 180 ? "end" : "middle"} className="n">{q.key}</text>
                  <text x={p.x} y={p.y + 10} textAnchor={q.mid === 0 ? "start" : q.mid === 180 ? "end" : "middle"} className="v">−{riskBy(q.key)} at risk</text>
                </g>
              );
            })}

            <g className="pr-beads" filter="url(#pr-lift)">
              {beads.map((b) => {
                const dim = (focus && b.subject !== focus) || undefined;
                const on = active?.id === b.id || undefined;
                return (
                  <g key={b.id} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`}>
                    <g className={`pr-bead is-${b.zone}`} data-dim={dim} data-on={on} style={{ "--i": Math.min(b.i, 60) } as CSSProperties}
                      role="button" tabIndex={dim ? -1 : 0} aria-label={`${clean(b.chapter)}, ${b.subject}: ${b.zone}, ${b.mastery}% mastery, about ${Math.round(b.damage)} marks at risk`}
                      onClick={() => pick(b.id)} onKeyDown={onKey(b.id)} onPointerEnter={() => setHover(b.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(b.id)} onBlur={() => setHover(null)}>
                      {urgent.has(b.id) ? <circle className="pr-halo" r={b.r + 3} /> : null}
                      <circle className="pr-dot" r={b.r} fill={`url(#pr-b-${b.zone})`} />
                    </g>
                  </g>
                );
              })}
            </g>

            <circle className="pr-hub" r={BANDS.safe[0] - 4} fill="url(#pr-hub)" filter="url(#pr-lift)" />
            <text className="pr-hub-n" y="-1" textAnchor="middle">−{totalRisk}</text>
            <text className="pr-hub-s" y="15" textAnchor="middle">at risk</text>
          </svg>
        </div>
        <div className="pr-legend" aria-hidden="true">
          <span><i className="is-danger" /> danger</span>
          <span><i className="is-watch" /> watch</span>
          <span><i className="is-safe" /> safe</span>
          <span><i className="is-size" /> bigger = more marks in NEET</span>
        </div>
      </div>

      <div className="pr-side">
        <div className="pr-tally">
          {tally.map((t, i) => (
            <div key={t.key} className={`pr-zone is-${t.key}`} style={{ "--i": i } as CSSProperties}>
              <span className="pr-zone-k">{t.label}</span>
              <b>{t.count}</b>
              <small>−{t.risk} marks</small>
            </div>
          ))}
        </div>

        {active ? (
          <div className={`pr-card is-${active.zone}`} key={active.id}>
            <span className="pr-card-k" style={{ "--c": QUADRANTS.find((q) => q.key === active.subject)?.color } as CSSProperties}>{active.subject} · {active.zone}</span>
            <h3>{clean(active.chapter)}</h3>
            <p>About <b>{Math.round(active.damage)}</b> of its ~{Math.round(active.marks)} NEET marks are at risk.</p>
            {[["Mastery", active.mastery], ["Topics done", active.completion], ["Revision health", active.revision]].map(([label, v]) => (
              <div className="pr-meter" key={label as string} style={{ "--v": (v as number) / 100 } as CSSProperties}>
                <span>{label}</span><i /><b>{v}%</b>
              </div>
            ))}
            <div className="pr-card-foot">
              <SmoothLink href={`/subjects/${slug(active.subject)}`} className="pr-go">Open {active.subject} →</SmoothLink>
              {picked ? <button type="button" className="pr-back" onClick={() => setPicked(null)}>Back to list</button> : null}
            </div>
          </div>
        ) : (
          <div className="pr-list">
            <h3>{danger.length ? `In danger${focus ? ` · ${focus}` : ""}` : "Nothing in danger"}</h3>
            {danger.length ? (
              <ol>
                {danger.map((b, i) => (
                  <li key={b.id} style={{ "--i": i, "--c": QUADRANTS.find((q) => q.key === b.subject)?.color, "--m": Math.min(1, b.damage / Math.max(1, danger[0].damage)) } as CSSProperties}>
                    <button type="button" onClick={() => pick(b.id)}>
                      <span className="pr-li-name"><b>{clean(b.chapter)}</b><small>{b.subject} · {b.mastery}% mastery</small></span>
                      <span className="pr-li-bar"><i /></span>
                      <span className="pr-li-risk">−{Math.round(b.damage)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="pr-calm">Every chapter{focus ? ` in ${focus}` : ""} is out of the red. Keep revising to hold it there.</p>
            )}
            <p className="pr-tip">Tap a bead or a subject on the radar.</p>
          </div>
        )}
        {aside ? <div className="pr-aside">{aside}</div> : null}
      </div>
    </section>
  );
}
