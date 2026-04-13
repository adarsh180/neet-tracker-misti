"use client";

import { useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell
} from "recharts";
import { TrendingUp, AlertTriangle, Target, Zap, ChevronLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

interface SubjectBreakdown {
  subject: string;
  currentLevel: number;
  targetLevel: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

interface RankAnalysis {
  currentScore: number;
  predictedScoreMin: number;
  predictedScoreMax: number;
  predictedRankMin: number;
  predictedRankMax: number;
  confidence: number;
  aimsRishikeshGap: number;
  aimsDelhiGap: number;
  subjectBreakdown: SubjectBreakdown[];
  bluffFlags: string[];
  weeklyPlan: string;
  overallAnalysis: string;
  strictMessage: string;
  model?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "#f87171", MEDIUM: "#fbbf24", LOW: "#4ade80",
};

export default function RankPredictorPage() {
  const [analysis, setAnalysis] = useState<RankAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runPrediction = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/rank", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      } else {
        const err = await res.json();
        setError(err.error || "Prediction failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const radarData = analysis?.subjectBreakdown.map((s) => ({
    subject: s.subject,
    Current: s.currentLevel,
    Target: s.targetLevel,
  })) || [];

  const barData = analysis?.subjectBreakdown.map((s) => ({
    name: s.subject.slice(0, 4),
    current: s.currentLevel,
    gap: s.targetLevel - s.currentLevel,
    priority: s.priority,
  })) || [];

  return (
    <div className="animate-fade-in">
      <div className="dash-header" style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/ai-insights" className="btn btn-ghost btn-sm" style={{ padding: "6px 10px" }}>
            <ChevronLeft size={16} />
          </Link>
          <div>
            <h1 className="dash-hero-title">Rank Predictor</h1>
            <p className="text-secondary" style={{ fontSize: 14 }}>AI analyses all your data to predict your NEET rank and gap from AIIMS</p>
          </div>
        </div>
        <button
          className={`btn ${analysis ? "btn-glass" : "btn-primary"}`}
          onClick={runPrediction}
          disabled={loading}
        >
          {loading ? (
            <><RefreshCw size={16} style={{ animation: "spin-slow 1s linear infinite" }} /> Analysing...</>
          ) : (
            <><TrendingUp size={16} /> {analysis ? "Re-run Analysis" : "Predict My Rank"}</>
          )}
        </button>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: 20, borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.05)", marginBottom: 20 }}>
          <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>
        </div>
      )}

      {!analysis && !loading && (
        <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, background: "var(--physics-dim)", border: "1px solid rgba(79,156,249,0.3)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <TrendingUp size={32} color="var(--physics)" />
          </div>
          <h2 style={{ font: "700 22px 'Playfair Display'", color: "var(--text-primary)", marginBottom: 8 }}>
            Know Where You Stand
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 500, margin: "0 auto 24px", lineHeight: 1.6 }}>
            NEET-GURU will analyse your syllabus completion, test scores, study hours, and consistency to predict your expected NEET 2027 rank — with an honest gap analysis against AIIMS Delhi and AIIMS Rishikesh.
          </p>
          <button className="btn btn-primary btn-lg" onClick={runPrediction} disabled={loading}>
            <Zap size={18} /> Run Rank Prediction
          </button>
        </div>
      )}

      {loading && (
        <div className="glass-card" style={{ padding: 60, textAlign: "center" }}>
          <div className="typing-indicator" style={{ justifyContent: "center" }}>
            <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: 16, fontSize: 14 }}>
            NEET-GURU is analysing all your data. This may take 15-30 seconds...
          </p>
        </div>
      )}

      {analysis && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Strict Message */}
          <div className="glass-card" style={{ padding: 22, borderColor: "rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.04)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>NEET-GURU Assessment</div>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{analysis.strictMessage}</p>
              </div>
            </div>
          </div>

          {/* Rank Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div className="glass-card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Predicted Score</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: "var(--gold)" }}>
                {analysis.predictedScoreMin}–{analysis.predictedScoreMax}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>out of 720</div>
            </div>
            <div className="glass-card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Predicted Rank</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: analysis.predictedRankMin < 500 ? "var(--success)" : "var(--rose-light)" }}>
                {analysis.predictedRankMin.toLocaleString()}–{analysis.predictedRankMax.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>NEET 2027</div>
            </div>
            <div className="glass-card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Confidence</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: analysis.confidence >= 70 ? "var(--botany)" : "var(--warning)" }}>
                {analysis.confidence}%
              </div>
              <div className="progress-track" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${analysis.confidence}%`, background: "linear-gradient(90deg, var(--gold), var(--botany))" }} />
              </div>
            </div>
          </div>

          {/* Gap Analysis */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="glass-card" style={{ padding: 20, borderColor: "rgba(155,109,176,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Target size={16} color="var(--lotus-light)" />
                <span style={{ fontWeight: 700, color: "var(--lotus-light)", fontSize: 14 }}>AIIMS Rishikesh Gap</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: analysis.aimsRishikeshGap <= 0 ? "var(--success)" : "var(--lotus-light)" }}>
                {analysis.aimsRishikeshGap <= 0 ? "✓ Achieved" : `${analysis.aimsRishikeshGap} marks`}
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>AIIMS Rishikesh cutoff: ~660 marks</p>
            </div>
            <div className="glass-card" style={{ padding: 20, borderColor: "rgba(212,168,83,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Target size={16} color="var(--gold)" />
                <span style={{ fontWeight: 700, color: "var(--gold)", fontSize: 14 }}>AIIMS Delhi Gap</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: analysis.aimsDelhiGap <= 0 ? "var(--success)" : "var(--gold)" }}>
                {analysis.aimsDelhiGap <= 0 ? "✓ Achieved!" : `${analysis.aimsDelhiGap} marks`}
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>AIIMS Delhi cutoff: ~700+ marks</p>
            </div>
          </div>

          {/* Charts */}
          {radarData.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>Subject vs Target (Radar)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                    <Radar name="Current" dataKey="Current" stroke="#d4a853" fill="#d4a853" fillOpacity={0.2} />
                    <Radar name="Target" dataKey="Target" stroke="#c2606e" fill="#c2606e" fillOpacity={0.1} strokeDasharray="4 2" />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>Gap Analysis by Subject</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "var(--bg-raised)", border: "1px solid var(--glass-border)", borderRadius: 10 }} labelStyle={{ color: "var(--text-primary)" }} />
                    <Bar dataKey="current" name="Current %" fill="#d4a853" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gap" name="Gap to Target" fill="rgba(248,113,113,0.3)" radius={[4, 4, 0, 0]} />
                    <ReferenceLine y={90} stroke="rgba(212,168,83,0.3)" strokeDasharray="4 2" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Subject Priority */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>Subject Priority Analysis</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {analysis.subjectBreakdown.map((s) => (
                <div key={s.subject} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 80, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.subject}</div>
                  <div style={{ flex: 1 }}>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${s.currentLevel}%`, background: PRIORITY_COLORS[s.priority] }} />
                    </div>
                  </div>
                  <div style={{ width: 40, textAlign: "right", fontSize: 14, fontWeight: 700, color: PRIORITY_COLORS[s.priority] }}>{s.currentLevel}%</div>
                  <div className={`badge ${s.priority === "HIGH" ? "badge-danger" : s.priority === "MEDIUM" ? "badge-warning" : "badge-success"}`} style={{ width: 64, justifyContent: "center" }}>
                    {s.priority}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bluff Flags */}
          {analysis.bluffFlags.length > 0 && (
            <div className="glass-card" style={{ padding: 20, borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.04)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", marginBottom: 10 }}>
                ⚠ Inconsistencies Detected
              </h3>
              {analysis.bluffFlags.map((flag, i) => (
                <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>• {flag}</p>
              ))}
            </div>
          )}

          {/* Overall Analysis */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>Detailed Analysis</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.75 }}>{analysis.overallAnalysis}</p>
          </div>

          {/* Weekly Plan */}
          <div className="glass-card" style={{ padding: 24, borderColor: "rgba(212,168,83,0.2)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--gold)" }}>📅 This Week&apos;s Action Plan</h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.75 }}>{analysis.weeklyPlan}</p>
          </div>

          {analysis.model && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>Analysis by: {analysis.model}</p>
          )}
        </div>
      )}
    </div>
  );
}
