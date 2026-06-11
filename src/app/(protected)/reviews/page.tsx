"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, ClipboardCheck, History, LineChart as LineChartIcon,
  RefreshCw, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp,
} from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import ResponsiveChart from "@/components/charts/ResponsiveChart";

type ReviewQuestion = { id: string; question: string; options: string[] };

type ReviewVerdict = {
  integrityScore: number;
  verdict: "HONEST" | "MOSTLY_HONEST" | "INCONSISTENT" | "FAKING";
  perQuestion: { id: string; consistent: boolean | null; note: string }[];
  message: string;
  consequence: string;
};

type ReviewCardData = {
  id: string;
  period: "WEEKLY" | "MONTHLY";
  periodStart: string;
  periodEnd: string;
  status: "AWAITING_ANSWERS" | "COMPLETED";
  review: {
    title: string;
    summary: string;
    grade: string;
    wins: string[];
    gaps: string[];
    subjectBreakdown: { subject: string; hours: number; questions: number; verdictLine: string }[];
    trend: { hoursDelta: number; questionsDelta: number; line: string };
    focusForNextPeriod: string[];
    integritySignals: { detail: string; severity: number }[];
    metrics?: {
      hours: number;
      questions: number;
      activeDays: number;
      periodDays: number;
      topicsCompleted: number;
      revisions: number;
      testsTaken: number;
      avgTestPercentage: number | null;
      distractionHours: number;
    };
  };
  questions: ReviewQuestion[];
  verdict: ReviewVerdict | null;
};

const VERDICT_META: Record<ReviewVerdict["verdict"], { label: string; color: string }> = {
  HONEST: { label: "Honest", color: "var(--success)" },
  MOSTLY_HONEST: { label: "Mostly honest", color: "var(--gold)" },
  INCONSISTENT: { label: "Inconsistent", color: "hsl(28, 90%, 58%)" },
  FAKING: { label: "Faked logs detected", color: "var(--danger)" },
};

const GRADE_SCORE: Record<string, number> = { "A+": 100, A: 92, "B+": 82, B: 72, C: 58, D: 42, F: 25 };

function formatRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "Asia/Kolkata" };
  try {
    return `${new Date(`${start}T12:00:00+05:30`).toLocaleDateString("en-IN", opts)} – ${new Date(`${end}T12:00:00+05:30`).toLocaleDateString("en-IN", { ...opts, year: "numeric" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function cardHours(card: ReviewCardData) {
  if (card.review.metrics) return card.review.metrics.hours;
  return Math.round(card.review.subjectBreakdown.reduce((sum, row) => sum + row.hours, 0) * 10) / 10;
}

function cardQuestions(card: ReviewCardData) {
  if (card.review.metrics) return card.review.metrics.questions;
  return card.review.subjectBreakdown.reduce((sum, row) => sum + row.questions, 0);
}

export default function ReviewsPage() {
  const [cards, setCards] = useState<ReviewCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load reviews");
      setCards(json.cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the review agent.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replaceCard = (next: ReviewCardData) => {
    setCards((prev) => (prev ? prev.map((card) => (card.id === next.id ? next : card)) : prev));
  };

  // Cards arrive newest-first. The newest weekly + newest monthly are "current";
  // everything older automatically becomes history when a new one lands.
  const { current, history } = useMemo(() => {
    if (!cards) return { current: [], history: [] };
    const latestWeekly = cards.find((card) => card.period === "WEEKLY");
    const latestMonthly = cards.find((card) => card.period === "MONTHLY");
    const currentIds = new Set([latestWeekly?.id, latestMonthly?.id].filter(Boolean));
    return {
      current: cards.filter((card) => currentIds.has(card.id)),
      history: cards.filter((card) => !currentIds.has(card.id)),
    };
  }, [cards]);

  return (
    <div className="rv-wrap">
      <header className="rv-head">
        <div className="rv-head-icon"><ClipboardCheck size={22} strokeWidth={1.8} /></div>
        <div>
          <h1 className="rv-title">Review Cards</h1>
          <p className="rv-sub">Weekly & monthly report cards with a Truth Check — every answer is cross-examined against your logs</p>
        </div>
        <button className="rv-refresh" onClick={load} disabled={loading} aria-label="Refresh">
          <RefreshCw size={15} className={loading ? "rv-spin" : ""} />
        </button>
      </header>

      {loading && (
        <div className="rv-state">
          <div className="rv-pulse" />
          <p>Auditing your logs and preparing review cards…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rv-state rv-state--error">
          <p>{error}</p>
          <button className="rv-btn" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && cards && cards.length === 0 && (
        <div className="rv-state"><p>No review periods completed yet. The first card lands after a full Mon–Sun week.</p></div>
      )}

      {!loading && !error && current.length > 0 && (
        <>
          <h2 className="rv-section">Current review</h2>
          {current.map((card) => (
            <ReviewCardView key={card.id} card={card} onUpdated={replaceCard} defaultOpen={card.status === "AWAITING_ANSWERS"} />
          ))}
        </>
      )}

      {!loading && !error && cards && cards.length >= 2 && <ProgressCharts cards={cards} />}

      {!loading && !error && history.length > 0 && (
        <>
          <h2 className="rv-section"><History size={15} /> History</h2>
          {history.map((card) => (
            <ReviewCardView key={card.id} card={card} onUpdated={replaceCard} defaultOpen={false} />
          ))}
        </>
      )}

      <style jsx>{`
        .rv-wrap { max-width: 880px; margin: 0 auto; padding: 24px 20px 80px; display: flex; flex-direction: column; gap: 16px; }
        .rv-head { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
        .rv-head-icon {
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--gold-dim); color: var(--gold); border: 1px solid var(--gold-glow);
        }
        .rv-title { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--text-primary); margin: 0; }
        .rv-sub { font-size: 12.5px; color: var(--text-secondary); margin: 2px 0 0; }
        .rv-refresh {
          margin-left: auto; width: 36px; height: 36px; border-radius: 10px;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        :global(.rv-spin) { animation: rv-rot 1s linear infinite; }
        @keyframes rv-rot { to { transform: rotate(360deg); } }
        .rv-section {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted); margin: 10px 0 -4px;
        }
        .rv-state {
          text-align: center; padding: 48px 28px; border-radius: 18px;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
          color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 12px;
          font-size: 13.5px;
        }
        .rv-state--error { border-color: hsla(0, 72%, 62%, 0.3); }
        .rv-pulse {
          width: 42px; height: 42px; border-radius: 50%;
          border: 2px solid var(--gold-glow); border-top-color: var(--gold);
          animation: rv-rot 0.9s linear infinite;
        }
        .rv-btn {
          padding: 8px 20px; border-radius: 10px; border: 1px solid var(--gold-glow);
          background: var(--gold-dim); color: var(--gold); cursor: pointer; font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function ProgressCharts({ cards }: { cards: ReviewCardData[] }) {
  const [tab, setTab] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");

  const data = useMemo(
    () =>
      cards
        .filter((card) => card.period === tab)
        .slice()
        .reverse()
        .map((card) => ({
          label: new Date(`${card.periodStart}T12:00:00+05:30`).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            timeZone: "Asia/Kolkata",
          }),
          hours: cardHours(card),
          questions: cardQuestions(card),
          grade: card.review.grade,
          gradeScore: GRADE_SCORE[card.review.grade] ?? 50,
          integrity: card.verdict?.integrityScore ?? null,
          verdict: card.verdict ? VERDICT_META[card.verdict.verdict].label : "Truth Check pending",
        })),
    [cards, tab],
  );

  if (data.length < 2 && cards.filter((card) => card.period === (tab === "WEEKLY" ? "MONTHLY" : "WEEKLY")).length < 2) {
    return (
      <section className="pc">
        <h2 className="pc-h"><LineChartIcon size={15} /> Progress</h2>
        <p className="pc-empty">Graphs unlock once two {tab.toLowerCase()} reviews exist — every new card extends the curve.</p>
        <style jsx>{`
          .pc { padding: 18px 20px; border-radius: 18px; background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06); }
          .pc-h { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin: 0 0 8px; }
          .pc-empty { font-size: 12.5px; color: var(--text-secondary); margin: 0; }
        `}</style>
      </section>
    );
  }

  return (
    <section className="pc">
      <div className="pc-top">
        <h2 className="pc-h"><LineChartIcon size={15} /> Progress</h2>
        <div className="pc-tabs">
          <button className={tab === "WEEKLY" ? "pc-tab pc-tab--on" : "pc-tab"} onClick={() => setTab("WEEKLY")}>Weekly</button>
          <button className={tab === "MONTHLY" ? "pc-tab pc-tab--on" : "pc-tab"} onClick={() => setTab("MONTHLY")}>Monthly</button>
        </div>
      </div>

      {data.length < 2 ? (
        <p className="pc-empty">Not enough {tab.toLowerCase()} cards yet — graphs appear from the second one.</p>
      ) : (
        <>
          <ResponsiveChart height={260}>
            {(width, height) => (
              <ComposedChart width={width} height={height} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="hours" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="score" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-raised)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text-primary)", fontWeight: 700 }}
                  formatter={(value, name, item) => {
                    const payload = (item as { payload?: { grade?: string; questions?: number; verdict?: string } }).payload;
                    if (name === "Study hours") return [`${value}h (grade ${payload?.grade}, ${payload?.questions} Qs)`, name];
                    if (name === "Integrity") return [`${value}/100 (${payload?.verdict})`, name];
                    if (name === "Grade") return [`${payload?.grade}`, name];
                    return [String(value ?? ""), name];
                  }}
                />
                <Bar yAxisId="hours" dataKey="hours" name="Study hours" fill="var(--gold)" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={42} />
                <Line yAxisId="score" dataKey="gradeScore" name="Grade" stroke="var(--physics)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="score" dataKey="integrity" name="Integrity" stroke="var(--success)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            )}
          </ResponsiveChart>
          <div className="pc-legend">
            <span><i style={{ background: "var(--gold)" }} /> Study hours</span>
            <span><i style={{ background: "var(--physics)" }} /> Grade trend</span>
            <span><i style={{ background: "var(--success)" }} /> Integrity (honesty) score</span>
          </div>
        </>
      )}

      <style jsx>{`
        .pc { padding: 18px 20px; border-radius: 18px; background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06); }
        .pc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .pc-h { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin: 0; }
        .pc-tabs { display: flex; gap: 6px; }
        .pc-tab {
          padding: 5px 14px; border-radius: 999px; font-size: 11.5px; font-weight: 700; cursor: pointer;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary);
        }
        .pc-tab--on { background: var(--gold-dim); border-color: var(--gold-glow); color: var(--gold); }
        .pc-empty { font-size: 12.5px; color: var(--text-secondary); margin: 0; }
        .pc-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; }
        .pc-legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }
        .pc-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
      `}</style>
    </section>
  );
}

function ReviewCardView({
  card,
  onUpdated,
  defaultOpen,
}: {
  card: ReviewCardData;
  onUpdated: (card: ReviewCardData) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const review = card.review;
  const allAnswered = card.questions.every((question) => answers[question.id] !== undefined);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/reviews/${card.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([id, optionIndex]) => ({ id, optionIndex })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Evaluation failed");
      onUpdated(json.card);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const verdictMeta = card.verdict ? VERDICT_META[card.verdict.verdict] : null;

  return (
    <section className="rc">
      <button className="rc-top" onClick={() => setOpen((value) => !value)}>
        <span className={`rc-period ${card.period === "MONTHLY" ? "rc-period--m" : ""}`}>
          {card.period === "WEEKLY" ? "Weekly" : "Monthly"}
        </span>
        <span className="rc-range">{formatRange(card.periodStart, card.periodEnd)}</span>
        <span className="rc-grade">Grade {review.grade}</span>
        {card.status === "AWAITING_ANSWERS" ? (
          <span className="rc-badge rc-badge--pending"><ShieldAlert size={13} /> Truth Check pending</span>
        ) : verdictMeta ? (
          <span className="rc-badge" style={{ color: verdictMeta.color, borderColor: "currentColor" }}>
            <ShieldCheck size={13} /> {verdictMeta.label} · {card.verdict?.integrityScore}/100
          </span>
        ) : null}
      </button>

      {open && (
        <div className="rc-body">
          <h2 className="rc-title">{review.title}</h2>
          <p className="rc-summary">{review.summary}</p>

          {review.metrics && (
            <div className="rc-metrics">
              <span><strong>{review.metrics.hours}h</strong> studied</span>
              <span><strong>{review.metrics.questions}</strong> questions</span>
              <span><strong>{review.metrics.activeDays}/{review.metrics.periodDays}</strong> active days</span>
              <span><strong>{review.metrics.topicsCompleted}</strong> topics done</span>
              <span><strong>{review.metrics.revisions}</strong> revisions</span>
              <span><strong>{review.metrics.testsTaken}</strong> tests{review.metrics.avgTestPercentage !== null ? ` · ${review.metrics.avgTestPercentage}%` : ""}</span>
            </div>
          )}

          <div className="rc-grid">
            <div className="rc-col">
              <h4>Wins</h4>
              <ul>{review.wins.map((win, index) => <li key={index}>{win}</li>)}</ul>
            </div>
            <div className="rc-col">
              <h4>Gaps</h4>
              <ul>{review.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
            </div>
          </div>

          {review.subjectBreakdown.length > 0 && (
            <div className="rc-subjects">
              {review.subjectBreakdown.map((row, index) => (
                <div key={index} className="rc-subject">
                  <strong>{row.subject}</strong>
                  <span>{row.hours}h · {row.questions} Qs</span>
                  <em>{row.verdictLine}</em>
                </div>
              ))}
            </div>
          )}

          <p className="rc-trend">
            {review.trend.hoursDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {review.trend.line}
          </p>

          {review.integritySignals.length > 0 && (
            <div className="rc-signals">
              <h4><ShieldAlert size={14} /> Log forensics flagged</h4>
              <ul>
                {review.integritySignals.map((signal, index) => (
                  <li key={index} data-sev={signal.severity}>{signal.detail}</li>
                ))}
              </ul>
            </div>
          )}

          {review.focusForNextPeriod.length > 0 && (
            <div className="rc-focus">
              <h4>Next period directives</h4>
              <ul>{review.focusForNextPeriod.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}

          {card.status === "AWAITING_ANSWERS" && (
            <div className="rc-truth">
              <h3><ShieldCheck size={16} /> Truth Check</h3>
              <p className="rc-truth-note">
                Answer honestly. Every reply is cross-checked against what the tracker actually recorded.
              </p>
              {card.questions.map((question, qIndex) => (
                <fieldset key={question.id} className="rc-q">
                  <legend>{qIndex + 1}. {question.question}</legend>
                  {question.options.map((option, index) => (
                    <label key={index} className={`rc-opt ${answers[question.id] === index ? "rc-opt--on" : ""}`}>
                      <input
                        type="radio"
                        name={`${card.id}-${question.id}`}
                        checked={answers[question.id] === index}
                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: index }))}
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
              ))}
              {submitError && <p className="rc-err">{submitError}</p>}
              <button className="rc-submit" disabled={!allAnswered || submitting} onClick={submit}>
                {submitting ? "The agent is cross-examining your answers…" : allAnswered ? "Submit for judgment" : `Answer all ${card.questions.length} questions`}
              </button>
            </div>
          )}

          {card.status === "COMPLETED" && card.verdict && verdictMeta && (
            <div className="rc-verdict" style={{ borderColor: verdictMeta.color }}>
              <div className="rc-verdict-head" style={{ color: verdictMeta.color }}>
                <BadgeCheck size={18} />
                <strong>{verdictMeta.label}</strong>
                <span className="rc-score">{card.verdict.integrityScore}/100 integrity</span>
              </div>
              <p className="rc-verdict-msg">{card.verdict.message}</p>
              {card.verdict.consequence && <p className="rc-verdict-con">{card.verdict.consequence}</p>}
              {card.verdict.perQuestion.some((entry) => entry.consistent === false) && (
                <ul className="rc-verdict-list">
                  {card.verdict.perQuestion
                    .filter((entry) => entry.consistent === false)
                    .map((entry) => {
                      const question = card.questions.find((item) => item.id === entry.id);
                      return (
                        <li key={entry.id}>
                          <strong>{question?.question}</strong>
                          <span>{entry.note}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .rc {
          border-radius: 18px; background: var(--bg-surface);
          border: 1px solid rgba(255,255,255,0.06); overflow: hidden;
        }
        .rc-top {
          width: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
          padding: 16px 18px; background: none; border: none; cursor: pointer; text-align: left;
        }
        .rc-period {
          font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
          padding: 4px 10px; border-radius: 999px;
          background: var(--gold-dim); color: var(--gold); border: 1px solid var(--gold-glow);
        }
        .rc-period--m { background: hsla(270, 68%, 62%, 0.12); color: var(--chemistry); border-color: hsla(270, 68%, 62%, 0.3); }
        .rc-range { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
        .rc-grade { font-size: 12.5px; font-weight: 800; color: var(--gold-bright); }
        .rc-badge {
          margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14); color: var(--text-secondary);
        }
        .rc-badge--pending { color: hsl(28, 90%, 62%); border-color: hsla(28, 90%, 58%, 0.4); }
        .rc-body { padding: 4px 18px 20px; display: flex; flex-direction: column; gap: 14px; }
        .rc-title { font-size: 16px; color: var(--text-primary); margin: 0; }
        .rc-summary { font-size: 13.5px; line-height: 1.65; color: var(--text-secondary); margin: 0; }
        .rc-metrics { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 10px 14px; border-radius: 12px; background: var(--bg-elevated); }
        .rc-metrics span { font-size: 12px; color: var(--text-secondary); }
        .rc-metrics strong { color: var(--gold); font-size: 13px; }
        .rc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .rc-col h4, .rc-signals h4, .rc-focus h4 {
          font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-muted); margin: 0 0 8px; display: flex; align-items: center; gap: 6px;
        }
        .rc-col ul, .rc-signals ul, .rc-focus ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 6px; }
        .rc-col li, .rc-focus li { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
        .rc-subjects { display: flex; flex-wrap: wrap; gap: 8px; }
        .rc-subject {
          flex: 1 1 180px; padding: 10px 12px; border-radius: 12px; background: var(--bg-elevated);
          display: flex; flex-direction: column; gap: 2px;
        }
        .rc-subject strong { font-size: 12.5px; color: var(--text-primary); }
        .rc-subject span { font-size: 12px; color: var(--gold); font-weight: 700; }
        .rc-subject em { font-size: 11.5px; color: var(--text-secondary); font-style: normal; }
        .rc-trend { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-secondary); margin: 0; }
        .rc-signals {
          padding: 12px 14px; border-radius: 12px;
          background: hsla(0, 72%, 62%, 0.06); border: 1px solid hsla(0, 72%, 62%, 0.18);
        }
        .rc-signals h4 { color: var(--danger); }
        .rc-signals li { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
        .rc-signals li[data-sev="3"] { color: var(--danger); font-weight: 600; }
        .rc-focus li { font-weight: 500; }
        .rc-truth {
          padding: 16px; border-radius: 14px;
          background: var(--bg-elevated); border: 1px solid var(--gold-glow);
        }
        .rc-truth h3 {
          display: flex; align-items: center; gap: 8px; margin: 0 0 4px;
          font-size: 14.5px; color: var(--gold);
        }
        .rc-truth-note { font-size: 12px; color: var(--text-secondary); margin: 0 0 14px; }
        .rc-q { border: none; padding: 0; margin: 0 0 16px; }
        .rc-q legend { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; line-height: 1.5; }
        .rc-opt {
          display: flex; align-items: center; gap: 9px;
          padding: 8px 12px; margin-bottom: 6px; border-radius: 10px; cursor: pointer;
          font-size: 12.5px; color: var(--text-secondary);
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
        }
        .rc-opt--on { border-color: var(--gold); color: var(--text-primary); background: var(--gold-dim); }
        .rc-opt input { accent-color: var(--gold); }
        .rc-err { font-size: 12.5px; color: var(--danger); margin: 0 0 8px; }
        .rc-submit {
          width: 100%; padding: 12px; border-radius: 12px; border: 1px solid var(--gold-glow);
          background: var(--gold-dim); color: var(--gold); font-weight: 800; font-size: 13.5px; cursor: pointer;
        }
        .rc-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .rc-verdict { padding: 16px; border-radius: 14px; border: 1px solid; background: var(--bg-elevated); }
        .rc-verdict-head { display: flex; align-items: center; gap: 8px; font-size: 14.5px; margin-bottom: 10px; }
        .rc-score { margin-left: auto; font-size: 12px; font-weight: 800; }
        .rc-verdict-msg { font-size: 13.5px; line-height: 1.7; color: var(--text-primary); margin: 0 0 8px; }
        .rc-verdict-con { font-size: 12px; color: var(--text-secondary); font-style: italic; margin: 0 0 10px; }
        .rc-verdict-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .rc-verdict-list li {
          padding: 10px 12px; border-radius: 10px;
          background: hsla(0, 72%, 62%, 0.07); border: 1px solid hsla(0, 72%, 62%, 0.18);
          display: flex; flex-direction: column; gap: 3px;
        }
        .rc-verdict-list strong { font-size: 12.5px; color: var(--text-primary); }
        .rc-verdict-list span { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
        @media (max-width: 560px) { .rc-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}
