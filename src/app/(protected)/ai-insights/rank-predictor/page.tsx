"use client";

import { useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ArrowLeft, ArrowUpRight, ChartNoAxesCombined, RefreshCw, Info } from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";
import ResponsiveChart from "@/components/charts/ResponsiveChart";
import MetricNote from "@/components/studio/metric-note";
import styles from "./rank.module.css";

interface RankAnalysis {
  currentScore: number;
  predictedScoreMin: number;
  predictedScoreMax: number;
  predictedRankMin: number;
  predictedRankMax: number;
  confidence: number;
  subjectBreakdown: { subject: string; currentLevel: number; targetLevel: number; priority: "HIGH" | "MEDIUM" | "LOW" }[];
  bluffFlags: string[];
  weeklyPlan: string;
  overallAnalysis: string;
  strictMessage: string;
  sourceNotes?: string[];
  model?: string;
  historySaved?: boolean;
  dataNotice?: string;
}

const percent = (value: number) => Math.max(0, Math.min(100, value));
const number = (value: number) => value.toLocaleString("en-IN");

export default function RankPredictorPage() {
  const [analysis, setAnalysis] = useState<RankAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const reducedMotion = useReducedMotion();

  async function runPrediction() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/rank", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "manual-rank-prediction" }),
      });
      if (!res.ok) throw new Error("The estimate could not be prepared. Your existing records have not changed.");
      const data = await res.json() as RankAnalysis;
      if (![data.currentScore, data.predictedScoreMin, data.predictedScoreMax, data.predictedRankMin, data.predictedRankMax, data.confidence].every(Number.isFinite) ||
          !Array.isArray(data.subjectBreakdown) || !data.subjectBreakdown.every(subject => typeof subject.subject === "string" && Number.isFinite(subject.currentLevel) && Number.isFinite(subject.targetLevel)) ||
          !Array.isArray(data.bluffFlags)) throw new Error("The prediction was incomplete. Please try again.");
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare your estimate.");
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  const subjects = analysis?.subjectBreakdown.map(subject => ({
    ...subject, currentLevel: percent(subject.currentLevel), targetLevel: percent(subject.targetLevel),
  })) ?? [];

  return (
    <div className={`studio-page ${styles.page}`} data-studio-native>
      <SmoothLink href="/ai-insights" className={styles.back} direction="back"><ArrowLeft size={15} /> All insights</SmoothLink>
      <header className="studio-heading">
        <div><span className="studio-eyebrow">Perspective, not a promise</span><h1>Where your preparation points.</h1><p>Explore a rank estimate and the study signals behind it.</p></div>
        <button className="studio-action primary" onClick={runPrediction} disabled={loading}>
          <RefreshCw size={16} className={loading ? styles.spin : ""} aria-hidden="true" /> {loading ? "Preparing…" : analysis ? "Update estimate" : "Explore my estimate"}
        </button>
      </header>
      <aside className={styles.caution}><Info size={18} aria-hidden="true" /><p>A rank range is a planning estimate, not a predicted result or admission guarantee. Paper difficulty and the candidate pool change each year.</p></aside>
      {error && <div className="studio-error" role="alert">{error}</div>}
      {loading && <div className={styles.loading} role="status"><ChartNoAxesCombined size={30} /><h2>Connecting the study signals…</h2><p>Reviewing your saved tests and preparation records.</p></div>}
      {!analysis && !loading && <section className={styles.intro}>
        <div className={styles.introMark} aria-hidden="true"><ChartNoAxesCombined size={88} strokeWidth={0.8} /></div>
        <div><span className="studio-eyebrow">Start with what you know</span><h2>Your next step matters more than a number.</h2><p>Use the estimate to find where practice and revision may help. More representative test records make the underlying evidence more useful.</p><SmoothLink href="/tests" className="studio-action">Review your test journal <ArrowUpRight size={16} /></SmoothLink></div>
      </section>}
      {analysis && !loading && <div className={styles.results}>
        {analysis.dataNotice && <div className="studio-error" role="alert">{analysis.dataNotice}</div>}
        {analysis.historySaved === false && <p className={styles.caution} role="status">This estimate is visible here, but could not be saved to your history.</p>}
        <section className={styles.metrics} aria-label="Estimated outcome">
          <div><span>Estimated score range</span><strong>{number(analysis.predictedScoreMin)}–{number(analysis.predictedScoreMax)}</strong><small>out of 720</small></div>
          <div><span>Estimated rank range</span><strong>{number(analysis.predictedRankMin)}–{number(analysis.predictedRankMax)}</strong><small>Lower rank numbers are better</small></div>
          <div><span>Model evidence score</span><strong>{percent(analysis.confidence)}<em>/100</em></strong><small>Not a probability of accuracy</small></div>
        </section>
        <div className={styles.columns}>
          <section className="studio-panel">
            <div className="studio-panel-head"><h2>Where to focus</h2><span className={styles.caption}>Preparation signals · /100</span></div>
            {subjects.length > 0 ? <>
              <ResponsiveChart height={300}>{(width, height) => (
                <BarChart width={width} height={height} data={subjects} layout="vertical" margin={{ left: 0, right: 20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis type="number" domain={[0,100]} tick={{ fill:"var(--chart-axis)", fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="subject" width={82} tick={{ fill:"var(--chart-axis)", fontSize:12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill:"var(--gold-dim)" }} contentStyle={{ background:"var(--chart-tooltip-bg)", border:"1px solid var(--glass-border-mid)", borderRadius:10, color:"var(--text-primary)" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize:12 }} />
                  <Bar dataKey="currentLevel" name="Current signal" fill="var(--gold)" radius={[0,4,4,0]} maxBarSize={14} isAnimationActive={!reducedMotion} animationDuration={450} />
                  <Bar dataKey="targetLevel" name="Model target" fill="var(--chart-axis-muted)" fillOpacity={0.45} radius={[0,4,4,0]} maxBarSize={8} isAnimationActive={!reducedMotion} animationDuration={450} />
                </BarChart>
              )}</ResponsiveChart>
              <MetricNote>These are heuristic preparation signals derived by the existing model, not subject marks or measured mastery. The target is a planning reference. The evidence score is also heuristic; it is not a statistically calibrated confidence level.</MetricNote>
              <details className={styles.values}><summary>View exact values</summary><table><caption>Subject preparation signals</caption><thead><tr><th>Subject</th><th>Current</th><th>Target</th></tr></thead><tbody>{subjects.map(subject => <tr key={subject.subject}><th scope="row">{subject.subject}</th><td>{subject.currentLevel}</td><td>{subject.targetLevel}</td></tr>)}</tbody></table></details>
            </> : <p className={styles.prose}>No subject breakdown was available for this estimate.</p>}
          </section>
          <aside className={styles.rail}>
            <section className="studio-panel"><h2>A useful next step</h2><p className={styles.prose}>{analysis.weeklyPlan}</p><SmoothLink href="/todo" className="studio-action">Open Todo <ArrowUpRight size={16} /></SmoothLink></section>
            <details className="studio-panel"><summary className={styles.summary}>Read the assessment</summary><p className={styles.prose}>{analysis.overallAnalysis}</p>{analysis.strictMessage && <p className={styles.prose}>{analysis.strictMessage}</p>}</details>
            {analysis.bluffFlags.length > 0 && <details className="studio-panel"><summary className={styles.summary}>Records worth checking</summary><p className={styles.prose}>Missing or inconsistent entries can affect the estimate. These flags are prompts to review your records, not judgements about you.</p><ul className={styles.notes}>{analysis.bluffFlags.map((flag, index) => <li key={index}>{flag}</li>)}</ul></details>}
          </aside>
        </div>
        <details className="studio-panel"><summary className={styles.summary}>Model notes and limitations</summary>
          <p className={styles.prose}>This page uses the existing tracker prediction model. It does not establish official college cutoffs. Compare admission information using current official counselling data for the relevant year, category and quota.</p>
          {analysis.sourceNotes && <ul className={styles.notes}>{analysis.sourceNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
          {analysis.model && <p className={styles.caption}>Method: {analysis.model === "deterministic-fallback" ? "Tracker planning rules" : analysis.model}</p>}
        </details>
      </div>}
    </div>
  );
}
