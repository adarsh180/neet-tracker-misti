"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  Activity,
  Brain,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Heart,
  Lock,
  Moon,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";

type CyclePhase = "menstrual" | "follicular" | "ovulatory" | "luteal" | "late" | "unknown";
type CalendarDayKind = "logged-period" | "predicted-period" | "fertile-window" | "ovulation-window" | "mood" | "today";

interface CycleCalendarDay {
  date: string;
  dayOfCycle: number | null;
  phase: CyclePhase;
  kinds: CalendarDayKind[];
  flowLevel?: string | null;
  symptoms?: string | null;
  cycleEntryId?: string | null;
  mood?: {
    mood: string;
    energy: number;
    focus: number;
    stress: number;
    note: string | null;
  } | null;
}

interface CycleLog {
  id: string;
  startDate: string;
  endDate: string | null;
  flowLevel: string;
  symptoms: string | null;
  mood: string | null;
  notes: string | null;
  lengthFromPrevious: number | null;
  periodDays: number | null;
}

interface CycleIntelligence {
  generatedAt: string;
  currentPhase: CyclePhase;
  dayOfCycle: number | null;
  lastPeriodStart: string | null;
  lastPeriodEnd: string | null;
  predictedStart: string | null;
  predictedWindowStart: string | null;
  predictedWindowEnd: string | null;
  ovulationWindowStart: string | null;
  ovulationWindowEnd: string | null;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  expectedPeriodLength: number;
  averageCycleLength: number;
  cycleVariability: number;
  cycleLengths: number[];
  confidence: number;
  confidenceLabel: "Very low" | "Low" | "Medium" | "High";
  status: "needs_more_data" | "learning" | "ready" | "overdue";
  daysUntilPredictedStart: number | null;
  overdueDays: number | null;
  evidence: {
    cycleCount: number;
    completedCycleCount: number;
    moodEntriesMapped: number;
    method: string;
    privacy: string;
  };
  studySignals: {
    avgEnergy: number | null;
    avgFocus: number | null;
    avgStress: number | null;
    lowEnergyCycleDays: number[];
    highFocusCycleDays: number[];
    mostCommonSymptoms: string[];
    recommendationTone: "protect" | "balanced" | "push";
  };
  logs: CycleLog[];
  calendar: CycleCalendarDay[];
}

const FLOW_LEVELS = ["LIGHT", "MODERATE", "HEAVY", "SPOTTING"];
const CYCLE_MOODS = ["NORMAL", "HAPPY", "ANXIOUS", "TIRED", "CRAMPY"];
const SYMPTOMS_OPTIONS = ["Cramps", "Bloating", "Headache", "Back Pain", "Fatigue", "Mood Swings", "Nausea", "Tenderness", "None"];

const PHASE_META: Record<CyclePhase, { label: string; short: string; icon: typeof Heart; color: string; bg: string; border: string; study: string }> = {
  menstrual: {
    label: "Menstrual Phase",
    short: "Menstrual",
    icon: Moon,
    color: "var(--rose-bright)",
    bg: "hsla(350,72%,66%,0.10)",
    border: "hsla(350,72%,66%,0.26)",
    study: "Protect energy. Prefer revision, formula recall, NCERT biology, and error-log cleanup.",
  },
  follicular: {
    label: "Follicular Phase",
    short: "Follicular",
    icon: Sun,
    color: "var(--gold)",
    bg: "hsla(38,72%,58%,0.10)",
    border: "hsla(38,72%,58%,0.26)",
    study: "Rising energy. Use this window for new chapters, Physics numericals, and hard concept building.",
  },
  ovulatory: {
    label: "Ovulatory Window",
    short: "Ovulatory",
    icon: Zap,
    color: "var(--botany)",
    bg: "hsla(142,60%,48%,0.10)",
    border: "hsla(142,60%,48%,0.26)",
    study: "Peak execution window. Schedule mocks, timed drills, and demanding mixed practice.",
  },
  luteal: {
    label: "Luteal Phase",
    short: "Luteal",
    icon: Wind,
    color: "var(--lotus-bright)",
    bg: "hsla(286,52%,68%,0.10)",
    border: "hsla(286,52%,68%,0.26)",
    study: "Stabilize rhythm. Use planned blocks, mock review, revision, and lower-friction starts.",
  },
  late: {
    label: "Late / Irregular Window",
    short: "Late",
    icon: Activity,
    color: "var(--warning)",
    bg: "hsla(42,90%,62%,0.10)",
    border: "hsla(42,90%,62%,0.26)",
    study: "Prediction window has passed. Keep logging calmly and avoid turning uncertainty into stress.",
  },
  unknown: {
    label: "Learning Phase",
    short: "Learning",
    icon: Heart,
    color: "var(--text-secondary)",
    bg: "var(--glass-ultra)",
    border: "var(--glass-border)",
    study: "Log at least three starts and end dates so the model can learn her actual rhythm.",
  },
};

const TONE_COPY = {
  protect: "Protect Mode",
  balanced: "Balanced Mode",
  push: "Push Mode",
};

function displayDate(value: string | null) {
  if (!value) return "Not enough data";
  return format(parseISO(`${value}T12:00:00`), "d MMM yyyy");
}

function clean(text: string) {
  return text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s*/gm, "").replace(/^[-–]\s/gm, "").trim();
}

function hasKind(day: CycleCalendarDay | undefined, kind: CalendarDayKind) {
  return Boolean(day?.kinds.includes(kind));
}

function moodColor(mood?: string | null) {
  if (mood === "AMAZING" || mood === "HAPPY") return "var(--gold)";
  if (mood === "GOOD" || mood === "NORMAL") return "var(--botany)";
  if (mood === "OKAY" || mood === "TIRED") return "var(--physics)";
  if (mood === "LOW" || mood === "ANXIOUS" || mood === "CRAMPY") return "var(--lotus-bright)";
  if (mood === "TERRIBLE") return "var(--danger)";
  return "var(--text-muted)";
}

export default function CyclePlannerPage() {
  const [data, setData] = useState<CycleIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [advice, setAdvice] = useState("");
  const [adviceModel, setAdviceModel] = useState("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const [logStart, setLogStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [logEnd, setLogEnd] = useState("");
  const [logFlow, setLogFlow] = useState("MODERATE");
  const [logMood, setLogMood] = useState("NORMAL");
  const [logSymptoms, setLogSymptoms] = useState<string[]>([]);
  const [logNotes, setLogNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCycle = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cycle", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Unable to load cycle intelligence");
      setData(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCycle();
  }, [fetchCycle]);

  const daysByDate = useMemo(() => {
    const map = new Map<string, CycleCalendarDay>();
    data?.calendar.forEach((day) => map.set(day.date, day));
    return map;
  }, [data]);

  const visibleDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const selectedDay = daysByDate.get(selectedDate);
  const phase = data ? PHASE_META[data.currentPhase] : PHASE_META.unknown;
  const PhaseIcon = phase.icon;

  const predictionLine = data?.predictedStart
    ? data.status === "overdue"
      ? `Expected around ${displayDate(data.predictedStart)}. Window passed ${data.overdueDays} day${data.overdueDays === 1 ? "" : "s"} ago.`
      : `${displayDate(data.predictedStart)} with window ${displayDate(data.predictedWindowStart)} to ${displayDate(data.predictedWindowEnd)}`
    : "Log cycle starts to unlock prediction.";

  const saveLog = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: logStart,
          endDate: logEnd || null,
          flowLevel: logFlow,
          mood: logMood,
          symptoms: logSymptoms.join(", ") || null,
          notes: logNotes || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Unable to save cycle log");
      setData(payload.intelligence);
      setSelectedDate(logStart);
      setMonth(startOfMonth(parseISO(`${logStart}T12:00:00`)));
      setShowLog(false);
      setLogEnd("");
      setLogNotes("");
      setLogSymptoms([]);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const getAIAdvice = async () => {
    if (!data) return;
    setLoadingAdvice(true);
    setAdvice("");
    setAdviceModel("");
    setError("");

    const prompt = `Use this private cycle intelligence JSON to create a NEET study plan for today. Do not diagnose medical conditions. Do not claim exact ovulation. Use the prediction confidence honestly.

${JSON.stringify(
  {
    currentPhase: data.currentPhase,
    dayOfCycle: data.dayOfCycle,
    predictedStart: data.predictedStart,
    predictedWindowStart: data.predictedWindowStart,
    predictedWindowEnd: data.predictedWindowEnd,
    confidence: data.confidence,
    confidenceLabel: data.confidenceLabel,
    averageCycleLength: data.averageCycleLength,
    cycleVariability: data.cycleVariability,
    studySignals: data.studySignals,
    lastLogs: data.logs.slice(0, 6),
  },
  null,
  2
)}

Return exactly four sections: Body Signal, Study Strategy, Today Plan, Safety Note. Keep it direct and practical.`;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, mode: "cycle" }),
      });

      if (!res.body) throw new Error("No AI response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.text) fullText += parsed.text;
            if (parsed.model) setAdviceModel(parsed.model);
            if (parsed.error) throw new Error(parsed.error);
          } catch (err) {
            if (err instanceof Error && err.message !== "Unexpected end of JSON input") throw err;
          }
        }
      }

      setAdvice(clean(fullText));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingAdvice(false);
    }
  };

  return (
    <div className="cycle-page">
      <div className="cycle-bg" />

      <div className="cycle-shell">
        <header className="cycle-header">
          <div className="cycle-title-wrap">
            <SmoothLink href="/ai-insights" className="btn btn-ghost btn-sm cycle-back" direction="back">
              <ChevronLeft size={16} />
            </SmoothLink>
            <div>
              <div className="cycle-kicker">
                <ShieldCheck size={14} />
                Private cycle intelligence
              </div>
              <h1 className="cycle-title">Cycle & Study Calendar</h1>
              <p className="cycle-subtitle">
                Personalized period prediction, mood overlays, and NEET workload rhythm from her real logs.
              </p>
            </div>
          </div>

          <div className="cycle-actions">
            <button className="btn btn-glass btn-sm" onClick={fetchCycle} disabled={loading} type="button">
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowLog((value) => !value)} type="button">
              <Plus size={14} />
              Log Period
            </button>
          </div>
        </header>

        {error && <div className="cycle-error">{error}</div>}

        {loading && !data ? (
          <div className="glass-card cycle-loading">
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <p>Building her private cycle model...</p>
          </div>
        ) : data ? (
          <>
            <section className="cycle-hero">
              <div className="cycle-phase-card" style={{ "--phase": phase.color, "--phase-bg": phase.bg, "--phase-border": phase.border } as React.CSSProperties}>
                <div className="phase-icon">
                  <PhaseIcon size={28} />
                </div>
                <div className="phase-main">
                  <div className="phase-label">Current Phase</div>
                  <h2>{phase.label}</h2>
                  <p>{data.dayOfCycle ? `Day ${data.dayOfCycle} of cycle` : "The model needs more cycle starts"}</p>
                </div>
                <div className="phase-study">{phase.study}</div>
              </div>

              <div className="prediction-grid">
                <div className="metric-card metric-card-primary">
                  <div className="metric-top">
                    <Calendar size={17} />
                    <span>Next Period Prediction</span>
                  </div>
                  <strong>{displayDate(data.predictedStart)}</strong>
                  <p>{predictionLine}</p>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <TrendingUp size={17} />
                    <span>Confidence</span>
                  </div>
                  <strong>{data.confidence}%</strong>
                  <div className="confidence-bar">
                    <span style={{ width: `${data.confidence}%` }} />
                  </div>
                  <p>{data.confidenceLabel} confidence from {data.evidence.completedCycleCount} completed cycle{data.evidence.completedCycleCount === 1 ? "" : "s"}.</p>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <Activity size={17} />
                    <span>Personal Rhythm</span>
                  </div>
                  <strong>{data.averageCycleLength} days</strong>
                  <p>Typical cycle with plus/minus {data.cycleVariability.toFixed(1)} day variability and {data.expectedPeriodLength} day period length.</p>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <Brain size={17} />
                    <span>Study Mode</span>
                  </div>
                  <strong>{TONE_COPY[data.studySignals.recommendationTone]}</strong>
                  <p>Energy {data.studySignals.avgEnergy ?? "?"}/10, focus {data.studySignals.avgFocus ?? "?"}/10, stress {data.studySignals.avgStress ?? "?"}/10 from mapped mood logs.</p>
                </div>
              </div>
            </section>

            {showLog && (
              <section className="glass-card log-panel">
                <div className="panel-head">
                  <div>
                    <h2>Log Period Window</h2>
                    <p>Start date is required. End date improves prediction precision.</p>
                  </div>
                  <Lock size={17} />
                </div>

                <div className="log-grid">
                  <label>
                    <span>Start Date</span>
                    <input className="input" type="date" value={logStart} max={format(new Date(), "yyyy-MM-dd")} onChange={(event) => setLogStart(event.target.value)} />
                  </label>
                  <label>
                    <span>End Date</span>
                    <input className="input" type="date" value={logEnd} min={logStart} max={format(new Date(), "yyyy-MM-dd")} onChange={(event) => setLogEnd(event.target.value)} />
                  </label>
                  <label>
                    <span>Flow</span>
                    <select className="input select" value={logFlow} onChange={(event) => setLogFlow(event.target.value)}>
                      {FLOW_LEVELS.map((flow) => <option key={flow}>{flow}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Cycle Mood</span>
                    <select className="input select" value={logMood} onChange={(event) => setLogMood(event.target.value)}>
                      {CYCLE_MOODS.map((mood) => <option key={mood}>{mood}</option>)}
                    </select>
                  </label>
                </div>

                <div className="symptom-wrap">
                  <span>Symptoms</span>
                  <div className="symptom-list">
                    {SYMPTOMS_OPTIONS.map((symptom) => (
                      <button
                        key={symptom}
                        className={logSymptoms.includes(symptom) ? "symptom-chip active" : "symptom-chip"}
                        onClick={() => setLogSymptoms((prev) => prev.includes(symptom) ? prev.filter((item) => item !== symptom) : [...prev, symptom])}
                        type="button"
                      >
                        {symptom}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="notes-label">
                  <span>Notes</span>
                  <textarea className="input" value={logNotes} onChange={(event) => setLogNotes(event.target.value)} placeholder="Pain, sleep, cravings, study impact, medicines, or anything worth remembering." />
                </label>

                <div className="log-actions">
                  <button className="btn btn-primary btn-sm" onClick={saveLog} disabled={saving} type="button">
                    {saving ? "Saving..." : "Save Private Log"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowLog(false)} type="button">Cancel</button>
                </div>
              </section>
            )}

            <section className="calendar-layout">
              <div className="glass-card calendar-card">
                <div className="calendar-head">
                  <button className="icon-btn" onClick={() => setMonth((value) => subMonths(value, 1))} type="button" aria-label="Previous month">
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <h2>{format(month, "MMMM yyyy")}</h2>
                    <p>Actual logs, mood entries, and prediction windows in one view.</p>
                  </div>
                  <button className="icon-btn" onClick={() => setMonth((value) => addMonths(value, 1))} type="button" aria-label="Next month">
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="legend-row">
                  <span><i className="legend actual" />Logged period</span>
                  <span><i className="legend predicted" />Predicted period</span>
                  <span><i className="legend fertile" />Fertile window</span>
                  <span><i className="legend mood" />Mood log</span>
                </div>

                <div className="weekday-grid">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}
                </div>

                <div className="calendar-grid">
                  {visibleDays.map((date) => {
                    const key = format(date, "yyyy-MM-dd");
                    const day = daysByDate.get(key);
                    const meta = PHASE_META[day?.phase ?? "unknown"];
                    const selected = selectedDate === key;

                    return (
                      <button
                        key={key}
                        className={[
                          "calendar-day",
                          !isSameMonth(date, month) ? "muted" : "",
                          selected ? "selected" : "",
                          hasKind(day, "today") ? "today" : "",
                          hasKind(day, "logged-period") ? "actual" : "",
                          hasKind(day, "predicted-period") ? "predicted" : "",
                          hasKind(day, "fertile-window") ? "fertile" : "",
                          hasKind(day, "ovulation-window") ? "ovulation" : "",
                        ].filter(Boolean).join(" ")}
                        style={{ "--day-phase": meta.color } as React.CSSProperties}
                        onClick={() => setSelectedDate(key)}
                        type="button"
                      >
                        <span className="day-number">{format(date, "d")}</span>
                        {day?.dayOfCycle && <span className="cycle-day">D{day.dayOfCycle}</span>}
                        <span className="day-markers">
                          {hasKind(day, "logged-period") && <i className="marker actual" />}
                          {hasKind(day, "predicted-period") && <i className="marker predicted" />}
                          {hasKind(day, "ovulation-window") && <i className="marker ovulation" />}
                          {day?.mood && <i className="marker mood" style={{ background: moodColor(day.mood.mood) }} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="side-stack">
                <div className="glass-card day-card">
                  <div className="panel-head">
                    <div>
                      <h2>{displayDate(selectedDate)}</h2>
                      <p>Selected day insight</p>
                    </div>
                    <Target size={17} />
                  </div>

                  {selectedDay ? (
                    <div className="day-detail">
                      <div className="detail-row">
                        <span>Phase</span>
                        <strong style={{ color: PHASE_META[selectedDay.phase].color }}>{PHASE_META[selectedDay.phase].short}</strong>
                      </div>
                      <div className="detail-row">
                        <span>Cycle Day</span>
                        <strong>{selectedDay.dayOfCycle ? `Day ${selectedDay.dayOfCycle}` : "Unknown"}</strong>
                      </div>
                      {selectedDay.flowLevel && (
                        <div className="detail-row">
                          <span>Flow</span>
                          <strong>{selectedDay.flowLevel}</strong>
                        </div>
                      )}
                      {selectedDay.symptoms && (
                        <div className="detail-note">
                          <span>Symptoms</span>
                          <p>{selectedDay.symptoms}</p>
                        </div>
                      )}
                      {selectedDay.mood && (
                        <div className="mood-box">
                          <div>
                            <span>Mood</span>
                            <strong style={{ color: moodColor(selectedDay.mood.mood) }}>{selectedDay.mood.mood}</strong>
                          </div>
                          <div className="mood-mini">
                            <span>Energy {selectedDay.mood.energy}</span>
                            <span>Focus {selectedDay.mood.focus}</span>
                            <span>Stress {selectedDay.mood.stress}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="empty-copy">No model data for this date yet.</p>
                  )}
                </div>

                <div className="glass-card privacy-card">
                  <Lock size={18} />
                  <div>
                    <h3>Private by design</h3>
                    <p>Cycle and mood APIs now require a signed HTTP-only session. Browser local storage alone is no longer enough to read this data.</p>
                  </div>
                </div>

                <div className="glass-card symptoms-card">
                  <h3>Pattern Signals</h3>
                  <div className="signal-list">
                    <div>
                      <span>Low-energy days</span>
                      <strong>{data.studySignals.lowEnergyCycleDays.length ? data.studySignals.lowEnergyCycleDays.join(", ") : "Learning"}</strong>
                    </div>
                    <div>
                      <span>High-focus days</span>
                      <strong>{data.studySignals.highFocusCycleDays.length ? data.studySignals.highFocusCycleDays.join(", ") : "Learning"}</strong>
                    </div>
                    <div>
                      <span>Common symptoms</span>
                      <strong>{data.studySignals.mostCommonSymptoms.length ? data.studySignals.mostCommonSymptoms.join(", ") : "None yet"}</strong>
                    </div>
                  </div>
                </div>
              </aside>
            </section>

            <section className="history-ai-grid">
              <div className="glass-card history-card">
                <div className="panel-head">
                  <div>
                    <h2>Previous Period Logs</h2>
                    <p>Start, end, symptoms, moods, and learned cycle length.</p>
                  </div>
                  <Heart size={17} />
                </div>

                <div className="history-list">
                  {data.logs.length === 0 ? (
                    <p className="empty-copy">No private cycle logs yet.</p>
                  ) : data.logs.slice(0, 10).map((log) => (
                    <div key={log.id} className="history-row">
                      <div className="history-date">
                        <strong>{displayDate(log.startDate)}</strong>
                        <span>{log.endDate ? `Ended ${displayDate(log.endDate)}` : "End date not logged"}</span>
                      </div>
                      <div className="history-meta">
                        <span>{log.flowLevel}</span>
                        {log.periodDays && <span>{log.periodDays} period days</span>}
                        {log.lengthFromPrevious && <span>{log.lengthFromPrevious} day cycle</span>}
                        {log.mood && <span style={{ color: moodColor(log.mood) }}>{log.mood}</span>}
                      </div>
                      {(log.symptoms || log.notes) && (
                        <p>{[log.symptoms, log.notes].filter(Boolean).join(" | ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card ai-card">
                <div className="panel-head">
                  <div>
                    <h2>AI Study Adjustment</h2>
                    <p>Uses only the private prediction summary and her tracker context.</p>
                  </div>
                  <Sparkles size={17} />
                </div>

                <button className="btn btn-primary btn-lg ai-button" onClick={getAIAdvice} disabled={loadingAdvice} type="button">
                  {loadingAdvice ? <><RefreshCw size={16} className="spin" /> Generating plan...</> : <><Sparkles size={16} /> Generate Today&apos;s Cycle-Aware Plan</>}
                </button>

                {loadingAdvice && (
                  <div className="ai-loading">
                    <div className="typing-indicator">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                )}

                {advice && (
                  <div className="ai-output">
                    {advice}
                    {adviceModel && <p className="model-line">Generated by {adviceModel.split("/").pop()}</p>}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <style jsx>{`
        .cycle-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(circle at 14% 4%, rgba(232, 114, 138, 0.1), transparent 24%),
            radial-gradient(circle at 92% 8%, rgba(91, 156, 245, 0.08), transparent 22%),
            radial-gradient(circle at 42% 110%, rgba(212, 168, 83, 0.08), transparent 28%),
            #07070a;
        }

        .cycle-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.65), transparent 82%);
          opacity: 0.55;
        }

        .cycle-shell {
          position: relative;
          z-index: 1;
          width: min(1380px, 100%);
          margin: 0 auto;
          padding: 36px 24px 104px;
        }

        .cycle-header,
        .cycle-title-wrap,
        .cycle-actions,
        .calendar-head,
        .panel-head,
        .metric-top,
        .legend-row,
        .log-actions {
          display: flex;
          align-items: center;
        }

        .cycle-header {
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }

        .cycle-title-wrap {
          align-items: flex-start;
          gap: 12px;
          min-width: min(100%, 640px);
        }

        .cycle-back {
          margin-top: 6px;
          padding: 7px 10px;
        }

        .cycle-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          padding: 7px 12px;
          border-radius: 999px;
          color: rgba(255, 214, 138, 0.92);
          background: rgba(212, 168, 83, 0.08);
          border: 1px solid rgba(212, 168, 83, 0.14);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .cycle-title {
          margin: 0;
          font-size: clamp(34px, 5vw, 62px);
          line-height: 0.98;
          letter-spacing: -0.04em;
        }

        .cycle-subtitle {
          max-width: 720px;
          margin-top: 12px;
          color: rgba(255, 255, 255, 0.56);
          font-size: 14.5px;
          line-height: 1.7;
        }

        .cycle-actions {
          gap: 10px;
          flex-wrap: wrap;
        }

        .cycle-error {
          margin-bottom: 18px;
          padding: 13px 16px;
          border-radius: 16px;
          color: var(--danger);
          background: hsla(0, 72%, 62%, 0.08);
          border: 1px solid hsla(0, 72%, 62%, 0.22);
          font-size: 13px;
        }

        .cycle-loading {
          padding: 52px;
          display: grid;
          place-items: center;
          gap: 14px;
          color: var(--text-secondary);
        }

        .cycle-hero,
        .calendar-layout,
        .history-ai-grid {
          display: grid;
          gap: 20px;
        }

        .cycle-hero {
          grid-template-columns: minmax(0, 1fr);
          margin-bottom: 20px;
        }

        .cycle-phase-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) minmax(260px, 420px);
          gap: 18px;
          align-items: center;
          padding: 24px;
          border-radius: 26px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            var(--phase-bg);
          border: 1px solid var(--phase-border);
          box-shadow: 0 26px 76px rgba(0, 0, 0, 0.36);
        }

        .phase-icon {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          display: grid;
          place-items: center;
          color: var(--phase);
          background: color-mix(in srgb, var(--phase) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--phase) 24%, transparent);
        }

        .phase-label,
        .metric-top,
        .panel-head p,
        .history-date span,
        .detail-row span,
        .detail-note span,
        .signal-list span,
        .log-grid span,
        .symptom-wrap > span,
        .notes-label > span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .phase-main h2,
        .panel-head h2,
        .calendar-head h2 {
          margin: 3px 0 4px;
          font-size: 22px;
          letter-spacing: -0.03em;
        }

        .phase-main p,
        .phase-study,
        .metric-card p,
        .privacy-card p,
        .calendar-head p,
        .empty-copy {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.65;
        }

        .prediction-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .metric-card,
        .calendar-card,
        .day-card,
        .privacy-card,
        .symptoms-card,
        .history-card,
        .ai-card,
        .log-panel {
          padding: 22px;
          border-radius: 24px;
        }

        .metric-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
            rgba(14, 14, 18, 0.72);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 18px 48px rgba(0,0,0,0.24);
        }

        .metric-card-primary {
          border-color: rgba(232, 114, 138, 0.22);
        }

        .metric-top {
          gap: 8px;
          color: rgba(255, 255, 255, 0.44);
          margin-bottom: 10px;
        }

        .metric-card strong {
          display: block;
          color: rgba(255,255,255,0.96);
          font-size: 25px;
          line-height: 1.1;
          margin-bottom: 8px;
          letter-spacing: -0.04em;
        }

        .confidence-bar {
          height: 7px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          margin-bottom: 9px;
        }

        .confidence-bar span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--rose-bright), var(--gold), var(--botany));
        }

        .log-panel {
          margin-bottom: 20px;
        }

        .panel-head {
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        .log-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .log-grid label,
        .notes-label,
        .symptom-wrap {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .symptom-wrap,
        .notes-label {
          margin-top: 15px;
        }

        .symptom-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .symptom-chip {
          padding: 7px 11px;
          border-radius: 999px;
          color: var(--text-secondary);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          font-size: 12px;
          transition: var(--t-fast);
        }

        .symptom-chip.active {
          color: var(--rose-bright);
          border-color: rgba(232,114,138,0.32);
          background: rgba(232,114,138,0.1);
        }

        .notes-label textarea {
          min-height: 84px;
          resize: vertical;
        }

        .log-actions {
          gap: 9px;
          margin-top: 16px;
        }

        .calendar-layout {
          grid-template-columns: minmax(0, 1fr) 360px;
          align-items: start;
        }

        .calendar-card {
          min-width: 0;
        }

        .calendar-head {
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
          text-align: center;
        }

        .icon-btn {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          color: var(--text-secondary);
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          cursor: pointer;
        }

        .legend-row {
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 14px;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .legend-row span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .legend,
        .marker {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
        }

        .legend.actual,
        .marker.actual {
          background: var(--rose-bright);
        }

        .legend.predicted,
        .marker.predicted {
          background: var(--gold);
        }

        .legend.fertile {
          background: var(--botany);
        }

        .legend.mood,
        .marker.mood {
          background: var(--physics);
        }

        .marker.ovulation {
          background: var(--botany);
        }

        .weekday-grid,
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }

        .weekday-grid {
          margin-bottom: 8px;
        }

        .weekday-grid span {
          color: var(--text-muted);
          text-align: center;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .calendar-day {
          position: relative;
          min-height: 96px;
          border-radius: 17px;
          padding: 10px;
          text-align: left;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025)),
            rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          color: var(--text-primary);
          cursor: pointer;
          transition: var(--t-fast);
          overflow: hidden;
        }

        .calendar-day:hover,
        .calendar-day.selected {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--day-phase) 36%, rgba(255,255,255,0.08));
          box-shadow: 0 16px 28px rgba(0,0,0,0.18);
        }

        .calendar-day.muted {
          opacity: 0.4;
        }

        .calendar-day.actual {
          background:
            linear-gradient(180deg, rgba(232,114,138,0.22), rgba(232,114,138,0.08)),
            rgba(255,255,255,0.03);
          border-color: rgba(232,114,138,0.3);
        }

        .calendar-day.predicted:not(.actual) {
          background:
            linear-gradient(180deg, rgba(212,168,83,0.18), rgba(212,168,83,0.055)),
            rgba(255,255,255,0.03);
          border-color: rgba(212,168,83,0.24);
        }

        .calendar-day.fertile:not(.actual):not(.predicted) {
          background:
            linear-gradient(180deg, rgba(74,222,128,0.13), rgba(74,222,128,0.04)),
            rgba(255,255,255,0.03);
        }

        .calendar-day.ovulation {
          box-shadow: 0 0 0 1px rgba(74,222,128,0.26) inset;
        }

        .calendar-day.today::after {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,0.28);
          pointer-events: none;
        }

        .day-number {
          font-size: 14px;
          font-weight: 800;
        }

        .cycle-day {
          display: block;
          margin-top: 3px;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 700;
        }

        .day-markers {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 10px;
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
        }

        .side-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .day-detail {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .detail-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .detail-row strong {
          font-size: 14px;
        }

        .detail-note,
        .mood-box {
          padding: 13px;
          border-radius: 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .detail-note p {
          margin-top: 6px;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.6;
        }

        .mood-box {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .mood-box strong {
          display: block;
          margin-top: 2px;
        }

        .mood-mini {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .mood-mini span {
          padding: 5px 8px;
          border-radius: 999px;
          color: var(--text-secondary);
          background: rgba(255,255,255,0.045);
          font-size: 11px;
        }

        .privacy-card {
          display: flex;
          gap: 13px;
          align-items: flex-start;
          border-color: rgba(74,222,128,0.18);
        }

        .privacy-card svg {
          color: var(--botany);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .privacy-card h3,
        .symptoms-card h3 {
          margin: 0 0 6px;
          font-size: 16px;
        }

        .signal-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .signal-list div {
          padding: 12px;
          border-radius: 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .signal-list strong {
          display: block;
          margin-top: 5px;
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.5;
        }

        .history-ai-grid {
          grid-template-columns: minmax(0, 0.92fr) minmax(360px, 0.7fr);
          align-items: start;
          margin-top: 20px;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 11px;
        }

        .history-row {
          padding: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .history-date {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .history-date strong {
          font-size: 14px;
        }

        .history-meta {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 9px;
        }

        .history-meta span {
          padding: 5px 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 650;
        }

        .history-row p {
          margin-top: 9px;
          color: var(--text-secondary);
          font-size: 12.5px;
          line-height: 1.6;
        }

        .ai-button {
          width: 100%;
          justify-content: center;
          margin-bottom: 16px;
        }

        .ai-loading {
          display: grid;
          place-items: center;
          min-height: 72px;
        }

        .ai-output {
          white-space: pre-wrap;
          color: var(--text-primary);
          font-size: 14px;
          line-height: 1.8;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .model-line {
          margin-top: 14px;
          color: var(--text-muted);
          font-size: 11px;
        }

        .spin {
          animation: spinCycle 1s linear infinite;
        }

        @keyframes spinCycle {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1180px) {
          .prediction-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .calendar-layout,
          .history-ai-grid {
            grid-template-columns: 1fr;
          }

          .side-stack {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 860px) {
          .cycle-shell {
            padding: 26px 16px 88px;
          }

          .cycle-phase-card {
            grid-template-columns: 1fr;
          }

          .log-grid,
          .side-stack {
            grid-template-columns: 1fr;
          }

          .calendar-day {
            min-height: 74px;
            border-radius: 14px;
            padding: 8px;
          }

          .cycle-day {
            display: none;
          }
        }

        @media (max-width: 620px) {
          .prediction-grid {
            grid-template-columns: 1fr;
          }

          .calendar-card,
          .metric-card,
          .day-card,
          .privacy-card,
          .symptoms-card,
          .history-card,
          .ai-card,
          .log-panel {
            padding: 17px;
            border-radius: 21px;
          }

          .weekday-grid,
          .calendar-grid {
            gap: 5px;
          }

          .calendar-day {
            min-height: 58px;
            padding: 6px;
          }

          .day-markers {
            left: 6px;
            right: 6px;
            bottom: 6px;
          }

          .marker {
            width: 6px;
            height: 6px;
          }
        }
      `}</style>
    </div>
  );
}
