"use client";

import { useCallback, useEffect, useState } from "react";
import { AlarmClock, BookOpenCheck, Brain, ListTodo, RefreshCw, Sunrise } from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";

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
    <div className="pl-wrap">
      <header className="pl-head">
        <div className="pl-head-icon"><Sunrise size={22} strokeWidth={1.8} /></div>
        <div>
          <h1 className="pl-title">Morning Command</h1>
          <p className="pl-sub">Autonomous daily planner · built from your live tracker data at 5:00 AM IST</p>
        </div>
        <button className="pl-refresh" onClick={load} disabled={loading} aria-label="Refresh plan">
          <RefreshCw size={15} className={loading ? "pl-spin" : ""} />
        </button>
      </header>

      {loading && (
        <div className="pl-state">
          <div className="pl-pulse" />
          <p>Composing today&apos;s battle plan from your goals, tests, error log and revision history…</p>
        </div>
      )}

      {!loading && data && "error" in data && (
        <div className="pl-state pl-state--error">
          <p>{data.error}</p>
          <button className="pl-btn" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && data && "status" in data && data.status === "scheduled" && (
        <div className="pl-state">
          <AlarmClock size={28} strokeWidth={1.6} />
          <h2>Agent armed</h2>
          <p>
            Morning Command activates on <strong>{formatIST(data.launchDate)}</strong> at <strong>5:00 AM IST</strong>.
            From that morning, every device with the PWA installed receives the day&apos;s full plan automatically —
            12–14 hours, half Biology, half Physics + Chemistry, with revision targets mined from what was actually studied.
          </p>
        </div>
      )}

      {!loading && data && "status" in data && data.status === "ready" && (
        <PlanView date={data.date} plan={data.plan} model={data.model} />
      )}

      <style jsx>{`
        .pl-wrap { max-width: 880px; margin: 0 auto; padding: 24px 20px 80px; }
        .pl-head { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
        .pl-head-icon {
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--gold-dim); color: var(--gold);
          border: 1px solid var(--gold-glow);
        }
        .pl-title { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--text-primary); margin: 0; }
        .pl-sub { font-size: 12.5px; color: var(--text-secondary); margin: 2px 0 0; }
        .pl-refresh {
          margin-left: auto; width: 36px; height: 36px; border-radius: 10px;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .pl-refresh:hover { color: var(--text-primary); }
        :global(.pl-spin) { animation: pl-rot 1s linear infinite; }
        @keyframes pl-rot { to { transform: rotate(360deg); } }
        .pl-state {
          text-align: center; padding: 56px 28px; border-radius: 18px;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
          color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .pl-state h2 { color: var(--text-primary); font-size: 18px; margin: 0; }
        .pl-state p { max-width: 540px; line-height: 1.6; font-size: 13.5px; margin: 0; }
        .pl-state--error { border-color: hsla(0, 72%, 62%, 0.3); }
        .pl-pulse {
          width: 42px; height: 42px; border-radius: 50%;
          border: 2px solid var(--gold-glow); border-top-color: var(--gold);
          animation: pl-rot 0.9s linear infinite;
        }
        .pl-btn {
          padding: 8px 20px; border-radius: 10px; border: 1px solid var(--gold-glow);
          background: var(--gold-dim); color: var(--gold); cursor: pointer; font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function PlanView({ date, plan, model }: { date: string; plan: PlannerPlan; model: string | null }) {
  return (
    <div className="pv">
      <section className="pv-hero">
        <div className="pv-date">{formatIST(date)}</div>
        <h2 className="pv-name">{plan.title}</h2>
        <p className="pv-summary">{plan.summary}</p>
        <div className="pv-chips">
          <span className="pv-chip pv-chip--gold">{plan.totals.studyHours}h total</span>
          <span className="pv-chip" style={{ color: "var(--botany)" }}>Biology {plan.totals.biologyHours}h</span>
          <span className="pv-chip" style={{ color: "var(--physics)" }}>Phy + Chem {plan.totals.physicsChemistryHours}h</span>
          <span className="pv-chip" style={{ color: "var(--gold-bright)" }}>Revision {plan.totals.revisionHours}h</span>
        </div>
      </section>

      <section className="pv-card">
        <h3 className="pv-h3"><AlarmClock size={15} /> Schedule</h3>
        <div className="pv-timeline">
          {plan.schedule.map((block, index) => (
            <div key={index} className={`pv-block ${block.kind === "BREAK" ? "pv-block--break" : ""}`}>
              <div className="pv-time">{block.start}<span>–{block.end}</span></div>
              <div className="pv-rail" style={{ background: SUBJECT_COLOR[block.subject] ?? "var(--gold)" }} />
              <div className="pv-body">
                <div className="pv-row">
                  <span className="pv-subject" style={{ color: SUBJECT_COLOR[block.subject] ?? "var(--gold)" }}>
                    {block.subject}
                  </span>
                  <span className="pv-kind">{KIND_LABEL[block.kind]}</span>
                </div>
                <div className="pv-focus">{block.focus}</div>
                {block.detail && <div className="pv-detail">{block.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {plan.revisionTodo.length > 0 && (
        <section className="pv-card">
          <h3 className="pv-h3"><BookOpenCheck size={15} /> Revision targets</h3>
          <ul className="pv-list">
            {plan.revisionTodo.map((item, index) => (
              <li key={index}>
                <strong>{item.subject}</strong> — {item.topic}
                <span className="pv-reason">{item.reason}{item.lastTouched ? ` · last touched ${item.lastTouched}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.insights.length > 0 && (
        <section className="pv-card">
          <h3 className="pv-h3"><Brain size={15} /> Signals behind this plan</h3>
          <ul className="pv-list pv-list--plain">
            {plan.insights.map((insight, index) => <li key={index}>{insight}</li>)}
          </ul>
        </section>
      )}

      <section className="pv-card pv-command">
        <h3 className="pv-h3">Daily command</h3>
        <p className="pv-outcome">{plan.dailyCommand.primaryOutcome}</p>
        <div className="pv-cmdgrid">
          {plan.dailyCommand.questionTarget != null && (
            <div><span>Question target</span><strong>{plan.dailyCommand.questionTarget}</strong></div>
          )}
          {plan.dailyCommand.revisionTarget && (
            <div><span>Revision target</span><strong>{plan.dailyCommand.revisionTarget}</strong></div>
          )}
        </div>
        <p className="pv-shutdown">Shutdown rule: {plan.dailyCommand.shutdownRule}</p>
      </section>

      <SmoothLink href="/todo" className="pv-todo-link">
        <ListTodo size={16} /> Today&apos;s blocks are on your Todo Deck — check them off as you go
      </SmoothLink>

      {model && <p className="pv-model">Planned by {model === "deterministic-fallback" ? "the on-device rules engine (AI offline)" : model} · regenerates fresh every morning at 5:00 AM IST</p>}

      <style jsx>{`
        .pv { display: flex; flex-direction: column; gap: 16px; }
        .pv-hero {
          padding: 22px 24px; border-radius: 18px;
          background: linear-gradient(135deg, var(--gold-dim), transparent 70%), var(--bg-surface);
          border: 1px solid var(--gold-glow);
        }
        .pv-date { font-size: 11.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); }
        .pv-name { font-family: 'Playfair Display', serif; font-size: 21px; color: var(--text-primary); margin: 6px 0 8px; }
        .pv-summary { font-size: 13.5px; line-height: 1.65; color: var(--text-secondary); margin: 0 0 14px; }
        .pv-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .pv-chip {
          font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.07); color: var(--text-secondary);
        }
        .pv-chip--gold { color: var(--gold); border-color: var(--gold-glow); }
        .pv-card {
          padding: 20px 22px; border-radius: 18px;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
        }
        .pv-h3 {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text-secondary); margin: 0 0 14px;
        }
        .pv-timeline { display: flex; flex-direction: column; gap: 6px; }
        .pv-block {
          display: grid; grid-template-columns: 92px 3px 1fr; gap: 12px;
          padding: 10px 12px; border-radius: 12px; align-items: start;
          background: var(--bg-elevated);
        }
        .pv-block--break { opacity: 0.55; background: transparent; }
        .pv-time { font-size: 12.5px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .pv-time span { color: var(--text-muted); font-weight: 500; }
        .pv-rail { width: 3px; border-radius: 3px; min-height: 30px; height: 100%; }
        .pv-row { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
        .pv-subject { font-size: 12.5px; font-weight: 800; letter-spacing: 0.03em; }
        .pv-kind { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .pv-focus { font-size: 13px; line-height: 1.5; color: var(--text-primary); }
        .pv-detail { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
        .pv-list { margin: 0; padding: 0 0 0 2px; list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .pv-list li { font-size: 13px; color: var(--text-primary); line-height: 1.5; }
        .pv-reason { display: block; font-size: 12px; color: var(--text-secondary); margin-top: 1px; }
        .pv-list--plain li { color: var(--text-secondary); }
        .pv-command { border-color: var(--gold-glow); }
        .pv-outcome { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 12px; }
        .pv-cmdgrid { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 12px; }
        .pv-cmdgrid div { display: flex; flex-direction: column; gap: 2px; }
        .pv-cmdgrid span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .pv-cmdgrid strong { font-size: 14px; color: var(--gold); }
        .pv-shutdown { font-size: 12.5px; color: var(--text-secondary); margin: 0; font-style: italic; }
        :global(.pv-todo-link) {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px; border-radius: 14px; text-decoration: none;
          background: var(--gold-dim); border: 1px solid var(--gold-glow);
          color: var(--gold); font-size: 13.5px; font-weight: 700;
        }
        .pv-model { text-align: center; font-size: 11px; color: var(--text-muted); margin: 4px 0 0; }
        @media (max-width: 540px) {
          .pv-block { grid-template-columns: 74px 3px 1fr; gap: 9px; }
        }
      `}</style>
    </div>
  );
}
