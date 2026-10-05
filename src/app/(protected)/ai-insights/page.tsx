"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight, Brain, ClipboardCheck, Heart, Sunrise, TrendingUp } from "lucide-react";

import SmoothLink from "@/components/layout/smooth-link";
import { PulseHead } from "@/components/pulse/pulse-head";

const MODULES = [
  {
    href: "/ai-insights/neet-guru",
    icon: Brain,
    title: "NEET-GURU",
    desc: "Your AIIMS-focused mentor. Study plans, practice MCQs and honest breakdowns — it reads every log you keep.",
    tag: "Personal mentor",
    accent: "var(--pl-a1)",
  },
  {
    href: "/ai-insights/rank-predictor",
    icon: TrendingUp,
    title: "Rank predictor",
    desc: "Syllabus, mock scores and study hours weighed against the AIIMS Delhi and Rishikesh cut-offs.",
    tag: "Deep analysis",
    accent: "var(--physics)",
  },
  {
    href: "/ai-insights/cycle-planner",
    icon: Heart,
    title: "Wellness planner",
    desc: "Phase-aware study schedules from your cycle data and daily mood — plan with the body, not against it.",
    tag: "Mood aware",
    accent: "var(--pl-a2)",
  },
  {
    href: "/planner",
    icon: Sunrise,
    title: "Morning command",
    desc: "A full day's plan composed at 5 AM from goals, tests, the error log and what's due for revision.",
    tag: "Autonomous",
    accent: "var(--chemistry)",
  },
  {
    href: "/reviews",
    icon: ClipboardCheck,
    title: "Review cards",
    desc: "Weekly and monthly report cards with a truth check that cross-examines your answers against real logs.",
    tag: "Integrity audit",
    accent: "var(--botany)",
  },
];

export default function AIInsightsPage() {
  return (
    <main className="pl-page ax">
      <PulseHead
        kicker="Reads your real study data"
        deva="बुद्धि"
        title="Intelligence"
        accent="suite."
        lede="Five specialists on call. Each one opens your actual logs — hours, mocks, chapters, mood — before it says a word."
        stats={[
          { label: "Modules", value: MODULES.length, level: 1 },
          { label: "Data", value: "Live", level: 1, tone: "good", note: "goals, tests, mood, syllabus" },
          { label: "Aim", value: "AIIMS", level: 1, tone: "accent", note: "Delhi · MBBS 2027" },
        ]}
      />

      <ol className="ax-list">
        {MODULES.map((m, i) => (
          <li key={m.href} style={{ "--c": m.accent, "--i": i } as CSSProperties}>
            <SmoothLink href={m.href} className="ax-row" direction="forward">
              <span className="ax-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="ax-orb">
                <m.icon size={22} strokeWidth={1.8} />
              </span>
              <span className="ax-copy">
                <span className="ax-tag">{m.tag}</span>
                <strong>{m.title}</strong>
                <span className="ax-desc">{m.desc}</span>
              </span>
              <span className="ax-go" aria-hidden="true">
                <ArrowUpRight size={20} />
              </span>
            </SmoothLink>
          </li>
        ))}
      </ol>
    </main>
  );
}
