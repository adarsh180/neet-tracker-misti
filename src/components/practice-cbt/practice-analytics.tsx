"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Award, BarChart3, CheckCircle2, ChevronLeft, Circle, Clock3, Flag, Layers, Target, TrendingUp, XCircle,
} from "lucide-react";
import ResponsiveChart from "@/components/charts/ResponsiveChart";
import { estimateCalibratedRank } from "@/lib/neet-rank-calibration";

type AnalyticsQuestion = {
  id: string;
  subject: string;
  chapter: string;
  topic: string | null;
  source: string;
  sourceRef: string;
  difficulty: "EASY" | "MODERATE" | "TOUGH";
  question: string;
  options: string[];
  verified: boolean;
  correctIndex: number | null;
  explanation: string | null;
};

type AnalyticsResult = {
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTakenSeconds: number | null;
  subjectScores: { subject: string; score: number; maxScore: number; correct: number; wrong: number; skipped: number }[];
};

export type AnalyticsTest = {
  id: string;
  title: string;
  mode: string;
  questionCount: number;
  durationMinutes?: number;
  createdAt: string;
  completedAt?: string | null;
  submitType?: string | null;
  autoSubmitReason?: string | null;
  totalActiveSeconds?: number | null;
  result: AnalyticsResult | null;
  answers: { id: string; optionIndex: number | null }[] | null;
  questions?: AnalyticsQuestion[];
};

const MODE_LABEL: Record<string, string> = {
  CHAPTER: "Chapterwise Test", TOPIC: "Custom / Topic Test", UNIT: "Unit Test",
  SECTIONAL: "Sectional Test", FULL_LENGTH: "Full-Length Test", PYQ_YEAR: "NEET PYQ Year",
};

const SUBJECT_COLOR: Record<string, string> = {
  Physics: "var(--physics)", Chemistry: "var(--chemistry)", Botany: "var(--botany)", Zoology: "var(--zoology)",
};

const OUTCOME_COLOR = { correct: "var(--success)", wrong: "var(--danger)", skipped: "var(--text-muted)" };

function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}h ` : ""}${m}m ${s % 60}s`;
}

type Bucket = { key: string; correct: number; wrong: number; skipped: number; total: number };

function bucketBy(questions: AnalyticsQuestion[], answers: Map<string, number | null>, dim: "subject" | "chapter" | "topic") {
  const map = new Map<string, Bucket>();
  for (const q of questions) {
    const key = dim === "subject" ? q.subject : dim === "chapter" ? `${q.subject} · ${q.chapter}` : q.topic ? `${q.chapter} · ${q.topic}` : q.chapter;
    const b = map.get(key) ?? { key, correct: 0, wrong: 0, skipped: 0, total: 0 };
    const chosen = answers.get(q.id);
    b.total += 1;
    if (chosen === null || chosen === undefined) b.skipped += 1;
    else if (chosen === q.correctIndex) b.correct += 1;
    else b.wrong += 1;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => {
    const accA = a.correct + a.wrong ? a.correct / (a.correct + a.wrong) : 0;
    const accB = b.correct + b.wrong ? b.correct / (b.correct + b.wrong) : 0;
    return accB - accA;
  });
}

function accuracy(b: { correct: number; wrong: number }) {
  const attempted = b.correct + b.wrong;
  return attempted ? Math.round((b.correct / attempted) * 100) : 0;
}

export default function PracticeAnalytics({ test, onBack }: { test: AnalyticsTest; onBack: () => void }) {
  const result = test.result;
  const questions = useMemo(() => test.questions ?? [], [test.questions]);
  const answers = useMemo(() => new Map((test.answers ?? []).map((a) => [a.id, a.optionIndex])), [test.answers]);
  const [dim, setDim] = useState<"subject" | "chapter" | "topic">("subject");
  const [history, setHistory] = useState<{ label: string; accuracy: number; percentage: number }[]>([]);

  useEffect(() => {
    fetch("/api/practice", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const rows = (j.tests ?? [])
          .filter((t: { status: string; result: AnalyticsResult | null }) => t.status === "COMPLETED" && t.result)
          .slice(0, 12)
          .reverse()
          .map((t: { createdAt: string; result: AnalyticsResult }) => ({
            label: new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
            accuracy: t.result.correct + t.result.wrong ? Math.round((t.result.correct / (t.result.correct + t.result.wrong)) * 100) : 0,
            percentage: t.result.percentage,
          }));
        setHistory(rows);
      })
      .catch(() => {});
  }, [test.id]);

  if (!result) return null;

  const score720 = Math.round((result.percentage / 100) * 720);
  const air = estimateCalibratedRank(score720);
  const overallAccuracy = accuracy(result);

  const outcomePie = [
    { name: "Correct", value: result.correct, fill: OUTCOME_COLOR.correct },
    { name: "Wrong", value: result.wrong, fill: OUTCOME_COLOR.wrong },
    { name: "Skipped", value: result.skipped, fill: OUTCOME_COLOR.skipped },
  ].filter((d) => d.value > 0);

  const subjectBars = result.subjectScores.map((s) => ({
    subject: s.subject,
    accuracy: accuracy(s),
    correct: s.correct,
    wrong: s.wrong,
    skipped: s.skipped,
    fill: SUBJECT_COLOR[s.subject] ?? "var(--gold)",
  }));

  const difficultyRows = (["EASY", "MODERATE", "TOUGH"] as const).map((d) => {
    const qs = questions.filter((q) => q.difficulty === d);
    const correct = qs.filter((q) => answers.get(q.id) === q.correctIndex).length;
    const attempted = qs.filter((q) => answers.get(q.id) !== null && answers.get(q.id) !== undefined).length;
    return { difficulty: d, total: qs.length, correct, accuracy: attempted ? Math.round((correct / attempted) * 100) : 0 };
  }).filter((r) => r.total > 0);

  const buckets = bucketBy(questions, answers, dim);

  return (
    <div className="pa">
      <button className="cbt-back" onClick={onBack}><ChevronLeft size={15} /> Attempts</button>

      {/* Hero */}
      <section className="pa-hero">
        <div className="pa-hero-left">
          <p className="pa-kicker">{MODE_LABEL[test.mode] ?? test.mode}</p>
          <div className="pa-score"><strong>{result.score}</strong><span>/ {result.maxScore}</span></div>
          <p className="pa-sub">{result.percentage}% score · {overallAccuracy}% accuracy</p>
          <div className="pa-metrics">
            <span className="pa-good"><CheckCircle2 size={13} /> {result.correct} correct</span>
            <span className="pa-bad"><XCircle size={13} /> {result.wrong} wrong</span>
            <span><Circle size={13} /> {result.skipped} skipped</span>
            <span><Clock3 size={13} /> {fmtClock(test.totalActiveSeconds ?? result.timeTakenSeconds ?? 0)}</span>
          </div>
        </div>
        <div className="pa-air">
          <div className="pa-air-icon"><Award size={20} /></div>
          <span className="pa-air-label">Projected AIR</span>
          <strong className="pa-air-rank">{air.rank.toLocaleString("en-IN")}</strong>
          <span className="pa-air-range">{air.rankRange.best.toLocaleString("en-IN")} – {air.rankRange.worst.toLocaleString("en-IN")}</span>
          <span className="pa-air-note">if this accuracy held over a full 720-mark NEET paper (≈{score720}/720)</span>
        </div>
      </section>

      {/* Outcome donut + subject bars */}
      <div className="pa-grid2">
        <section className="pa-card">
          <h3 className="pa-h3"><Target size={14} /> Outcome split</h3>
          <ResponsiveChart height={210}>
            {(w, h) => (
              <PieChart width={w} height={h}>
                <Pie data={outcomePie} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none" animationDuration={700}>
                  {outcomePie.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            )}
          </ResponsiveChart>
          <div className="pa-legend">
            <span><i style={{ background: OUTCOME_COLOR.correct }} /> Correct {result.correct}</span>
            <span><i style={{ background: OUTCOME_COLOR.wrong }} /> Wrong {result.wrong}</span>
            <span><i style={{ background: OUTCOME_COLOR.skipped }} /> Skipped {result.skipped}</span>
          </div>
        </section>

        <section className="pa-card">
          <h3 className="pa-h3"><BarChart3 size={14} /> Accuracy by subject</h3>
          <ResponsiveChart height={210}>
            {(w, h) => (
              <BarChart width={w} height={h} data={subjectBars} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="subject" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${String(v)}%`, "Accuracy"]} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={800}>
                  {subjectBars.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveChart>
        </section>
      </div>

      {/* Breakdown table with toggles */}
      <section className="pa-card">
        <div className="pa-card-head">
          <h3 className="pa-h3"><Layers size={14} /> Breakdown</h3>
          <div className="pa-toggle">
            {(["subject", "chapter", "topic"] as const).map((d) => (
              <button key={d} className={dim === d ? "on" : ""} onClick={() => setDim(d)}>{d}</button>
            ))}
          </div>
        </div>
        <div className="pa-rows">
          {buckets.map((b) => {
            const acc = accuracy(b);
            return (
              <div className="pa-row" key={b.key}>
                <span className="pa-row-name" title={b.key}>{b.key}</span>
                <div className="pa-row-bar"><span style={{ width: `${acc}%`, background: acc >= 70 ? "var(--success)" : acc >= 40 ? "var(--gold)" : "var(--danger)" }} /></div>
                <span className="pa-row-acc">{acc}%</span>
                <span className="pa-row-counts">
                  <i className="g">{b.correct}</i>·<i className="r">{b.wrong}</i>·<i className="s">{b.skipped}</i>
                </span>
              </div>
            );
          })}
        </div>
        <p className="pa-row-legend"><i className="g">correct</i> · <i className="r">wrong</i> · <i className="s">skipped</i></p>
      </section>

      {/* Difficulty + history */}
      <div className="pa-grid2">
        <section className="pa-card">
          <h3 className="pa-h3"><Flag size={14} /> Difficulty performance</h3>
          <div className="pa-diff">
            {difficultyRows.map((d) => (
              <div className="pa-diff-row" key={d.difficulty}>
                <span className={`pa-diff-tag pa-diff-${d.difficulty.toLowerCase()}`}>{d.difficulty.toLowerCase()}</span>
                <div className="pa-row-bar"><span style={{ width: `${d.accuracy}%` }} /></div>
                <span className="pa-row-acc">{d.accuracy}%</span>
                <span className="pa-diff-count">{d.correct}/{d.total}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pa-card">
          <h3 className="pa-h3"><TrendingUp size={14} /> Accuracy across attempts</h3>
          {history.length >= 2 ? (
            <ResponsiveChart height={180}>
              {(w, h) => (
                <AreaChart width={w} height={h} data={history} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="paAcc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10.5, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${String(v)}%`, "Accuracy"]} />
                  <Area type="monotone" dataKey="accuracy" stroke="var(--gold)" strokeWidth={2} fill="url(#paAcc)" animationDuration={800} />
                </AreaChart>
              )}
            </ResponsiveChart>
          ) : (
            <p className="pa-empty">Complete a few more tests to see your accuracy trend.</p>
          )}
        </section>
      </div>

      <style jsx>{paStyles}</style>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--bg-raised)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--text-primary)",
} as const;

const paStyles = `
  .pa { display: flex; flex-direction: column; gap: 14px; }
  .pa-hero {
    display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: stretch;
    padding: 22px 24px; border-radius: 18px;
    background: linear-gradient(135deg, var(--gold-dim), transparent 62%), var(--bg-surface);
    border: 1px solid var(--gold-glow);
  }
  .pa-kicker { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
  .pa-score strong { font-size: 46px; font-weight: 700; color: var(--gold-bright); line-height: 1; font-variant-numeric: tabular-nums; }
  .pa-score span { font-size: 17px; color: var(--text-muted); margin-left: 5px; }
  .pa-sub { margin: 7px 0 14px; color: var(--text-secondary); font-size: 13px; }
  .pa-metrics { display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .pa-metrics span { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-secondary); }
  .pa-good { color: var(--success); }
  .pa-bad { color: var(--danger); }
  .pa-air {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    min-width: 188px; padding: 16px 20px; border-radius: 14px;
    background: var(--bg-elevated); border: 1px solid var(--glass-border);
  }
  .pa-air-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; color: var(--gold); background: var(--gold-dim); margin-bottom: 4px; }
  .pa-air-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
  .pa-air-rank { font-size: 30px; font-weight: 800; color: var(--gold-bright); line-height: 1.1; font-variant-numeric: tabular-nums; }
  .pa-air-range { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
  .pa-air-note { font-size: 10.5px; color: var(--text-muted); text-align: center; line-height: 1.4; margin-top: 4px; max-width: 168px; }
  .pa-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .pa-card { padding: 18px 20px; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--glass-border); }
  .pa-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .pa-h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-secondary); }
  .pa-card-head .pa-h3 { margin: 0; }
  .pa-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 6px; }
  .pa-legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }
  .pa-legend i { width: 10px; height: 10px; border-radius: 3px; }
  .pa-toggle { display: flex; gap: 4px; background: var(--bg-elevated); padding: 3px; border-radius: 999px; }
  .pa-toggle button { border: 0; background: transparent; color: var(--text-muted); padding: 6px 13px; border-radius: 999px; font-size: 11.5px; font-weight: 600; text-transform: capitalize; cursor: pointer; }
  .pa-toggle button.on { background: var(--gold-dim); color: var(--gold); }
  .pa-rows { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; scrollbar-width: thin; }
  .pa-row { display: grid; grid-template-columns: minmax(0, 1fr) 90px 38px 64px; gap: 10px; align-items: center; }
  .pa-row-name { font-size: 12.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pa-row-bar { height: 7px; border-radius: 999px; background: var(--bg-elevated); overflow: hidden; }
  .pa-row-bar span { display: block; height: 100%; border-radius: 999px; background: var(--gold); transition: width 0.6s var(--ease-in-out); }
  .pa-row-acc { font-size: 12px; font-weight: 700; color: var(--text-secondary); text-align: right; font-variant-numeric: tabular-nums; }
  .pa-row-counts { font-size: 11.5px; text-align: right; font-variant-numeric: tabular-nums; }
  .pa-row-counts i, .pa-row-legend i { font-style: normal; font-weight: 700; }
  .pa-row-counts .g, .pa-row-legend .g { color: var(--success); }
  .pa-row-counts .r, .pa-row-legend .r { color: var(--danger); }
  .pa-row-counts .s, .pa-row-legend .s { color: var(--text-muted); }
  .pa-row-legend { margin: 12px 0 0; font-size: 11px; color: var(--text-muted); }
  .pa-diff { display: flex; flex-direction: column; gap: 12px; }
  .pa-diff-row { display: grid; grid-template-columns: 80px minmax(0, 1fr) 38px 44px; gap: 10px; align-items: center; }
  .pa-diff-tag { font-size: 11px; font-weight: 700; text-transform: capitalize; display: inline-flex; align-items: center; gap: 5px; }
  .pa-diff-tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .pa-diff-easy { color: var(--success); }
  .pa-diff-moderate { color: var(--gold); }
  .pa-diff-tough { color: var(--danger); }
  .pa-diff-count { font-size: 11.5px; color: var(--text-muted); text-align: right; font-variant-numeric: tabular-nums; }
  .pa-empty { font-size: 12.5px; color: var(--text-muted); padding: 30px 0; text-align: center; }
  @media (max-width: 760px) {
    .pa-hero { grid-template-columns: 1fr; }
    .pa-air { min-width: 0; }
    .pa-grid2 { grid-template-columns: 1fr; }
  }
`;
