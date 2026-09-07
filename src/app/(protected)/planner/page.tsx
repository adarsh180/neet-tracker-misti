"use client";

import { useCallback, useEffect, useState } from "react";
import { AlarmClock, BookOpenCheck, Brain, ListTodo, RefreshCw, Sunrise } from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";
import styles from "./planner.module.css";
import { scheduleTotals, scheduleSummary } from "@/lib/planner-totals";

type PlannerBlock = {
  start: string;
  end: string;
  subject: string;
  kind: "STUDY" | "PRACTICE" | "REVISION" | "MOCK" | "BREAK";
  focus: string;
  detail?: string | null;
};

type PlannerPlan = {
  title: string;
  summary: string;
  insights: string[];
  totals: {
    studyHours: number;
    biologyHours: number;
    physicsChemistryHours: number;
    revisionHours: number;
  };
  schedule: PlannerBlock[];
  revisionTodo: { subject: string; topic: string; reason: string; lastTouched?: string | null }[];
  dailyCommand: {
    primaryOutcome: string;
    questionTarget: number | null;
    revisionTarget: string | null;
    studyMinutes: number | null;
    shutdownRule: string;
  };
};

type ApiResponse =
  | { status: "scheduled"; date: string; launchDate: string }
  | {
      status: "ready";
      date: string;
      launchDate: string;
      generatedNow: boolean;
      createdAt: string;
      model: string | null;
      plan: PlannerPlan;
      markdown: string;
    }
  | { error: string };

const SUBJECT_COLOR: Record<string, string> = {
  Botany: "var(--botany)",
  Zoology: "var(--zoology)",
  Physics: "var(--physics)",
  Chemistry: "var(--chemistry)",
  Mixed: "var(--gold)",
  Break: "var(--text-muted)",
};

const KIND_LABEL: Record<PlannerBlock["kind"], string> = {
  STUDY: "Deep study",
  PRACTICE: "Practice",
  REVISION: "Revision",
  MOCK: "Mock",
  BREAK: "Break",
};

function formatIST(dateIST: string) {
  try {
    return new Date(`${dateIST}T12:00:00+05:30`).toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return dateIST;
  }
}

export default function PlannerPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-plan", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error("Unable to load your plan. Please try again.");
      setData(json);
    } catch {
      setData({ error: "Could not reach the planner agent. Check your connection and retry." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={`studio-page ${styles.page}`} data-studio-native>
      <header className="studio-heading">
        <div><span className="studio-eyebrow">A little structure, a clearer day</span>
          <h1>Your study plan.</h1>
          <p>A suggested rhythm built from your saved study records. Adjust your day when you need to.</p>
        </div>
        <button className="studio-action" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? styles.spin : ""} aria-hidden="true" /> Refresh
        </button>
      </header>
      {loading && <div className={styles.state} role="status"><Sunrise size={32} /><h2>Finding your next steps…</h2><p>Loading your plan and revision targets.</p></div>}
      {!loading && data && "error" in data && <div className="studio-error" role="alert"><p>{data.error}</p><button className="studio-action" onClick={load}>Retry</button></div>}
      {!loading && data && "status" in data && data.status === "scheduled" && (
        <div className={styles.state}><AlarmClock size={32} /><h2>Your first plan is on its way.</h2><p>Planning begins {formatIST(data.launchDate)} at 5:00 AM IST. You can add your own tasks in the meantime.</p><SmoothLink href="/todo" className="studio-action">Open Todo</SmoothLink></div>
      )}
      {!loading && data && "status" in data && data.status === "ready" && <PlanView date={data.date} plan={data.plan} model={data.model} />}
    </div>
  );
}

function PlanView({ date, plan, model }: { date: string; plan: PlannerPlan; model: string | null }) {
  const totals = scheduleTotals(plan.schedule);
  return (
    <div className={styles.plan}>
      <section className={styles.summary}>
        <span className="studio-eyebrow">{formatIST(date)}</span>
        <h2>{plan.title}</h2>
        <p>{scheduleSummary(totals)}</p>
        <dl className={styles.totals}>
          {[
            ["Planned study", totals.studyHours],
            ["Biology", totals.biologyHours],
            ["Physics + Chemistry", totals.physicsChemistryHours],
            ["Revision included", totals.revisionHours],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}<span> h</span></dd></div>)}
        </dl>
      </section>
      <div className={styles.columns}>
        <section className={styles.schedule} aria-label="Suggested study schedule">
          <div className={styles.sectionHead}><h2>Your day, in chapters.</h2><span>{plan.schedule.length} blocks · IST</span></div>
          {plan.schedule.length === 0 && <p className={styles.empty}>No timed blocks yet. You can still add a task to your Todo page.</p>}
          <ol className={styles.timeline}>
            {plan.schedule.map((block, index) => (
              <li key={index} className={styles.block} data-break={block.kind === "BREAK"} style={{ borderLeftColor: SUBJECT_COLOR[block.subject] ?? "var(--gold)" }}>
                <div className={styles.time}>{block.start}<span>{block.end}</span></div>
                <div className={styles.blockBody}>
                  <div className={styles.blockMeta}><span style={{ color: SUBJECT_COLOR[block.subject] ?? "var(--gold)" }}>{block.subject}</span><span>{KIND_LABEL[block.kind]}</span></div>
                  <h3>{block.focus}</h3>
                  {block.detail && <p>{block.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside className={styles.rail}>
          <section className={styles.card}>
            <div className={styles.sectionHead}><h2>One thing to aim for</h2><Sunrise size={20} aria-hidden="true" /></div>
            <p className={styles.outcome}>{plan.dailyCommand.primaryOutcome}</p>
            <dl className={styles.targets}>
              {plan.dailyCommand.questionTarget != null && <div><dt>Questions</dt><dd>{plan.dailyCommand.questionTarget}</dd></div>}
              {plan.dailyCommand.revisionTarget && <div><dt>Revisit</dt><dd>{plan.dailyCommand.revisionTarget}</dd></div>}
            </dl>
            <p className={styles.shutdown}>{plan.dailyCommand.shutdownRule}</p>
            <SmoothLink href="/todo" className="studio-action"><ListTodo size={16} /> Open your Todo page</SmoothLink>
          </section>
          {plan.revisionTodo.length > 0 && <section className={styles.card}>
            <div className={styles.sectionHead}><h2>Worth revisiting</h2><BookOpenCheck size={20} aria-hidden="true" /></div>
            <ul className={styles.revisions}>{plan.revisionTodo.map((item, index) => <li key={index}><span>{item.subject}</span><h3>{item.topic}</h3><p>{item.reason}</p>{item.lastTouched && <small>Last studied {item.lastTouched}</small>}</li>)}</ul>
          </section>}
          {plan.insights.length > 0 && <details className={styles.card}>
            <summary className={styles.explain}><Brain size={18} aria-hidden="true" /> Why this plan?</summary>
            <ul className={styles.signals}>{plan.insights.map((insight, index) => <li key={index}>{insight}</li>)}</ul>
          </details>}
        </aside>
      </div>
      <p className={styles.footnote}>{model === "deterministic-fallback" ? "Prepared by the server’s planning rules." : "Generated suggestions, not a fixed commitment."} Planned hours are targets, not hours already studied.</p>
    </div>
  );
}
