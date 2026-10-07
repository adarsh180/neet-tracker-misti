"use client";

import { useMemo, useState, type CSSProperties } from "react";

import SmoothLink from "@/components/layout/smooth-link";
import { Roll } from "@/components/pulse/roll";
import type { SyllabusCompletion, SyllabusTopic } from "@/lib/readiness";

const SUBJECT_COLOR: Record<string, string> = {
  Physics: "var(--physics)",
  Chemistry: "var(--chemistry)",
  Botany: "var(--botany)",
  Zoology: "var(--zoology)",
};

const SIZE = 360;
const C = SIZE / 2;
const RIM = 156; // glass rim
const AGAR = 146; // culture surface
const HOLE = 50; // clear centre for the readout
const OUTER = 134; // outermost colony centre
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

type Colony = SyllabusTopic & { x: number; y: number; r: number; size: number; subject: string; slug: string; order: number };

/**
 * The syllabus as a culture in a petri dish. Every topic is a colony laid on a
 * sunflower spiral; each subject owns the slice of the dish its topic count
 * earns, with early chapters near the centre growing outward. Finished topics
 * are lit colonies, revised ones carry a halo, recent revisions pulse.
 */
function useColonies(syllabus: SyllabusCompletion) {
  return useMemo(() => {
    const subjects = syllabus.subjects.filter((s) => s.items.length);
    const n = subjects.reduce((sum, s) => sum + s.items.length, 0);
    if (!n) return { colonies: [] as Colony[], dot: 6, cuts: [] as Array<{ subject: string; from: number; to: number }> };

    const spacing = Math.sqrt((Math.PI * (OUTER * OUTER - HOLE * HOLE)) / n);
    const dot = Math.max(3, Math.min(10, spacing * 0.36));
    // Phyllotaxis points, measured clockwise from twelve o'clock.
    const pts = Array.from({ length: n }, (_, i) => {
      const rad = HOLE + dot + (OUTER - HOLE - dot) * Math.sqrt((i + 0.5) / n);
      const theta = i * GOLDEN;
      const a = (((theta + Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return { rad, a, x: C + rad * Math.sin(a), y: C - rad * Math.cos(a) };
    }).sort((p, q) => p.a - q.a);

    const colonies: Colony[] = [];
    const cuts: Array<{ subject: string; from: number; to: number }> = [];
    // Colony size follows the exam marks a topic carries (area ∝ marks).
    const maxMarks = Math.max(1, ...subjects.flatMap((s) => s.items.map((t) => t.marks)));
    const sizeOf = (marks: number) => (marks > 0 ? 0.62 + 0.68 * Math.sqrt(marks / maxMarks) : 0.5);
    let k = 0;
    for (const s of subjects) {
      const slice = pts.slice(k, k + s.items.length).sort((p, q) => p.rad - q.rad);
      const from = pts[k]?.a ?? 0;
      k += s.items.length;
      const to = pts[k - 1]?.a ?? from;
      cuts.push({ subject: s.key, from, to });
      slice.forEach((p, i) =>
        colonies.push({ ...s.items[i], x: p.x, y: p.y, r: p.rad, size: sizeOf(s.items[i].marks), subject: s.key, slug: s.slug, order: Math.round(((p.rad - HOLE) / (OUTER - HOLE)) * 20) }),
      );
    }
    return { colonies, dot, cuts };
  }, [syllabus]);
}

const polar = (a: number, rad: number) => ({ x: C + rad * Math.sin(a), y: C - rad * Math.cos(a) });

export function SyllabusDish({ syllabus }: { syllabus: SyllabusCompletion }) {
  const { colonies, dot, cuts } = useColonies(syllabus);
  const [hover, setHover] = useState<Colony | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const pct = Math.round(syllabus.marksShare * 100);

  // Divider angles sit halfway between neighbouring subjects' outermost points.
  const dividers = cuts.map((c, i) => {
    const next = cuts[(i + 1) % cuts.length];
    let mid = (c.to + (next.from + (i === cuts.length - 1 ? 2 * Math.PI : 0))) / 2;
    if (mid > 2 * Math.PI) mid -= 2 * Math.PI;
    return mid;
  });
  const labels = cuts.map((c, i) => {
    const start = i === 0 ? dividers[cuts.length - 1] - 2 * Math.PI : dividers[i - 1];
    return { subject: c.subject, a: (start + dividers[i]) / 2 };
  });

  return (
    <div className="sd">
      <div className="sd-top">
        <span className="rf-k">Syllabus completion</span>
        <span className="sd-hint">each dot is a topic · size = exam marks</span>
      </div>

      <div className="sd-stage" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`-38 -22 ${SIZE + 76} ${SIZE + 44}`} className="sd-dish" role="img" aria-label={`${pct}% of NEET exam marks covered by finished chapters: ${syllabus.done} of ${syllabus.topics} topics, ${syllabus.revised} revised`}>
          <defs>
            <radialGradient id="sd-agar" cx="50%" cy="45%" r="60%">
              <stop offset="0%" className="sd-agar-0" />
              <stop offset="100%" className="sd-agar-1" />
            </radialGradient>
            <linearGradient id="sd-rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" className="sd-rim-0" />
              <stop offset="45%" className="sd-rim-1" />
              <stop offset="100%" className="sd-rim-2" />
            </linearGradient>
          </defs>

          <circle className="sd-shadow" cx={C} cy={C + 6} r={RIM} />
          <circle className="sd-agar" cx={C} cy={C} r={AGAR} fill="url(#sd-agar)" />
          {[0.42, 0.64, 0.86].map((f) => (
            <circle key={f} className="sd-ring" cx={C} cy={C} r={HOLE + (AGAR - HOLE) * f} />
          ))}
          {dividers.map((a, i) => {
            const p0 = polar(a, HOLE - 6);
            const p1 = polar(a, AGAR - 4);
            return <line key={i} className="sd-cut" x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} />;
          })}

          <g className={`sd-colonies ${focus ? "has-focus" : ""}`}>
            {colonies.map((c, i) => (
              <g
                key={`${c.subject}-${i}`}
                className={`sd-col ${c.done ? "is-done" : "is-todo"} ${c.revised ? "is-rev" : ""} ${c.fresh ? "is-fresh" : ""} ${focus === c.subject ? "is-focus" : ""} ${hover === c ? "is-hover" : ""}`}
                style={{ "--c": SUBJECT_COLOR[c.subject], "--d": c.order } as CSSProperties}
                transform={`translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`}
                onMouseEnter={() => setHover(c)}
              >
                <circle className="sd-hit" r={dot * c.size + 4} />
                {c.revised ? <circle className="sd-halo" r={dot * c.size + 3} /> : null}
                <circle className={`sd-cell ${c.marks ? "" : "is-base"}`} r={dot * c.size * (c.done ? 1 : 0.62)} />
                {c.done ? <circle className="sd-nucleus" r={dot * c.size * 0.32} cx={-dot * c.size * 0.22} cy={-dot * c.size * 0.22} /> : null}
              </g>
            ))}
          </g>

          <circle className="sd-rim" cx={C} cy={C} r={RIM} stroke="url(#sd-rim)" />
          <circle className="sd-rim-in" cx={C} cy={C} r={RIM - 7} />
          <path className="sd-gloss" d={`M ${polar(-1.15, RIM - 3).x} ${polar(-1.15, RIM - 3).y} A ${RIM - 3} ${RIM - 3} 0 0 1 ${polar(-0.2, RIM - 3).x} ${polar(-0.2, RIM - 3).y}`} />

          {labels.map((l) => {
            const p = polar(l.a, RIM + 21);
            return (
              <text key={l.subject} className={`sd-label ${focus === l.subject ? "is-on" : ""}`} x={p.x} y={p.y} style={{ "--c": SUBJECT_COLOR[l.subject] } as CSSProperties}>
                {l.subject}
              </text>
            );
          })}
        </svg>

        <div className="sd-core">
          <strong>
            <Roll value={pct} />
            <small>%</small>
          </strong>
          <span>of exam marks</span>
          <span className="sd-core-sub">{syllabus.done}/{syllabus.topics} topics</span>
        </div>
      </div>

      {/* Specimen label: whatever colony the pointer rests on. */}
      <div className={`sd-label-card ${hover ? "is-live" : ""}`} style={{ "--c": hover ? SUBJECT_COLOR[hover.subject] : "var(--pl-a1)" } as CSSProperties} aria-live="polite">
        {hover ? (
          <>
            <span className="sd-lc-k">
              <i /> {hover.subject} · {hover.chapter || "General"}
            </span>
            <strong>{hover.name}</strong>
            <span className="sd-lc-tags">
              <em className={hover.done ? "t-done" : "t-todo"}>{hover.done ? "Done" : "Not yet"}</em>
              {hover.revised ? <em className="t-rev">{hover.fresh ? "Revised · last 14 days" : "Revised"}</em> : null}
              <em className="t-marks">{hover.marks ? `~${hover.marks} of 720 marks` : "foundation · not examined directly"}</em>
              {hover.questions ? <em>{hover.questions} MCQs</em> : null}
            </span>
          </>
        ) : (
          <>
            <span className="sd-lc-k">
              <i /> Specimen label
            </span>
            <strong>Rest on any colony to read it</strong>
            <span className="sd-lc-tags">
              <em className="t-done">● lit = done</em>
              <em className="t-rev">◎ halo = revised</em>
              <em>· faint = to do</em>
              <em className="t-marks">bigger = more marks</em>
            </span>
          </>
        )}
      </div>

      <div className="sd-subjects">
        {syllabus.subjects.map((s) => {
          const p = s.marksTotal ? s.marksDone / s.marksTotal : 0;
          return (
            <SmoothLink
              key={s.key}
              href={`/subjects/${s.slug}`}
              className={`sd-sub ${focus === s.key ? "is-on" : ""}`}
              style={{ "--c": SUBJECT_COLOR[s.key], "--p": p } as CSSProperties}
              onMouseEnter={() => setFocus(s.key)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(s.key)}
              onBlur={() => setFocus(null)}
            >
              <span className="sd-sub-name">{s.key}</span>
              <b>{Math.round(p * 100)}%</b>
              <span className="sd-sub-meta">~{Math.round(s.marksDone)}/{Math.round(s.marksTotal)} marks · {s.done}/{s.topics} topics</span>
              <span className="sd-sub-bar" aria-hidden="true"><i /></span>
            </SmoothLink>
          );
        })}
      </div>
      {syllabus.gaps.length ? (
        <p className="sd-gaps">
          Not in your tracker yet: {syllabus.gaps.map((g) => `${g.chapter} (~${Math.round(g.marks)} marks)`).join(", ")}. Add them so the dish counts them.
        </p>
      ) : (
        <p className="sd-gaps is-ok">Every chapter of the NMC syllabus is in your tracker.</p>
      )}
    </div>
  );
}
