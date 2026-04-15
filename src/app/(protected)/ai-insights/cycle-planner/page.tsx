"use client";

import { useState, useEffect, useCallback } from "react";
import { Heart, ChevronLeft, Plus, Sparkles, Flame, Moon, Sun, Wind, Calendar, RefreshCw } from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";
import { format, subDays } from "date-fns";

interface CycleEntry {
  id: string; startDate: string; flowLevel: string; symptoms: string | null; mood: string | null; notes: string | null;
}
interface AIAdvice { phase: string; advice: string; studyPlan: string; model?: string; }

const FLOW_LEVELS = ["LIGHT", "MODERATE", "HEAVY", "SPOTTING"];
const SYMPTOMS_OPTIONS = ["Cramps", "Bloating", "Headache", "Back Pain", "Fatigue", "Mood Swings", "Nausea", "None"];
const PHASE_META = {
  menstrual:   { label: "Menstrual Phase",  days: "Days 1–5",   icon: Moon,  color: "var(--rose-bright)", bg: "hsla(352,65%,60%,0.10)", border: "hsla(352,65%,60%,0.28)", emoji: "🌑", desc: "Energy is low. Focus on light revision and theory." },
  follicular:  { label: "Follicular Phase", days: "Days 6–13",  icon: Sun,   color: "var(--gold)",        bg: "hsla(38,72%,58%,0.10)",  border: "hsla(38,72%,58%,0.28)",  emoji: "🌱", desc: "Rising energy. Best time for new topics and problem solving." },
  ovulatory:   { label: "Ovulatory Phase",  days: "Days 14–16", icon: Flame, color: "var(--botany)",      bg: "hsla(142,65%,48%,0.10)", border: "hsla(142,65%,48%,0.28)", emoji: "⚡", desc: "Peak energy and focus. Push hardest here." },
  luteal:      { label: "Luteal Phase",     days: "Days 17–28", icon: Wind,  color: "var(--lotus-bright)",bg: "hsla(285,50%,60%,0.10)", border: "hsla(285,50%,60%,0.28)", emoji: "🌙", desc: "Emotional fluctuation. Good for practice tests." },
  unknown:     { label: "Phase Unknown",    days: "Log cycle",  icon: Heart, color: "var(--text-muted)",  bg: "var(--glass-ultra)",     border: "var(--glass-border)",   emoji: "❓", desc: "Log your cycle to get phase-aware guidance." },
};

function clean(text: string) {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s*/gm, "").replace(/^[-–]\s/gm, "").trim();
}

export default function CyclePlannerPage() {
  const [entries, setEntries]         = useState<CycleEntry[]>([]);
  const [currentPhase, setCurrentPhase] = useState("unknown");
  const [dayOfCycle, setDayOfCycle]   = useState<number | null>(null);
  const [advice, setAdvice]           = useState<AIAdvice | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [showLog, setShowLog]         = useState(false);
  const [error, setError]             = useState("");

  // Log form state
  const [logDate, setLogDate]         = useState(format(new Date(), "yyyy-MM-dd"));
  const [logFlow, setLogFlow]         = useState("MODERATE");
  const [logSymptoms, setLogSymptoms] = useState<string[]>([]);
  const [logNotes, setLogNotes]       = useState("");
  const [logSaving, setLogSaving]     = useState(false);

  const fetchEntries = useCallback(async () => {
    const res = await fetch("/api/cycle");
    if (res.ok) {
      const data: CycleEntry[] = await res.json();
      setEntries(data);
      if (data.length > 0) {
        const last = data[0];
        const start = new Date(last.startDate);
        const day = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
        setDayOfCycle(day);
        if (day <= 5) setCurrentPhase("menstrual");
        else if (day <= 13) setCurrentPhase("follicular");
        else if (day <= 16) setCurrentPhase("ovulatory");
        else if (day <= 28) setCurrentPhase("luteal");
        else setCurrentPhase("follicular"); // New cycle started
      }
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const getAIAdvice = async () => {
    setLoadingAdvice(true); setError(""); setAdvice(null);
    try {
      const prompt = `Current cycle phase: ${currentPhase}. Day of cycle: ${dayOfCycle ?? "unknown"}. The student is Divyani — NEET 2027, 4th attempt, AIIMS Delhi target.

Provide phase-specific study guidance in this exact structure:

PHASE: ${currentPhase}

BODY & ENERGY:
[2-3 sentences on what's happening physically and mentally in this phase]

STUDY STRATEGY:
[3-4 sentences: what types of tasks she should prioritize, what to avoid, how to structure her day]

TODAY'S PLAN:
[Specific 6-hour study schedule: Morning, Afternoon, Evening — with subject recommendations appropriate for her energy level in this phase]

IMPORTANT: Write in clean prose. No asterisks, no bullet points, no dashes. Be direct and practical.`;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, mode: "cycle" }),
      });

      if (!res.body) throw new Error("No response");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let modelUsed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) fullText += data.text;
            if (data.model) modelUsed = data.model;
          } catch {}
        }
      }

      setAdvice({ phase: currentPhase, advice: clean(fullText), studyPlan: "", model: modelUsed });
    } catch (e) { setError(String(e)); }
    finally { setLoadingAdvice(false); }
  };

  const saveLog = async () => {
    setLogSaving(true);
    await fetch("/api/cycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: logDate,
        flowLevel: logFlow,
        symptoms: logSymptoms.join(", ") || null,
        notes: logNotes || null,
      }),
    });
    setLogSaving(false); setShowLog(false);
    setLogNotes(""); setLogSymptoms([]);
    fetchEntries();
  };

  const phase = PHASE_META[currentPhase as keyof typeof PHASE_META] || PHASE_META.unknown;
  const PhaseIcon = phase.icon;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SmoothLink href="/ai-insights" className="btn btn-ghost btn-sm" style={{ padding: "6px 10px" }} direction="back"><ChevronLeft size={16} /></SmoothLink>
          <div>
            <h1 className="page-title" style={{ background: "linear-gradient(135deg, var(--rose-bright), var(--lotus-bright))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Cycle & Wellness Planner
            </h1>
            <p className="page-subtitle">Phase-aware study optimisation · Synced with your mood data</p>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowLog(!showLog)}>
          <Plus size={14} /> Log Cycle
        </button>
      </div>

      {/* Current Phase Banner */}
      <div
        className="glass-card phase-banner animate-fade-in"
        style={{ background: phase.bg, borderColor: phase.border, marginBottom: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, flexShrink: 0,
            background: `color-mix(in srgb, ${phase.color} 15%, transparent)`,
            border: `1px solid ${phase.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, boxShadow: `0 0 20px color-mix(in srgb, ${phase.color} 20%, transparent)`,
          }}>
            {phase.emoji}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: phase.color, marginBottom: 3 }}>
              Current Phase
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginBottom: 3 }}>{phase.label}</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{phase.days}{dayOfCycle ? ` · Day ${dayOfCycle} of cycle` : ""}</p>
          </div>
        </div>
        <div style={{ maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{phase.desc}</p>
        </div>
      </div>

      {/* Log form */}
      {showLog && (
        <div className="glass-card animate-scale-in" style={{ padding: 28, marginBottom: 24, borderColor: phase.border }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: phase.color, marginBottom: 18 }}>Log Cycle Entry</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Start Date</label>
              <input type="date" className="input" value={logDate} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Flow Level</label>
              <select className="input select" value={logFlow} onChange={(e) => setLogFlow(e.target.value)}>
                {FLOW_LEVELS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Symptoms</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {SYMPTOMS_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`quiz-chip ${logSymptoms.includes(s) ? "active" : ""}`}
                  style={logSymptoms.includes(s) ? { "--fc": "var(--rose-bright)" } as React.CSSProperties : {}}
                  onClick={() => setLogSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Notes (optional)</label>
            <textarea className="input" style={{ minHeight: 72 }} placeholder="How are you feeling? Any other notes..." value={logNotes} onChange={(e) => setLogNotes(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveLog} disabled={logSaving}>{logSaving ? "Saving..." : "Save Entry"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLog(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        {/* AI Advice */}
        <div>
          <button
            className="btn btn-primary btn-lg"
            onClick={getAIAdvice}
            disabled={loadingAdvice}
            style={{ marginBottom: 20 }}
          >
            {loadingAdvice
              ? <><RefreshCw size={16} style={{ animation: "spin-slow 1s linear infinite" }} /> Generating advice...</>
              : <><Sparkles size={16} /> Get AI Study Advice for {phase.label}</>}
          </button>

          {error && (
            <div style={{ padding: "12px 16px", background: "hsla(0,64%,58%,0.08)", border: "1px solid hsla(0,64%,58%,0.22)", borderRadius: "var(--r-lg)", fontSize: 13, color: "var(--danger)", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {loadingAdvice && (
            <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
              <div className="typing-indicator" style={{ justifyContent: "center", marginBottom: 16 }}>
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>NEET-GURU is reading your cycle phase, mood data, and study logs...</p>
            </div>
          )}

          {advice && !loadingAdvice && (
            <div className="glass-card animate-fade-in" style={{ padding: 28, borderColor: phase.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <PhaseIcon size={18} style={{ color: phase.color }} />
                <h3 style={{ fontSize: 17, fontWeight: 700, color: phase.color }}>
                  Phase-Aware Guidance · {phase.label}
                </h3>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.85, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                {advice.advice}
              </div>
              {advice.model && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>
                  Generated by: {advice.model.split("/").pop()?.replace(":free", "")}
                </p>
              )}
            </div>
          )}

          {!advice && !loadingAdvice && (
            <div className="glass-card" style={{ padding: 36, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{phase.emoji}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Get phase-optimised study advice
              </h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: 380, margin: "0 auto" }}>
                NEET-GURU will analyse your current cycle phase, recent mood entries, and study history to give you a precise daily plan.
              </p>
            </div>
          )}
        </div>

        {/* Cycle History */}
        <div>
          <div className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Calendar size={16} style={{ color: "var(--rose-bright)" }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Cycle History</h3>
            </div>
            {entries.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No entries yet. Log your cycle above.</p>
            ) : entries.slice(0, 8).map((entry) => {
              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex", gap: 12, padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--rose-bright)", flexShrink: 0, marginTop: 5, boxShadow: "0 0 6px var(--rose-glow)" }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {format(new Date(entry.startDate), "d MMM yyyy")}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Flow: {entry.flowLevel}
                      {entry.symptoms && ` · ${entry.symptoms}`}
                    </div>
                    {entry.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.4 }}>{entry.notes}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phase Guide */}
          <div className="glass-card" style={{ padding: 22, marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Phase Guide</h3>
            {(["menstrual", "follicular", "ovulatory", "luteal"] as const).map((p) => {
              const pm = PHASE_META[p];
              const Icon = pm.icon;
              return (
                <div key={p} style={{
                  display: "flex", gap: 10, padding: "8px 10px", borderRadius: "var(--r-md)",
                  background: currentPhase === p ? pm.bg : "transparent",
                  border: `1px solid ${currentPhase === p ? pm.border : "transparent"}`,
                  marginBottom: 4,
                }}>
                  <Icon size={15} style={{ color: pm.color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pm.color }}>{pm.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pm.days}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .phase-banner {
          display: flex; align-items: center; justify-content: space-between;
          padding: 28px 32px; gap: 24px;
        }
        .form-label {
          display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 6px;
        }
        .quiz-chip {
          padding: 6px 12px; border-radius: var(--r-pill);
          background: var(--glass-ultra); border: 1px solid var(--glass-border);
          font-size: 12.5px; cursor: pointer; color: var(--text-secondary); transition: var(--t-fast);
        }
        .quiz-chip.active {
          background: color-mix(in srgb, var(--rose-bright) 14%, transparent);
          border-color: color-mix(in srgb, var(--rose-bright) 30%, transparent);
          color: var(--rose-bright);
        }
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 340px"] { grid-template-columns: 1fr !important; }
          .phase-banner { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
