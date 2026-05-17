"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addDays,
  differenceInCalendarDays,
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
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trash2,
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
  periodDayDetail?: PeriodDayDetail | null;
  cycleEntryId?: string | null;
  mood?: {
    mood: string;
    energy: number;
    focus: number;
    stress: number;
    note: string | null;
  } | null;
}

interface PeriodDayDetail {
  day: number;
  date: string | null;
  flowLevel: string | null;
  pain: number | null;
  energy: number | null;
  mood: string | null;
  symptoms: string[];
  notes: string | null;
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
  dayDetails: PeriodDayDetail[];
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
    periodDayDetailCount: number;
    ignoredOutliers: number[];
    recentTrendDays: number;
    accuracyMeanErrorDays: number | null;
    dataNeeded: string[];
    method: string;
    privacy: string;
  };
  predictionQuality: {
    averageMissDays: number | null;
    backtestedCycles: number;
    ignoredOutliers: number[];
    recentTrendDays: number;
    modelBlend: string;
  };
  healthSignals: {
    cycleRegularity: "learning" | "regular" | "variable" | "irregular";
    periodLengthPattern: string;
    flowPattern: string;
    symptomBurden: "learning" | "low" | "moderate" | "high";
    averagePain: number | null;
    heavyFlowDaysAverage: number | null;
    detailDaysLogged: number;
    redFlags: string[];
    insight: string;
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
const PERIOD_DAY_LIMIT = 10;

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

function compactDate(value: string | null) {
  if (!value) return "";
  return format(parseISO(`${value}T12:00:00`), "d MMM");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPeriodDayCount(start: string, end: string, today = format(new Date(), "yyyy-MM-dd")) {
  if (!start) return 1;
  const startDate = parseISO(`${start}T12:00:00`);
  const fallbackEnd = parseISO(`${today}T12:00:00`) < startDate ? start : today;
  const endDate = parseISO(`${end || fallbackEnd}T12:00:00`);
  const days = differenceInCalendarDays(endDate, startDate) + 1;
  return clampNumber(Number.isFinite(days) ? days : 5, 1, PERIOD_DAY_LIMIT);
}

function createPeriodDayDetail(day: number, start: string): PeriodDayDetail {
  const date = start ? format(addDays(parseISO(`${start}T12:00:00`), day - 1), "yyyy-MM-dd") : null;
  return {
    day,
    date,
    flowLevel: null,
    pain: null,
    energy: null,
    mood: null,
    symptoms: [],
    notes: null,
  };
}

function hasPeriodDaySignal(detail: PeriodDayDetail) {
  return Boolean(detail.flowLevel || detail.pain !== null || detail.energy !== null || detail.mood || detail.symptoms.length || detail.notes?.trim());
}

function splitCsv(value: string | null) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
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

function parseAdviceSections(text: string) {
  if (!text.trim()) return [];

  const sectionNames = ["Body Signal", "Study Strategy", "Today Plan", "Safety Note"];
  const escaped = sectionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.\\s*)?(${escaped})\\s*:?\\s*`, "gi");
  const matches = [...text.matchAll(pattern)];

  if (!matches.length) {
    return [{ title: "Cycle-Aware Plan", body: text.trim() }];
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      title: match[1],
      body: text.slice(start, end).trim(),
    };
  }).filter((section) => section.body);
}

function getAdviceMeta(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("body")) return { icon: Heart, color: "var(--rose-bright)" };
  if (normalized.includes("strategy")) return { icon: Brain, color: "var(--physics)" };
  if (normalized.includes("plan")) return { icon: Target, color: "var(--gold)" };
  if (normalized.includes("safety")) return { icon: ShieldCheck, color: "var(--botany)" };
  return { icon: Sparkles, color: "var(--lotus-bright)" };
}

export default function CyclePlannerPage() {
  const [data, setData] = useState<CycleIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
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
  const [logDayDetails, setLogDayDetails] = useState<PeriodDayDetail[]>(() =>
    Array.from({ length: 1 }, (_, index) => createPeriodDayDetail(index + 1, format(new Date(), "yyyy-MM-dd")))
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    setLogDayDetails((current) =>
      Array.from({ length: getPeriodDayCount(logStart, logEnd) }, (_, index) => {
        const day = index + 1;
        const previous = current.find((detail) => detail.day === day);
        return {
          ...createPeriodDayDetail(day, logStart),
          ...previous,
          day,
          date: logStart ? format(addDays(parseISO(`${logStart}T12:00:00`), index), "yyyy-MM-dd") : null,
        };
      })
    );
  }, [logStart, logEnd]);

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
  const adviceSections = useMemo(() => parseAdviceSections(advice), [advice]);

  const predictionLine = data?.predictedStart
    ? data.status === "overdue"
      ? `Expected around ${displayDate(data.predictedStart)}. Window passed ${data.overdueDays} day${data.overdueDays === 1 ? "" : "s"} ago.`
      : `${displayDate(data.predictedStart)} with window ${displayDate(data.predictedWindowStart)} to ${displayDate(data.predictedWindowEnd)}`
    : "Log cycle starts to unlock prediction.";

  const resetLogForm = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    setEditingLogId(null);
    setLogStart(today);
    setLogEnd("");
    setLogFlow("MODERATE");
    setLogMood("NORMAL");
    setLogSymptoms([]);
    setLogNotes("");
    setLogDayDetails(Array.from({ length: 1 }, (_, index) => createPeriodDayDetail(index + 1, today)));
  };

  const openNewLog = () => {
    resetLogForm();
    setShowLog(true);
  };

  const openEditLog = (log: CycleLog) => {
    const baseCount = getPeriodDayCount(log.startDate, log.endDate || "");
    const detailCount = log.dayDetails.reduce((max, detail) => Math.max(max, detail.day), 0);
    const count = clampNumber(Math.max(baseCount, detailCount, 1), 1, PERIOD_DAY_LIMIT);

    setEditingLogId(log.id);
    setLogStart(log.startDate);
    setLogEnd(log.endDate || "");
    setLogFlow(log.flowLevel || "MODERATE");
    setLogMood(log.mood || "NORMAL");
    setLogSymptoms(splitCsv(log.symptoms));
    setLogNotes(log.notes || "");
    setLogDayDetails(
      Array.from({ length: count }, (_, index) => {
        const day = index + 1;
        const existing = log.dayDetails.find((detail) => detail.day === day);
        return {
          ...createPeriodDayDetail(day, log.startDate),
          ...existing,
          day,
          date: format(addDays(parseISO(`${log.startDate}T12:00:00`), index), "yyyy-MM-dd"),
        };
      })
    );
    setShowLog(true);
  };

  const editSelectedPeriod = () => {
    if (!selectedDay?.cycleEntryId || !data) return;
    const log = data.logs.find((item) => item.id === selectedDay.cycleEntryId);
    if (log) openEditLog(log);
  };

  const updatePeriodDay = (day: number, patch: Partial<PeriodDayDetail>) => {
    setLogDayDetails((current) =>
      current.map((detail) => detail.day === day ? { ...detail, ...patch } : detail)
    );
  };

  const saveLog = async () => {
    setSaving(true);
    setError("");
    try {
      const method = editingLogId ? "PATCH" : "POST";
      const res = await fetch("/api/cycle", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingLogId ? { id: editingLogId } : {}),
          startDate: logStart,
          endDate: logEnd || null,
          flowLevel: logFlow,
          mood: logMood,
          symptoms: logSymptoms.join(", ") || null,
          notes: logNotes || null,
          dayDetails: logDayDetails.filter(hasPeriodDaySignal),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Unable to sync cycle log");
      setData(payload.intelligence);
      setSelectedDate(logStart);
      setMonth(startOfMonth(parseISO(`${logStart}T12:00:00`)));
      setShowLog(false);
      setAdvice("");
      setAdviceModel("");
      resetLogForm();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async () => {
    if (!editingLogId) return;
    const confirmed = window.confirm("Delete this period log permanently?");
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/cycle?id=${encodeURIComponent(editingLogId)}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Unable to delete cycle log");
      setData(payload.intelligence);
      setShowLog(false);
      setAdvice("");
      setAdviceModel("");
      resetLogForm();
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleting(false);
    }
  };

  const getAIAdvice = async () => {
    if (!data) return;
    setLoadingAdvice(true);
    setAdvice("");
    setAdviceModel("");
    setError("");

    const prompt = `Use this private cycle intelligence JSON to create a NEET study plan for today. Align the advice with the prediction evidence, period-day details, health signals, and confidence. Do not diagnose medical conditions or prescribe treatment. Do not claim exact ovulation. Be practical, direct, and specific; mention clinician support when red-flag symptoms are severe, new, or disruptive.

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
    predictionQuality: data.predictionQuality,
    healthSignals: data.healthSignals,
    evidence: data.evidence,
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
            <button className="btn btn-primary btn-sm" onClick={openNewLog} type="button">
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

            <section className="intelligence-strip">
              <article className="glass-card intel-card">
                <div className="intel-top">
                  <TrendingUp size={16} />
                  <span>Prediction Quality</span>
                </div>
                <strong>{data.predictionQuality.averageMissDays === null ? "Learning" : `+/- ${data.predictionQuality.averageMissDays} days`}</strong>
                <p>
                  {data.predictionQuality.backtestedCycles
                    ? `Backtested on ${data.predictionQuality.backtestedCycles} previous cycle${data.predictionQuality.backtestedCycles === 1 ? "" : "s"}.`
                    : "More completed cycles will unlock measured accuracy."}
                  {data.predictionQuality.ignoredOutliers.length ? ` Ignored outlier lengths: ${data.predictionQuality.ignoredOutliers.join(", ")}.` : ""}
                </p>
              </article>

              <article className="glass-card intel-card">
                <div className="intel-top">
                  <Heart size={16} />
                  <span>Period Health Pattern</span>
                </div>
                <strong>{data.healthSignals.cycleRegularity}</strong>
                <p>{data.healthSignals.periodLengthPattern}. {data.healthSignals.flowPattern}.</p>
              </article>

              <article className="glass-card intel-card">
                <div className="intel-top">
                  <Activity size={16} />
                  <span>Day Details</span>
                </div>
                <strong>{data.healthSignals.detailDaysLogged} days logged</strong>
                <p>
                  Pain {data.healthSignals.averagePain ?? "?"}/10, symptom burden {data.healthSignals.symptomBurden}.
                  {data.evidence.dataNeeded[0] ? ` Next: ${data.evidence.dataNeeded[0]}` : " The model has enough detail for richer analysis."}
                </p>
              </article>
            </section>

            {showLog && (
              <section className="glass-card log-panel">
                <div className="panel-head">
                  <div>
                    <h2>{editingLogId ? "Edit Period Window" : "Log Period Window"}</h2>
                    <p>
                      {editingLogId
                        ? "Update start, end, flow, and each known day. Saving immediately retrains the prediction."
                        : "Start with today's known detail. Add later days when they actually happen."}
                    </p>
                  </div>
                  {editingLogId ? <Pencil size={17} /> : <Lock size={17} />}
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

                <div className="period-days-wrap">
                  <div className="period-days-head">
                    <div>
                      <span>Optional day-by-day period detail</span>
                      <p>Only known days are shown for active periods. Set the end date later to close the window or edit older logs fully.</p>
                    </div>
                    <small>{logEnd ? `${logDayDetails.length} day period` : `${logDayDetails.length} known day${logDayDetails.length === 1 ? "" : "s"}`}</small>
                  </div>

                  <div className="period-day-list">
                    {logDayDetails.map((detail) => (
                      <div key={detail.day} className="period-day-row">
                        <div className="period-day-title">
                          <strong>Day {detail.day}</strong>
                          <span>{compactDate(detail.date)}</span>
                        </div>

                        <label>
                          <span>Flow</span>
                          <select className="input select" value={detail.flowLevel ?? ""} onChange={(event) => updatePeriodDay(detail.day, { flowLevel: event.target.value || null })}>
                            <option value="">Skip</option>
                            {FLOW_LEVELS.map((flow) => <option key={flow}>{flow}</option>)}
                          </select>
                        </label>

                        <label>
                          <span>Pain</span>
                          <select className="input select" value={detail.pain ?? ""} onChange={(event) => updatePeriodDay(detail.day, { pain: event.target.value ? Number(event.target.value) : null })}>
                            <option value="">Skip</option>
                            {Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value}/10</option>)}
                          </select>
                        </label>

                        <label>
                          <span>Energy</span>
                          <select className="input select" value={detail.energy ?? ""} onChange={(event) => updatePeriodDay(detail.day, { energy: event.target.value ? Number(event.target.value) : null })}>
                            <option value="">Skip</option>
                            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}/10</option>)}
                          </select>
                        </label>

                        <label>
                          <span>Mood</span>
                          <select className="input select" value={detail.mood ?? ""} onChange={(event) => updatePeriodDay(detail.day, { mood: event.target.value || null })}>
                            <option value="">Skip</option>
                            {CYCLE_MOODS.map((mood) => <option key={mood}>{mood}</option>)}
                          </select>
                        </label>

                        <label className="period-day-notes">
                          <span>Symptoms / notes</span>
                          <input
                            className="input"
                            value={[...detail.symptoms, detail.notes].filter(Boolean).join(", ")}
                            onChange={(event) => {
                              const parts = event.target.value.split(",").map((item) => item.trim()).filter(Boolean);
                              updatePeriodDay(detail.day, { symptoms: parts.slice(0, 6), notes: parts.length > 6 ? parts.slice(6).join(", ") : null });
                            }}
                            placeholder="cramps, fatigue..."
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="notes-label">
                  <span>Notes</span>
                  <textarea className="input" value={logNotes} onChange={(event) => setLogNotes(event.target.value)} placeholder="Pain, sleep, cravings, study impact, medicines, or anything worth remembering." />
                </label>

                <div className="log-actions">
                  <button className="btn btn-primary btn-sm" onClick={saveLog} disabled={saving} type="button">
                    {saving ? "Syncing..." : editingLogId ? "Save Changes" : "Save Private Log"}
                  </button>
                  {editingLogId && (
                    <button className="btn btn-ghost btn-sm danger-action" onClick={deleteLog} disabled={deleting || saving} type="button">
                      <Trash2 size={14} />
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowLog(false); resetLogForm(); }} type="button">Cancel</button>
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
                      {selectedDay.periodDayDetail && (
                        <>
                          <div className="detail-row">
                            <span>Period Day Detail</span>
                            <strong>Day {selectedDay.periodDayDetail.day}</strong>
                          </div>
                          {(selectedDay.periodDayDetail.pain !== null || selectedDay.periodDayDetail.energy !== null) && (
                            <div className="mood-mini">
                              {selectedDay.periodDayDetail.pain !== null && <span>Pain {selectedDay.periodDayDetail.pain}/10</span>}
                              {selectedDay.periodDayDetail.energy !== null && <span>Energy {selectedDay.periodDayDetail.energy}/10</span>}
                            </div>
                          )}
                        </>
                      )}
                      {selectedDay.symptoms && (
                        <div className="detail-note">
                          <span>Symptoms</span>
                          <p>{[selectedDay.symptoms, selectedDay.periodDayDetail?.notes].filter(Boolean).join(" | ")}</p>
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
                      {selectedDay.cycleEntryId && (
                        <button className="btn btn-glass btn-sm edit-period-btn" onClick={editSelectedPeriod} type="button">
                          <Pencil size={14} />
                          Edit This Period
                        </button>
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

                <div className="glass-card health-card">
                  <h3>Wellness Signals</h3>
                  <p>{data.healthSignals.insight}</p>
                  {data.healthSignals.redFlags.length > 0 && (
                    <div className="red-flag-list">
                      {data.healthSignals.redFlags.slice(0, 3).map((flag) => <span key={flag}>{flag}</span>)}
                    </div>
                  )}
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
                        <div>
                          <strong>{displayDate(log.startDate)}</strong>
                          <span>{log.endDate ? `Ended ${displayDate(log.endDate)}` : "End date not logged"}</span>
                        </div>
                        <button className="icon-btn history-edit-btn" onClick={() => openEditLog(log)} type="button" aria-label={`Edit period starting ${displayDate(log.startDate)}`}>
                          <Pencil size={15} />
                        </button>
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
                      {log.dayDetails.length > 0 && (
                        <div className="day-detail-pills">
                          {log.dayDetails.slice(0, 5).map((detail) => (
                            <span key={detail.day}>
                              D{detail.day}
                              {detail.flowLevel ? ` ${detail.flowLevel}` : ""}
                              {detail.pain !== null ? ` pain ${detail.pain}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card ai-card">
                <div className="ai-card-glow" />
                <div className="ai-panel-top">
                  <div className="ai-mark">
                    <Sparkles size={20} />
                  </div>
                  <div className="ai-heading">
                    <span>Private AI Brief</span>
                    <h2>Study Adjustment</h2>
                    <p>Turns cycle prediction, phase, mood, and tracker context into today&apos;s workload decision.</p>
                  </div>
                </div>

                <div className="ai-context-strip">
                  <div>
                    <span>Phase</span>
                    <strong>{PHASE_META[data.currentPhase].short}</strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>{data.confidence}%</strong>
                  </div>
                  <div>
                    <span>Mode</span>
                    <strong>{TONE_COPY[data.studySignals.recommendationTone]}</strong>
                  </div>
                </div>

                <button className="btn btn-primary btn-lg ai-button" onClick={getAIAdvice} disabled={loadingAdvice} type="button">
                  {loadingAdvice ? <><RefreshCw size={16} className="spin" /> Building private brief...</> : <><Sparkles size={16} /> Generate Clean Study Brief</>}
                </button>

                {!advice && !loadingAdvice && (
                  <div className="ai-empty">
                    <div className="ai-empty-icon">
                      <Lock size={18} />
                    </div>
                    <div>
                      <h3>No brief generated yet</h3>
                      <p>Generate once after logging period/mood data. The AI receives only the private prediction summary, not the raw calendar UI.</p>
                    </div>
                  </div>
                )}

                {loadingAdvice && (
                  <div className="ai-loading">
                    <div className="ai-loading-orbit">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <div className="typing-indicator">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                      <p>Reading phase, confidence, energy signals, and NEET context...</p>
                    </div>
                  </div>
                )}

                {adviceSections.length > 0 && !loadingAdvice && (
                  <div className="ai-brief">
                    {adviceSections.map((section) => {
                      const meta = getAdviceMeta(section.title);
                      const Icon = meta.icon;

                      return (
                        <article key={section.title} className="ai-brief-section" style={{ "--brief-color": meta.color } as React.CSSProperties}>
                          <div className="ai-brief-icon">
                            <Icon size={16} />
                          </div>
                          <div>
                            <h3>{section.title}</h3>
                            <p>{section.body}</p>
                          </div>
                        </article>
                      );
                    })}

                    <div className="ai-footnote">
                      <ShieldCheck size={13} />
                      <span>{adviceModel ? `Generated by ${adviceModel.split("/").pop()}` : "Private cycle-aware guidance"}</span>
                    </div>
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

        .intelligence-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 20px;
        }

        .intel-card {
          padding: 18px;
          border-radius: 22px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)),
            rgba(14, 14, 18, 0.66);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .intel-top {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .intel-card strong {
          display: block;
          color: var(--text-primary);
          font-size: 20px;
          text-transform: capitalize;
          margin-bottom: 7px;
        }

        .intel-card p {
          color: var(--text-secondary);
          font-size: 12.5px;
          line-height: 1.62;
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
        .period-days-wrap,
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

        .period-days-wrap {
          padding: 15px;
          border-radius: 20px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .period-days-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 13px;
        }

        .period-days-head span,
        .period-day-row label span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .period-days-head p {
          margin-top: 6px;
          color: var(--text-secondary);
          font-size: 12.5px;
          line-height: 1.55;
        }

        .period-days-head small {
          flex-shrink: 0;
          padding: 6px 9px;
          border-radius: 999px;
          color: var(--rose-bright);
          background: rgba(232,114,138,0.10);
          border: 1px solid rgba(232,114,138,0.18);
          font-size: 11px;
          font-weight: 750;
        }

        .period-day-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .period-day-row {
          display: grid;
          grid-template-columns: 92px repeat(4, minmax(86px, 0.7fr)) minmax(160px, 1.3fr);
          gap: 10px;
          align-items: end;
          padding: 12px;
          border-radius: 17px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .period-day-title strong {
          display: block;
          color: var(--text-primary);
          font-size: 13px;
          margin-bottom: 4px;
        }

        .period-day-title span {
          color: var(--text-muted);
          font-size: 11px;
        }

        .period-day-row label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .log-actions {
          gap: 9px;
          margin-top: 16px;
          flex-wrap: wrap;
        }

        .danger-action {
          color: var(--danger);
          border-color: hsla(0,72%,62%,0.24);
          background: hsla(0,72%,62%,0.08);
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

        .edit-period-btn {
          justify-content: center;
          width: 100%;
          margin-top: 2px;
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

        .health-card h3 {
          margin: 0 0 8px;
          font-size: 16px;
        }

        .health-card p {
          color: var(--text-secondary);
          font-size: 12.8px;
          line-height: 1.62;
        }

        .red-flag-list,
        .day-detail-pills {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .red-flag-list span {
          padding: 6px 8px;
          border-radius: 999px;
          color: var(--warning);
          background: hsla(42,90%,62%,0.10);
          border: 1px solid hsla(42,90%,62%,0.18);
          font-size: 11px;
          line-height: 1.35;
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

        .history-date > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .history-edit-btn {
          width: 34px;
          height: 34px;
          border-radius: 12px;
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

        .day-detail-pills span {
          padding: 5px 8px;
          border-radius: 999px;
          color: var(--rose-bright);
          background: rgba(232,114,138,0.09);
          border: 1px solid rgba(232,114,138,0.16);
          font-size: 11px;
          font-weight: 700;
        }

        .ai-card {
          position: relative;
          overflow: hidden;
          border-color: rgba(212, 168, 83, 0.14);
          background:
            radial-gradient(circle at 0% 0%, rgba(212, 168, 83, 0.12), transparent 32%),
            radial-gradient(circle at 100% 0%, rgba(232, 114, 138, 0.1), transparent 30%),
            linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.03)),
            rgba(14, 14, 18, 0.76);
        }

        .ai-card-glow {
          position: absolute;
          width: 220px;
          height: 220px;
          right: -95px;
          top: -95px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(212, 168, 83, 0.16), transparent 66%);
          filter: blur(16px);
          pointer-events: none;
        }

        .ai-panel-top {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          margin-bottom: 16px;
        }

        .ai-mark,
        .ai-empty-icon,
        .ai-loading-orbit,
        .ai-brief-icon {
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .ai-mark {
          width: 46px;
          height: 46px;
          border-radius: 16px;
          color: var(--gold);
          background:
            radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 34%),
            rgba(212, 168, 83, 0.12);
          border: 1px solid rgba(212, 168, 83, 0.22);
          box-shadow: 0 12px 26px rgba(0,0,0,0.18);
        }

        .ai-heading span {
          display: inline-flex;
          align-items: center;
          margin-bottom: 5px;
          color: rgba(255, 214, 138, 0.86);
          font-size: 10.5px;
          font-weight: 850;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .ai-heading h2 {
          margin: 0;
          font-size: 24px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }

        .ai-heading p {
          margin-top: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.62;
        }

        .ai-context-strip {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 14px;
        }

        .ai-context-strip div {
          min-width: 0;
          padding: 11px 12px;
          border-radius: 15px;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .ai-context-strip span {
          display: block;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .ai-context-strip strong {
          display: block;
          overflow-wrap: anywhere;
          color: var(--text-primary);
          font-size: 12.5px;
          line-height: 1.25;
        }

        .ai-button {
          position: relative;
          z-index: 1;
          width: 100%;
          justify-content: center;
          margin-bottom: 16px;
          min-height: 48px;
          border-radius: 16px;
        }

        .ai-empty,
        .ai-loading {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 13px;
          align-items: center;
          padding: 16px;
          min-height: 94px;
          border-radius: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .ai-empty-icon,
        .ai-loading-orbit {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          color: var(--gold);
          background: rgba(212, 168, 83, 0.1);
          border: 1px solid rgba(212, 168, 83, 0.18);
        }

        .ai-loading-orbit {
          animation: aiPulse 1.6s ease-in-out infinite;
        }

        .ai-empty h3 {
          margin: 0 0 4px;
          font-size: 14px;
          color: var(--text-primary);
        }

        .ai-empty p,
        .ai-loading p {
          margin: 7px 0 0;
          color: var(--text-secondary);
          font-size: 12.5px;
          line-height: 1.55;
        }

        .ai-brief {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .ai-brief-section {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 12px;
          padding: 15px;
          border-radius: 18px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--brief-color) 7%, transparent), rgba(255,255,255,0.035)),
            rgba(255,255,255,0.03);
          border: 1px solid color-mix(in srgb, var(--brief-color) 20%, rgba(255,255,255,0.07));
        }

        .ai-brief-icon {
          width: 32px;
          height: 32px;
          border-radius: 12px;
          color: var(--brief-color);
          background: color-mix(in srgb, var(--brief-color) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--brief-color) 22%, transparent);
        }

        .ai-brief-section h3 {
          margin: 1px 0 7px;
          color: var(--brief-color);
          font-size: 13.5px;
          line-height: 1.2;
          letter-spacing: -0.01em;
        }

        .ai-brief-section p {
          margin: 0;
          white-space: pre-wrap;
          color: rgba(255,255,255,0.75);
          font-size: 13.2px;
          line-height: 1.72;
        }

        .ai-footnote {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          align-self: flex-start;
          margin-top: 2px;
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          color: var(--text-muted);
          font-size: 11px;
        }

        @keyframes aiPulse {
          0%, 100% { transform: scale(1); box-shadow: none; }
          50% { transform: scale(1.04); box-shadow: 0 0 24px rgba(212,168,83,0.16); }
        }

        .spin {
          animation: spinCycle 1s linear infinite;
        }

        @keyframes spinCycle {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 1180px) {
          .prediction-grid,
          .intelligence-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .calendar-layout,
          .history-ai-grid {
            grid-template-columns: 1fr;
          }

          .side-stack {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .period-day-row {
            grid-template-columns: 88px repeat(2, minmax(120px, 1fr));
          }

          .period-day-notes {
            grid-column: 2 / -1;
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

          .period-day-row {
            grid-template-columns: 1fr 1fr;
          }

          .period-day-title,
          .period-day-notes {
            grid-column: 1 / -1;
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
          .prediction-grid,
          .intelligence-strip {
            grid-template-columns: 1fr;
          }

          .ai-context-strip {
            grid-template-columns: 1fr;
          }

          .ai-panel-top,
          .ai-empty,
          .ai-loading,
          .ai-brief-section {
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

        /* ─── LIGHT MODE ─── */
        :global(html[data-theme="light"]) .cycle-page {
          color: hsl(32, 28%, 13%);
          background:
            radial-gradient(circle at 14% 4%, rgba(184, 130, 52, 0.08), transparent 24%),
            radial-gradient(circle at 92% 8%, rgba(60, 120, 210, 0.07), transparent 22%),
            radial-gradient(circle at 42% 110%, rgba(232, 114, 138, 0.08), transparent 28%),
            linear-gradient(180deg, #fbf5ec 0%, #f7eedc 100%);
        }

        :global(html[data-theme="light"]) .cycle-bg {
          opacity: 0.14;
          background-image:
            linear-gradient(rgba(70,45,24,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(70,45,24,0.08) 1px, transparent 1px);
        }

        :global(html[data-theme="light"]) .cycle-title,
        :global(html[data-theme="light"]) .panel-head h2,
        :global(html[data-theme="light"]) .day-title,
        :global(html[data-theme="light"]) .ai-title {
          color: hsl(32, 28%, 12%);
        }

        :global(html[data-theme="light"]) .cycle-kicker {
          color: hsl(38, 70%, 36%);
          background: rgba(184, 130, 52, 0.08);
          border-color: rgba(184, 130, 52, 0.18);
        }

        :global(html[data-theme="light"]) .cycle-subtitle {
          color: hsla(31, 22%, 28%, 0.62);
        }

        :global(html[data-theme="light"]) .cycle-phase-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.18)),
            var(--phase-bg);
          box-shadow: 0 20px 56px rgba(0,0,0,0.09);
        }

        :global(html[data-theme="light"]) .metric-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.88));
          border-color: rgba(70,45,24,0.10);
          box-shadow: 0 8px 28px rgba(0,0,0,0.06);
        }

        :global(html[data-theme="light"]) .intel-card,
        :global(html[data-theme="light"]) .period-days-wrap,
        :global(html[data-theme="light"]) .period-day-row {
          background: rgba(255,255,255,0.82);
          border-color: rgba(70,45,24,0.09);
        }

        :global(html[data-theme="light"]) .metric-top {
          color: hsla(31, 22%, 28%, 0.52);
        }

        :global(html[data-theme="light"]) .metric-card strong {
          color: hsl(32, 28%, 13%);
        }

        :global(html[data-theme="light"]) .confidence-bar {
          background: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .icon-btn {
          background: rgba(70,45,24,0.05);
          border-color: rgba(70,45,24,0.10);
        }

        :global(html[data-theme="light"]) .symptom-chip {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.09);
        }

        :global(html[data-theme="light"]) .symptom-chip.active {
          background: rgba(232,114,138,0.10);
          border-color: rgba(232,114,138,0.32);
        }

        :global(html[data-theme="light"]) .calendar-day {
          background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.78));
          border-color: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .calendar-day:hover,
        :global(html[data-theme="light"]) .calendar-day.selected {
          box-shadow: 0 8px 20px rgba(0,0,0,0.07);
        }

        :global(html[data-theme="light"]) .calendar-day.actual {
          background: linear-gradient(180deg, rgba(232,114,138,0.18), rgba(232,114,138,0.06));
          border-color: rgba(232,114,138,0.28);
        }

        :global(html[data-theme="light"]) .calendar-day.predicted:not(.actual) {
          background: linear-gradient(180deg, rgba(212,168,83,0.15), rgba(212,168,83,0.04));
          border-color: rgba(212,168,83,0.22);
        }

        :global(html[data-theme="light"]) .calendar-day.fertile:not(.actual):not(.predicted) {
          background: linear-gradient(180deg, rgba(74,222,128,0.11), rgba(74,222,128,0.03));
        }

        :global(html[data-theme="light"]) .calendar-day.today::after {
          border-color: rgba(70,45,24,0.22);
        }

        :global(html[data-theme="light"]) .detail-row {
          border-bottom-color: rgba(70,45,24,0.07);
        }

        :global(html[data-theme="light"]) .detail-note,
        :global(html[data-theme="light"]) .mood-box {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .mood-mini span {
          background: rgba(70,45,24,0.05);
        }

        :global(html[data-theme="light"]) .signal-list div {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .health-card p {
          color: hsla(31, 22%, 18%, 0.72);
        }

        :global(html[data-theme="light"]) .history-row {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .history-meta span {
          background: rgba(70,45,24,0.06);
        }

        :global(html[data-theme="light"]) .ai-card {
          border-color: rgba(212,168,83,0.18);
          background:
            radial-gradient(circle at 0% 0%, rgba(212,168,83,0.08), transparent 32%),
            radial-gradient(circle at 100% 0%, rgba(232,114,138,0.06), transparent 30%),
            rgba(255,255,255,0.92);
        }

        :global(html[data-theme="light"]) .ai-mark {
          background:
            radial-gradient(circle at 30% 20%, rgba(255,255,255,0.6), transparent 34%),
            rgba(212,168,83,0.10);
          box-shadow: 0 6px 16px rgba(0,0,0,0.06);
        }

        :global(html[data-theme="light"]) .ai-heading span {
          color: hsl(38, 58%, 36%);
        }

        :global(html[data-theme="light"]) .ai-context-strip div {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .ai-empty,
        :global(html[data-theme="light"]) .ai-loading {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.08);
        }

        :global(html[data-theme="light"]) .ai-brief-section {
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--brief-color) 5%, transparent), rgba(255,255,255,0.55)),
            rgba(255,255,255,0.48);
          border-color: color-mix(in srgb, var(--brief-color) 18%, rgba(70,45,24,0.08));
        }

        :global(html[data-theme="light"]) .ai-brief-section p {
          color: hsla(31, 22%, 18%, 0.78);
        }

        :global(html[data-theme="light"]) .ai-footnote {
          background: rgba(70,45,24,0.04);
          border-color: rgba(70,45,24,0.08);
        }
      `}</style>
    </div>
  );
}
