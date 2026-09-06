"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import styles from "./cycle.module.css";
import { readChatEvents } from "@/lib/chat-stream";
import { validCalendarDate, cycleWindowError } from "@/lib/cycle-validation";

type CyclePhase = "menstrual" | "follicular" | "ovulatory" | "luteal" | "late" | "unknown";
type CalendarDayKind = "logged-period" | "predicted-period" | "pms-window" | "fertile-window" | "ovulation-window" | "mood" | "today";

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
  pmsWindowStart: string | null;
  pmsWindowEnd: string | null;
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
    cycleDayInsight: string;
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
    study: "Your own energy and comfort matter more than an estimated phase. Adjust today’s plan to suit you.",
  },
  follicular: {
    label: "Follicular Phase",
    short: "Follicular",
    icon: Sun,
    color: "var(--gold)",
    bg: "hsla(38,72%,58%,0.10)",
    border: "hsla(38,72%,58%,0.26)",
    study: "Your own energy and comfort matter more than an estimated phase. Adjust today’s plan to suit you.",
  },
  ovulatory: {
    label: "Ovulatory Window",
    short: "Ovulatory",
    icon: Zap,
    color: "var(--botany)",
    bg: "hsla(142,60%,48%,0.10)",
    border: "hsla(142,60%,48%,0.26)",
    study: "Your own energy and comfort matter more than an estimated phase. Adjust today’s plan to suit you.",
  },
  luteal: {
    label: "Luteal Phase",
    short: "Luteal",
    icon: Wind,
    color: "var(--lotus-bright)",
    bg: "hsla(286,52%,68%,0.10)",
    border: "hsla(286,52%,68%,0.26)",
    study: "Your own energy and comfort matter more than an estimated phase. Adjust today’s plan to suit you.",
  },
  late: {
    label: "Late / Irregular Window",
    short: "Late",
    icon: Activity,
    color: "var(--warning)",
    bg: "hsla(42,90%,62%,0.10)",
    border: "hsla(42,90%,62%,0.26)",
    study: "Your own energy and comfort matter more than an estimated phase. Adjust today’s plan to suit you.",
  },
  unknown: {
    label: "Learning Phase",
    short: "Learning",
    icon: Heart,
    color: "var(--text-secondary)",
    bg: "var(--glass-ultra)",
    border: "var(--glass-border)",
    study: "Your own energy and comfort matter more than an estimated phase. Adjust today’s plan to suit you.",
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
  const mutationBusy = useRef(false);
  const requestId = useRef<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchCycle = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cycle", { cache: "no-store", signal: controller.signal });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Unable to load cycle intelligence");
      if (!Array.isArray(payload.logs) || !Array.isArray(payload.calendar)) throw new Error("The calendar could not be read. Please retry.");
      if (loadController.current === controller) setData(payload);
    } catch (err) {
      if (loadController.current === controller) setError(controller.signal.aborted ? "Loading took too long. Please retry." : String(err));
    } finally {
      window.clearTimeout(timeout);
      if (loadController.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCycle();
    return () => { loadController.current?.abort(); loadController.current = null; };
  }, [fetchCycle]);

  useEffect(() => {
    if (!validCalendarDate(logStart) || (logEnd && !validCalendarDate(logEnd))) return;
    setLogDayDetails((current) =>
      Array.from({ length: Math.max(current.length, getPeriodDayCount(logStart, logEnd)) }, (_, index) => {
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
    requestId.current = null;
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
    if (mutationBusy.current || (showLog && !window.confirm("Discard the open draft and start another log?"))) return;
    setNotice("");
    resetLogForm();
    setShowLog(true);
  };

  const openEditLog = (log: CycleLog) => {
    if (mutationBusy.current || (showLog && !window.confirm("Discard the open draft and edit this log?"))) return;
    requestId.current = null;
    setNotice("");
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
    if (mutationBusy.current) return;
    const invalid = cycleWindowError(logStart, logEnd || null);
    if (invalid) { setError(invalid); return; }
    mutationBusy.current = true;
    loadController.current?.abort();
    loadController.current = null;
    setLoading(false);
    requestId.current ??= crypto.randomUUID();
    setNotice("");
    setSaving(true);
    setError("");
    try {
      const method = editingLogId ? "PATCH" : "POST";
      const res = await fetch("/api/cycle", {
        method,
        signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingLogId ? { id: editingLogId } : {}),
          operationId: requestId.current,
          startDate: logStart,
          endDate: logEnd || null,
          flowLevel: logFlow,
          mood: logMood,
          symptoms: logSymptoms.join(", ") || null,
          notes: logNotes || null,
          dayDetails: logDayDetails.filter(detail => detail.day <= getPeriodDayCount(logStart, logEnd)).filter(hasPeriodDaySignal),
        }),
      });
      const payload = await res.json();
      if (res.status === 202) throw new Error("This log is not confirmed saved. Your draft is still here; reconnect and check the calendar before retrying.");
      if (!res.ok) throw new Error(payload.error || "Unable to sync cycle log");
      if (!payload.entry?.id || (editingLogId && payload.entry.id !== editingLogId) || payload.entry.startDate?.slice(0, 10) !== logStart) throw new Error("The save could not be confirmed. Your draft is still here. Refresh before retrying.");
      if (payload.intelligence?.logs && payload.intelligence?.calendar) setData(payload.intelligence);
      else void fetchCycle();
      setNotice("Period log saved." + (payload.warning ? " " + payload.warning : ""));
      setSelectedDate(logStart);
      setMonth(startOfMonth(parseISO(`${logStart}T12:00:00`)));
      setShowLog(false);
      setAdvice("");
      setAdviceModel("");
      resetLogForm();
    } catch (err) {
      setError(String(err));
    } finally {
      mutationBusy.current = false;
      setSaving(false);
    }
  };

  const deleteLog = async () => {
    if (!editingLogId || mutationBusy.current) return;
    const confirmed = window.confirm("Delete this period log permanently?");
    if (!confirmed) return;

    mutationBusy.current = true;
    loadController.current?.abort();
    loadController.current = null;
    setLoading(false);
    setNotice("");
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/cycle?id=${encodeURIComponent(editingLogId)}`, { method: "DELETE", signal: AbortSignal.timeout(30000) });
      const payload = await res.json();
      if (res.status === 202) throw new Error("Deletion is not confirmed. The log has been kept on screen; reconnect and refresh.");
      if (!res.ok) throw new Error(payload.error || "Unable to delete cycle log");
      if (payload.ok !== true || payload.deletedId !== editingLogId) throw new Error("Deletion could not be confirmed. Refresh to check this log.");
      if (payload.intelligence?.logs && payload.intelligence?.calendar) setData(payload.intelligence);
      else void fetchCycle();
      setNotice("Period log deleted." + (payload.warning ? " " + payload.warning : ""));
      setShowLog(false);
      setAdvice("");
      setAdviceModel("");
      resetLogForm();
    } catch (err) {
      setError(String(err));
    } finally {
      mutationBusy.current = false;
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
    pmsWindowStart: data.pmsWindowStart,
    pmsWindowEnd: data.pmsWindowEnd,
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

      if (!res.ok || res.status === 202 || !res.body) throw new Error("The study brief is unavailable. Your calendar has not changed.");
      let fullText = "";
      for await (const event of readChatEvents(res.body)) {
        if (event.text) fullText += event.text;
        if (event.model) setAdviceModel(event.model);
      }
      if (!fullText.trim()) throw new Error("No study brief was returned. Please try later.");
      setAdvice(clean(fullText));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingAdvice(false);
    }
  };

  return (
    <main className={`${styles.page} studio-page`} data-studio-native>

      <div className="cycle-shell">
        <header className="cycle-header">
          <div className="cycle-title-wrap">
            <SmoothLink href="/ai-insights" className="btn btn-ghost btn-sm cycle-back" direction="back" aria-label="Back to insights">
              <ChevronLeft size={16} />
            </SmoothLink>
            <div>
              <div className="cycle-kicker">
                <ShieldCheck size={14} />
                Your private calendar
              </div>
              <h1 className="cycle-title">Cycle Planner</h1>
              <p className="cycle-subtitle">
                A quiet place to log your cycle and notice your own patterns.
              </p>
            </div>
          </div>

          <div className="cycle-actions">
            <button className="btn btn-glass btn-sm" onClick={fetchCycle} disabled={loading || saving || deleting} type="button">
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNewLog} disabled={saving || deleting || !data} type="button">
              <Plus size={14} />
              Log Period
            </button>
          </div>
        </header>

        {error && <div className="cycle-error" role="alert">{error} <button className="btn btn-ghost btn-sm" onClick={() => void fetchCycle()} disabled={loading || saving || deleting}>Refresh calendar</button></div>}
        {notice && <p className="cycle-notice" role="status">{notice}</p>}

        {loading && !data ? (
          <div className="glass-card cycle-loading">
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <p>Loading your calendar...</p>
          </div>
        ) : data ? (
          <>
            {showLog && (
              <fieldset className="glass-card log-panel" disabled={saving || deleting}>
                <div className="panel-head">
                  <div>
                    <h2>{editingLogId ? "Edit Period Window" : "Log Period Window"}</h2>
                    <p>
                      {editingLogId
                        ? "Update start, end, flow, and each known day. Saved changes update the calendar estimates."
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
                    <small>{getPeriodDayCount(logStart, logEnd)} day fields · optional</small>
                  </div>

                  <div className="period-day-list">
                    {logDayDetails.filter(detail => detail.day <= getPeriodDayCount(logStart, logEnd)).map((detail) => (
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
                              updatePeriodDay(detail.day, { symptoms: [], notes: event.target.value || null });
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
                  <button className="btn btn-primary btn-sm" onClick={saveLog} disabled={saving || deleting} type="button">
                    {saving ? "Syncing..." : editingLogId ? "Save Changes" : "Save Private Log"}
                  </button>
                  {editingLogId && (
                    <button className="btn btn-ghost btn-sm danger-action" onClick={deleteLog} disabled={deleting || saving} type="button">
                      <Trash2 size={14} />
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm("Discard this unsaved draft?")) { setShowLog(false); resetLogForm(); } }} disabled={saving || deleting} type="button">Discard draft</button>
                </div>
              </fieldset>
            )}

            <section className="calendar-layout">
              <div className="glass-card calendar-card">
                <div className="calendar-head">
                  <button className="icon-btn" onClick={() => setMonth((value) => subMonths(value, 1))} type="button" aria-label="Previous month">
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <h2>{format(month, "MMMM yyyy")}</h2>
                    <p>Select a day to see its log. Dashed marks are estimates.</p>
                  </div>
                  <button className="icon-btn" onClick={() => setMonth((value) => addMonths(value, 1))} type="button" aria-label="Next month">
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="legend-row">
                  <span><i className="legend actual" />Logged period</span>
                  <span><i className="legend predicted" />Estimated period</span>
                  <span><i className="legend pms" />Estimated PMS</span>
                  <span><i className="legend fertile" />Estimated fertility</span>
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
                        aria-label={`${format(date, "d MMMM yyyy")}${hasKind(day, "logged-period") ? ", logged period" : ""}${hasKind(day, "predicted-period") ? ", estimated period" : ""}`}
                        aria-pressed={selected}
                        aria-current={hasKind(day, "today") ? "date" : undefined}
                        key={key}
                        className={[
                          "calendar-day",
                          !isSameMonth(date, month) ? "muted" : "",
                          selected ? "selected" : "",
                          hasKind(day, "today") ? "today" : "",
                          hasKind(day, "logged-period") ? "actual" : "",
                          hasKind(day, "predicted-period") ? "predicted" : "",
                          hasKind(day, "pms-window") ? "pms" : "",
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
                          {hasKind(day, "pms-window") && <i className="marker pms" />}
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
                        <span>Estimated phase</span>
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
                    <p>Cycle details are available only inside your signed-in account.</p>
                  </div>
                </div>

              </aside>
            </section>

            <details className="cycle-insights"><summary>Patterns & estimates <span>Based on your saved logs</span></summary>
              <p className="estimate-note">Calendar estimates are not a diagnosis or a measure of study ability. Use how you feel today to choose your workload. Estimated fertility windows are not suitable for contraception.</p>
            <section className="cycle-hero">
              <div className="cycle-phase-card" style={{ "--phase": phase.color, "--phase-bg": phase.bg, "--phase-border": phase.border } as React.CSSProperties}>
                <div className="phase-icon">
                  <PhaseIcon size={28} />
                </div>
                <div className="phase-main">
                  <div className="phase-label">Estimated phase</div>
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
                    <span>Model score · not probability</span>
                  </div>
                  <strong>{data.confidence}/100</strong>
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


              <div className="cycle-patterns">
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
                  <p className="signal-insight">{data.studySignals.cycleDayInsight}</p>
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
              </div>
            </details>
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
                    <span>Optional online brief</span>
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

                <button className="btn btn-primary btn-lg ai-button" onClick={() => { if (window.confirm("Send your cycle summary, symptoms and recent logs to the configured online AI service for a study brief?")) void getAIAdvice(); }} disabled={loadingAdvice} type="button">
                  {loadingAdvice ? <><RefreshCw size={16} className="spin" /> Building private brief...</> : <><Sparkles size={16} /> Request study brief</>}
                </button>

                {!advice && !loadingAdvice && (
                  <div className="ai-empty">
                    <div className="ai-empty-icon">
                      <Lock size={18} />
                    </div>
                    <div>
                      <h3>No brief generated yet</h3>
                      <p>This optional feature sends cycle details and recent logs to the configured online AI service. Continue only if you want to share this information.</p>
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

    </main>
  );
}
