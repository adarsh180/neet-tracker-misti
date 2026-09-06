"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BadgeCheck, ChevronDown, History, LineChart as LineChartIcon,
  RefreshCw, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, LineChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import MetricNote from "@/components/studio/metric-note";
import styles from "./reviews.module.css";
import ResponsiveChart from "@/components/charts/ResponsiveChart";
import {
  computeReviewScore,
  computeReviewComparison,
  gradeForIndex,
  type ComparisonPoint,
  type ReviewComparison,
  type ReviewScoreInput,
} from "@/lib/review-score";

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
      performanceIndex?: number;
    };
  };
  questions: ReviewQuestion[];
  verdict: ReviewVerdict | null;
};

type ScoreMeta = { index: number; grade: string; comparison: ReviewComparison };

const VERDICT_META: Record<ReviewVerdict["verdict"], { label: string; color: string }> = {
  HONEST: { label: "Records aligned", color: "var(--success)" },
  MOSTLY_HONEST: { label: "Mostly aligned", color: "var(--gold)" },
  INCONSISTENT: { label: "Some differences", color: "hsl(28, 90%, 58%)" },
  FAKING: { label: "Needs a closer look", color: "var(--danger)" },
};

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

// Rebuild the deterministic scoring input from a card's stored metrics + flags so
// the grade is recomputed identically to the server — this corrects older cards
// (whose grade was once AI-written) on display, without mutating the database.
function cardScoreInput(card: ReviewCardData): ReviewScoreInput | null {
  const m = card.review.metrics;
  if (!m) return null;
  return {
    hours: m.hours,
    questions: m.questions,
    activeDays: m.activeDays,
    periodDays: m.periodDays,
    topicsCompleted: m.topicsCompleted,
    revisions: m.revisions,
    testsTaken: m.testsTaken,
    avgTestPercentage: m.avgTestPercentage,
    distractionHours: m.distractionHours,
    integritySignals: (card.review.integritySignals ?? []).map((signal) => ({ severity: signal.severity })),
  };
}

function cardIndex(card: ReviewCardData): number | null {
  const stored = card.review.metrics?.performanceIndex;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  const input = cardScoreInput(card);
  if (input) return computeReviewScore(input).index;
  return null;
}

// Per-card index, corrected grade, and period-over-period comparison, keyed by id.
function buildScoreMeta(cards: ReviewCardData[] | null): Map<string, ScoreMeta> {
  const meta = new Map<string, ScoreMeta>();
  if (!cards) return meta;

  for (const period of ["WEEKLY", "MONTHLY"] as const) {
    // Oldest → newest so each card sees only the periods that preceded it.
    const chronological = cards
      .filter((card) => card.period === period && cardIndex(card) !== null)
      .slice()
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

    const points: ComparisonPoint[] = chronological.map((card) => ({
      index: cardIndex(card)!,
      hours: cardHours(card),
      questions: cardQuestions(card),
    }));

    chronological.forEach((card, i) => {
      const comparison = computeReviewComparison(points[i], i > 0 ? points[i - 1] : null, points.slice(0, i));
      meta.set(card.id, { index: points[i].index, grade: gradeForIndex(points[i].index), comparison });
    });
  }

  return meta;
}

const PERIOD_NOUN: Record<"WEEKLY" | "MONTHLY", string> = { WEEKLY: "week", MONTHLY: "month" };
const MOMENTUM_LABEL: Record<ReviewComparison["momentum"], string> = {
  improving: "improving",
  declining: "declining",
  stable: "holding steady",
  unknown: "—",
};

function signed(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${value}${suffix}`;
}

export default function ReviewsPage() {
  const [cards, setCards] = useState<ReviewCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", { cache: "no-store", signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load reviews");
      if (!Array.isArray(json.cards)) throw new Error("The review response was incomplete. Please retry.");
      if (loadController.current === controller) setCards(json.cards);
    } catch (err) {
      if (loadController.current === controller) setError(controller.signal.aborted ? "The reviews took too long to load. Your existing cards are still here." : err instanceof Error ? err.message : "Could not load your reviews.");
    } finally {
      window.clearTimeout(timeout);
      if (loadController.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { loadController.current?.abort(); loadController.current = null; };
  }, [load]);

  const replaceCard = (next: ReviewCardData) => {
    setCards((prev) => (prev ? prev.map((card) => (card.id === next.id ? next : card)) : prev));
  };

  // Cards arrive newest-first. The newest weekly + newest monthly are "current";
  // everything older automatically becomes history when a new one lands.
  const { current, history } = useMemo(() => {
    if (!cards) return { current: [], history: [] };
    const ordered = [...cards].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    const latestWeekly = ordered.find((card) => card.period === "WEEKLY");
    const latestMonthly = ordered.find((card) => card.period === "MONTHLY");
    const currentIds = new Set([latestWeekly?.id, latestMonthly?.id].filter(Boolean));
    return {
      current: ordered.filter((card) => currentIds.has(card.id)),
      history: ordered.filter((card) => !currentIds.has(card.id)),
    };
  }, [cards]);

  const scoreMeta = useMemo(() => buildScoreMeta(cards), [cards]);

  return (
    <div className={`studio-page ${styles.page}`} data-studio-native>
      <header className="studio-heading">
        <div><span className="studio-eyebrow">Reflect · adjust · grow</span>
          <h1>See how far you’ve come.</h1>
          <p>Your weekly and monthly study reviews. Take the useful lesson into your next session.</p>
        </div>
        <button className="studio-action" onClick={load} disabled={loading} aria-label="Refresh reviews">
          <RefreshCw size={16} className={loading ? "rv-spin" : ""} /> Refresh
        </button>
      </header>
      {cards && <div className="rv-overview" aria-label="Review overview">
        <div><strong>{cards.length}</strong><span>review periods</span></div>
        <div><strong>{cards.filter(card => card.status === "AWAITING_ANSWERS").length}</strong><span>check-ins to finish</span></div>
        <Link href="/daily-goals">Open your study log <ArrowRight size={17} /></Link>
      </div>}

      {loading && !cards && (
        <div className="rv-state" role="status">
          <div className="rv-pulse" />
          <p>Loading your review periods…</p>
        </div>
      )}

      {error && (
        <div className="rv-state rv-state--error" role="alert">
          <p>{error}</p>
          <button className="rv-btn" onClick={load}>Retry</button>
        </div>
      )}

      {cards && cards.length === 0 && (
        <div className="rv-state"><p>No review periods completed yet. The first card lands after a full Mon–Sun week.</p></div>
      )}

      {current.length > 0 && (
        <>
          <h2 className="rv-section">Latest reflections</h2>
          {current.map((card) => (
            <ReviewCardView key={card.id} card={card} meta={scoreMeta.get(card.id)} onUpdated={replaceCard} defaultOpen={card.status === "AWAITING_ANSWERS"} />
          ))}
        </>
      )}

      {cards && cards.length >= 2 && <ProgressCharts cards={cards} scoreMeta={scoreMeta} />}

      {history.length > 0 && (
        <>
          <details className="rv-history"><summary><History size={16} /> Earlier reviews <span>{history.length}</span><ChevronDown size={16} /></summary>
          {history.map((card) => (
            <ReviewCardView key={card.id} card={card} meta={scoreMeta.get(card.id)} onUpdated={replaceCard} defaultOpen={false} />
          ))}
          </details>
        </>
      )}


    </div>
  );
}

function ProgressCharts({ cards, scoreMeta }: { cards: ReviewCardData[]; scoreMeta: Map<string, ScoreMeta> }) {
  const [tab, setTab] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [metric, setMetric] = useState<"hours" | "questions" | "index">("hours");
  const reducedMotion = useReducedMotion();
  const data = useMemo(() => cards.filter(card => card.period === tab).slice()
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map(card => ({
      id: card.id,
      label: formatRange(card.periodStart, card.periodEnd),
      tick: new Date(`${card.periodStart}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
      hours: cardHours(card), questions: cardQuestions(card), index: scoreMeta.get(card.id)?.index ?? null,
    })), [cards, tab, scoreMeta]);
  const label = { hours: "Study hours", questions: "Questions solved", index: "Study index" }[metric];
  const axis = <><CartesianGrid vertical={false} stroke="var(--chart-grid)" />
    <XAxis dataKey="tick" tick={{ fontSize: 12, fill: "var(--chart-axis)" }} axisLine={false} tickLine={false} minTickGap={25} />
    <YAxis domain={metric === "index" ? [0, 100] : [0, "auto"]} tick={{ fontSize: 12, fill: "var(--chart-axis)" }} allowDecimals={metric === "hours"} axisLine={false} tickLine={false} width={46} />
    <Tooltip contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--glass-border-mid)", borderRadius: 12, color: "var(--text-primary)" }}
      labelFormatter={(_, entries) => entries?.[0]?.payload?.label ?? ""}
      formatter={value => [metric === "hours" ? `${value} h` : metric === "index" ? `${value}/100` : String(value ?? "Not available"), label]} />
  </>;
  return <section className="pc" aria-label="Study progress comparison">
    <div className="pc-top"><div><span className="studio-eyebrow">Your own trajectory</span><h2><LineChartIcon size={20} /> Progress over time</h2></div>
      <div className="pc-tabs" aria-label="Review frequency">
        {(["WEEKLY", "MONTHLY"] as const).map(period => <button key={period} aria-pressed={tab === period} onClick={() => setTab(period)}>{period === "WEEKLY" ? "Weekly" : "Monthly"}</button>)}
      </div>
    </div>
    <div className="pc-metrics" aria-label="Comparison metric">
      {(["hours", "questions", "index"] as const).map(key => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{{ hours: "Hours", questions: "Questions", index: "Study index" }[key]}</button>)}
      <span>{label}{metric === "index" ? " · out of 100" : " · per period"}</span>
    </div>
    {data.length < 2 ? <p className="pc-empty">Two {tab.toLowerCase()} reviews are needed to show a comparison. Your first period stays in the table below.</p> :
      <ResponsiveChart height={260}>{(width, height) => metric === "index" ?
        <LineChart width={width} height={height} data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>{axis}
          <Line type="linear" dataKey="index" name={label} stroke="var(--physics)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} isAnimationActive={!reducedMotion} />
        </LineChart> :
        <BarChart width={width} height={height} data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>{axis}
          <Bar dataKey={metric} name={label} fill="var(--gold)" radius={[5, 5, 0, 0]} maxBarSize={44} isAnimationActive={!reducedMotion} />
        </BarChart>}</ResponsiveChart>}
    <MetricNote>Compare the same period length, one metric at a time. Hours and questions come from saved reviews, not live daily totals. The study index is the existing app formula, not a NEET score or a judgement of honesty. It uses fixed targets of 12 hours and 100 questions per day, activity, revision and test data, plus deductions for log flags and screen time. These are app settings, not personalised health or study recommendations. Older cards without the required metrics show a gap, not an invented score.</MetricNote>
    <details className="pc-values"><summary>See exact values</summary>
      <div className="pc-table"><table><caption>{tab === "WEEKLY" ? "Weekly" : "Monthly"} saved review totals</caption><thead><tr><th scope="col">Period</th><th scope="col">Hours</th><th scope="col">Questions</th><th scope="col">Index /100</th></tr></thead>
        <tbody>{data.map(row => <tr key={row.id}><th scope="row">{row.label}</th><td>{row.hours}</td><td>{row.questions.toLocaleString("en-IN")}</td><td>{row.index ?? "—"}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}

function ReviewCardView({
  card,
  meta,
  onUpdated,
  defaultOpen,
}: {
  card: ReviewCardData;
  meta?: ScoreMeta;
  onUpdated: (card: ReviewCardData) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const review = card.review;
  const grade = meta?.grade ?? review.grade;
  const periodNoun = PERIOD_NOUN[card.period];
  const comparison = meta?.comparison;
  const allAnswered = card.questions.length > 0 && card.questions.every((question) => answers[question.id] !== undefined);

  const submit = async () => {
    if (submitLock.current || !allAnswered) return;
    submitLock.current = true;
    setSubmitNotice(null);
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
      if (res.status === 202) { setSubmitNotice("Queued on this device, not yet reviewed. Your selections are still here."); return; }
      if (!res.ok) throw new Error(json.error || "Could not save this check-in. Your selections are still here.");
      if (json.card?.id !== card.id || json.card?.status !== "COMPLETED" || !json.card.review || !json.card.verdict || !Array.isArray(json.card.questions)) throw new Error("The saved review could not be confirmed. Your selections are still here.");
      onUpdated(json.card);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const verdictMeta = card.verdict ? VERDICT_META[card.verdict.verdict] : null;

  return (
    <section className="rc">
      <button className="rc-top" aria-expanded={open} aria-controls={`review-${card.id}`} onClick={() => setOpen((value) => !value)}>
        <span className={`rc-period ${card.period === "MONTHLY" ? "rc-period--m" : ""}`}>
          {card.period === "WEEKLY" ? "Weekly" : "Monthly"}
        </span>
        <span className="rc-range">{formatRange(card.periodStart, card.periodEnd)}</span>
        <span className="rc-grade">{meta ? `Study index ${meta.index}/100` : `Legacy grade ${grade}`}</span>
        {card.status === "AWAITING_ANSWERS" ? (
          <span className="rc-badge rc-badge--pending"><ShieldAlert size={13} /> Check-in to finish</span>
        ) : verdictMeta ? (
          <span className="rc-badge" style={{ color: verdictMeta.color, borderColor: "currentColor" }}>
            <ShieldCheck size={13} /> {verdictMeta.label} · {card.verdict?.integrityScore}/100
          </span>
        ) : null}
        <ChevronDown size={17} className="rc-chevron" />
      </button>

      {open && (
        <div className="rc-body" id={`review-${card.id}`}>
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

          {meta && comparison && (
            <details className="rc-comparison"><summary>Compare with your earlier {periodNoun}s</summary><div className="rc-compare">
              <span className="rc-compare-index">Study index <strong>{meta.index}/100</strong> ({grade})</span>
              {comparison.vsPrevious && (
                <>
                  <span className={comparison.vsPrevious.indexDelta >= 0 ? "rc-up" : "rc-down"}>
                    {comparison.vsPrevious.indexDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {signed(comparison.vsPrevious.indexDelta)} pts vs last {periodNoun}
                  </span>
                  <span>
                    {signed(comparison.vsPrevious.hoursDelta, "h")}
                    {comparison.vsPrevious.hoursPct !== null ? ` (${signed(comparison.vsPrevious.hoursPct, "%")})` : ""} · {signed(comparison.vsPrevious.questionsDelta)} Qs
                  </span>
                </>
              )}
              {comparison.vsBaseline !== null && (
                <span className={comparison.vsBaseline >= 0 ? "rc-up" : "rc-down"}>
                  {signed(comparison.vsBaseline)} vs recent avg ({comparison.baselineIndex})
                </span>
              )}
              {comparison.rank !== null && comparison.totalPeriods > 1 && (
                <span className="rc-compare-rank">
                  {comparison.rank === 1 ? `Best ${periodNoun} so far` : `#${comparison.rank} of ${comparison.totalPeriods} ${periodNoun}s`}
                </span>
              )}
              {comparison.momentum !== "unknown" && <span>Momentum: {MOMENTUM_LABEL[comparison.momentum]}</span>}
            </div></details>
          )}

          <div className="rc-grid">
            <div className="rc-col">
              <h4>Wins</h4>
              <ul>{review.wins.map((win, index) => <li key={index}>{win}</li>)}</ul>
            </div>
            <div className="rc-col">
              <h4>Room to grow</h4>
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
              <h4><ShieldAlert size={14} /> Records to double-check</h4>
              <ul>
                {review.integritySignals.map((signal, index) => (
                  <li key={index} data-sev={signal.severity}>{signal.detail}</li>
                ))}
              </ul>
            </div>
          )}

          {review.focusForNextPeriod.length > 0 && (
            <div className="rc-focus">
              <h4>Your next focus</h4>
              <ul>{review.focusForNextPeriod.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}

          {card.status === "AWAITING_ANSWERS" && (
            <div className="rc-truth">
              <h3><ShieldCheck size={16} /> A quick reflection</h3>
              <p className="rc-truth-note">
                Compare your recollection with saved records. Missing or different entries can need correction; they do not prove dishonesty.
              </p>
              {card.questions.map((question, qIndex) => (
                <fieldset key={question.id} className="rc-q" disabled={submitting}>
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
              {submitError && <p className="rc-err" role="alert">{submitError}</p>}
              {submitNotice && <p className="rc-truth-note" role="status">{submitNotice}</p>}
              <button className="rc-submit" disabled={!allAnswered || submitting} onClick={submit}>
                {submitting ? "Saving your reflection…" : allAnswered ? "Save reflection" : `Answer all ${card.questions.length} questions`}
              </button>
            </div>
          )}

          {card.status === "COMPLETED" && card.verdict && verdictMeta && (
            <div className="rc-verdict" style={{ borderColor: verdictMeta.color }}>
              <div className="rc-verdict-head" style={{ color: verdictMeta.color }}>
                <BadgeCheck size={18} />
                <strong>{verdictMeta.label}</strong>
                <span className="rc-score">{card.verdict.integrityScore}/100 alignment</span>
              </div>
              <p className="rc-truth-note">Automated assessment of recorded entries, not a judgement of you. Incomplete logs can affect this result.</p>
              <details className="rc-assessment"><summary>Read the saved assessment</summary><p className="rc-verdict-msg">{card.verdict.message}</p>
              {card.verdict.consequence && <p className="rc-verdict-con">{card.verdict.consequence}</p>}</details>
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


    </section>
  );
}
