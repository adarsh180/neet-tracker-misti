"use client";

import { type CSSProperties, useEffect, useMemo, useState, useCallback } from "react";
import { format, addDays, subDays as dateFnsSubDays, differenceInCalendarDays } from "date-fns";
import {
  Clock,
  BookOpen,
  Save,
  Flame,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Target,
  BarChart3,
  Activity,
  Smartphone,
  ShieldCheck,
  RotateCcw,
  Wand2,
  X,
} from "lucide-react";

/* ---------- TYPES ---------- */
interface DailyGoalEntry {
  id: string;
  subjectId: string;
  date: string;
  hoursStudied: number;
  questionsSolved: number;
  disciplineScore: number;
  completionPercent: number;
  notes: string | null;
  subject: { id: string; name: string; slug: string; color: string };
}

interface QueuedDailyGoal {
  id: string;
  subjectId: string;
  date: string;
  hoursStudied: number;
  questionsSolved: number;
  disciplineScore: number;
  completionPercent: number;
  notes: string | null;
}

interface DailyGoalBatchResponse {
  results?: Array<{ id?: string; ok: boolean; error?: string }>;
}

interface Subject {
  id: string;
  name: string;
  slug: string;
  color: string;
  emoji: string;
}

interface HeatCell {
  date: string;
  totalHours: number;
  totalQuestions: number;
  intensity: number;
}

interface ChartPoint {
  date: string;
  displayDate: string;
  hours: number;
  questions: number;
  discipline: number;
  completion: number;
  rhythm: number;
}

interface ScreenChartPoint {
  date: string;
  displayDate: string;
  distraction: number;
  study: number;
  total: number;
  samples: number;
}

interface SubjectAnalytics {
  id: string;
  name: string;
  slug: string;
  color: string;
  hours: number;
  questions: number;
}

interface GoalFormValue {
  hours: string;
  questions: string;
  notes: string;
}

type GoalFormState = Record<string, GoalFormValue>;
type RangeKey = "7d" | "month" | "year";
type StudyMetricKey = "hours" | "questions" | "discipline" | "completion" | "rhythm";
type PerformanceLabel = "Poor" | "Moderate" | "Good" | "Very Good" | "Chumma";

interface DailyMetaState {
  disciplineScore: string;
  completionPercent: string;
}

interface DailyQuickPreset {
  label: string;
  hoursPerSubject: number;
  questionsPerSubject: number;
  disciplineScore: string;
  completionPercent: string;
}

interface SubjectQuickPreset {
  label: string;
  hours: string;
  questions: string;
}

interface ScreenTimeEntry {
  id: string;
  date: string;
  instagram: number;
  whatsapp: number;
  youtube: number;
  youtubeStudy: number;
  facebook: number;
  netflix: number;
  hotstar: number;
  mxPlayer: number;
  google: number;
  other: number;
  note: string | null;
}

type ScreenTimeForm = Omit<ScreenTimeEntry, "id" | "date" | "note"> & { note: string };

interface AppDef {
  key: keyof ScreenTimeForm;
  label: string;
  group: "Social" | "Video" | "Utility";
  color: string;
  short: string;
}

interface PerformanceBand {
  label: PerformanceLabel;
  score: number;
  accent: string;
  glowClass: string;
  cardClass: string;
}

/* ---------- LOGIC ---------- */
const TRACKER_START = new Date(2026, 4, 1);
const TRACKER_END = new Date(2027, 4, 31);
const TRACKER_START_KEY = format(TRACKER_START, "yyyy-MM-dd");
const TRACKER_END_KEY = format(TRACKER_END, "yyyy-MM-dd");
const TRACKER_DAYS = differenceInCalendarDays(TRACKER_END, TRACKER_START) + 1;
const LIVE_REFRESH_MS = 30000;
const OFFLINE_DAILY_GOALS_KEY = "neet_offline_daily_goals_v1";
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, month: 30, year: 365 };
const RANGE_LABELS: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "7 days" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

const STUDY_METRICS: Record<StudyMetricKey, { label: string; unit: string; accent: string; cap: number }> = {
  hours: { label: "Study hours", unit: "hrs", accent: "var(--gold)", cap: 12 },
  questions: { label: "Questions", unit: "qs", accent: "var(--physics)", cap: 500 },
  discipline: { label: "Discipline", unit: "/100", accent: "var(--botany)", cap: 100 },
  completion: { label: "Completion", unit: "%", accent: "var(--rose-bright)", cap: 100 },
  rhythm: { label: "7-day rhythm", unit: "score", accent: "var(--lotus-bright)", cap: 100 },
};

const DAILY_QUICK_PRESETS: DailyQuickPreset[] = [
  { label: "Balanced", hoursPerSubject: 3, questionsPerSubject: 125, disciplineScore: "82", completionPercent: "80" },
  { label: "Push", hoursPerSubject: 3.25, questionsPerSubject: 140, disciplineScore: "88", completionPercent: "86" },
  { label: "Light", hoursPerSubject: 1.5, questionsPerSubject: 60, disciplineScore: "65", completionPercent: "55" },
];

const SUBJECT_QUICK_PRESETS: SubjectQuickPreset[] = [
  { label: "Light", hours: "1", questions: "40" },
  { label: "Solid", hours: "2", questions: "80" },
  { label: "Deep", hours: "3", questions: "125" },
];

const HEAT_TIERS = [
  { emoji: "·", label: "No log", min: 0, color: "var(--glass-thin)" },
  { emoji: "🌱", label: "Light", min: 0.01, color: "hsla(142,60%,48%,0.16)" },
  { emoji: "📘", label: "Warm", min: 4, color: "hsla(218,84%,62%,0.22)" },
  { emoji: "🔥", label: "Close", min: 8, color: "hsla(352,72%,58%,0.26)" },
  { emoji: "💪", label: "Good", min: 10, color: "hsla(142,60%,48%,0.34)" },
  { emoji: "🏆", label: "Excellent", min: 12, color: "hsla(38,72%,58%,0.38)" },
  { emoji: "🚀", label: "Peak", min: 13, color: "var(--gold)" },
];

const SCREEN_APPS: AppDef[] = [
  { key: "instagram", label: "Instagram", group: "Social", color: "linear-gradient(135deg,#feda75,#d62976 45%,#962fbf 80%,#4f5bd5)", short: "IG" },
  { key: "whatsapp", label: "WhatsApp", group: "Social", color: "linear-gradient(135deg,#25d366,#128c7e)", short: "WA" },
  { key: "youtube", label: "YouTube", group: "Video", color: "linear-gradient(135deg,#ff4e45,#cc0000)", short: "YT" },
  { key: "youtubeStudy", label: "YouTube study", group: "Video", color: "linear-gradient(135deg,#3ec77a,#1f9d57)", short: "EDU" },
  { key: "facebook", label: "Facebook", group: "Social", color: "linear-gradient(135deg,#3b82f6,#1877f2)", short: "f" },
  { key: "netflix", label: "Netflix", group: "Video", color: "linear-gradient(135deg,#e50914,#8b0008)", short: "N" },
  { key: "hotstar", label: "Hotstar", group: "Video", color: "linear-gradient(135deg,#1f80e0,#0b2a6b)", short: "★" },
  { key: "mxPlayer", label: "MX Player", group: "Video", color: "linear-gradient(135deg,#2aa8ff,#1f6feb)", short: "▶" },
  { key: "google", label: "Google / browse", group: "Utility", color: "linear-gradient(135deg,#4285f4,#34a853 55%,#fbbc05 80%,#ea4335)", short: "G" },
  { key: "other", label: "Other", group: "Utility", color: "linear-gradient(135deg,#8a93a6,#5b6477)", short: "•••" },
];

const EMPTY_SCREEN_FORM: ScreenTimeForm = {
  instagram: 0,
  whatsapp: 0,
  youtube: 0,
  youtubeStudy: 0,
  facebook: 0,
  netflix: 0,
  hotstar: 0,
  mxPlayer: 0,
  google: 0,
  other: 0,
  note: "",
};

const DISTRACTION_APP_KEYS = SCREEN_APPS.map((app) => app.key).filter((key) => key !== "youtubeStudy") as Array<keyof ScreenTimeForm>;

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function getIntensity(hours: number, questions: number): number {
  const score = (hours / 12) * 0.5 + (questions / 500) * 0.5;
  if (score >= 1) return 4;
  if (score >= 0.6) return 3;
  if (score >= 0.35) return 2;
  if (score > 0) return 1;
  return 0;
}

function buildCycleHeatmap(goals: DailyGoalEntry[]): HeatCell[] {
  const map: Record<string, { hours: number; questions: number }> = {};
  goals.forEach((g) => {
    const d = g.date.split("T")[0];
    if (!map[d]) map[d] = { hours: 0, questions: 0 };
    map[d].hours += g.hoursStudied;
    map[d].questions += g.questionsSolved;
  });

  const cells: HeatCell[] = [];
  for (let i = 0; i < TRACKER_DAYS; i++) {
    const date = dateKey(addDays(TRACKER_START, i));
    const data = map[date] || { hours: 0, questions: 0 };
    cells.push({
      date,
      totalHours: data.hours,
      totalQuestions: data.questions,
      intensity: getIntensity(data.hours, data.questions),
    });
  }
  return cells;
}

function buildChartData(goals: DailyGoalEntry[], days = 30): ChartPoint[] {
  const map: Record<string, { hours: number; questions: number; discipline: number[]; completion: number[] }> = {};
  goals.forEach((g) => {
    const d = g.date.split("T")[0];
    if (!map[d]) map[d] = { hours: 0, questions: 0, discipline: [], completion: [] };
    map[d].hours += g.hoursStudied;
    map[d].questions += g.questionsSolved;
    map[d].discipline.push(g.disciplineScore);
    map[d].completion.push(g.completionPercent);
  });

  const data: ChartPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const targetDate = dateFnsSubDays(new Date(), i);
    const dateStr = format(targetDate, "yyyy-MM-dd");
    const point = map[dateStr] || { hours: 0, questions: 0, discipline: [], completion: [] };
    const discipline = point.discipline.length ? Math.round(point.discipline.reduce((s, v) => s + v, 0) / point.discipline.length) : 0;
    const completion = point.completion.length ? Math.round(point.completion.reduce((s, v) => s + v, 0) / point.completion.length) : 0;
    const rhythm = Math.round(
      Math.min(100, (point.hours / 12) * 45 + (point.questions / 500) * 25 + discipline * 0.15 + completion * 0.15)
    );
    data.push({
      date: dateStr,
      displayDate: days > 60 ? format(targetDate, "MMM dd") : format(targetDate, "MMM dd"),
      hours: point.hours,
      questions: point.questions,
      discipline,
      completion,
      rhythm,
    });
  }
  return data;
}

function getHeatTier(hours: number) {
  if (hours >= 13) return HEAT_TIERS[6];
  if (hours >= 12) return HEAT_TIERS[5];
  if (hours >= 10) return HEAT_TIERS[4];
  if (hours >= 8) return HEAT_TIERS[3];
  if (hours >= 4) return HEAT_TIERS[2];
  if (hours > 0) return HEAT_TIERS[1];
  return HEAT_TIERS[0];
}

function screenDateKey(date: string) {
  return date.split("T")[0];
}

function formatPresetHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildDailyScreenRows(rows: ScreenTimeEntry[], days: number) {
  const map: Record<string, ScreenTimeEntry> = {};
  rows.forEach((row) => {
    map[screenDateKey(row.date)] = row;
  });

  return Array.from({ length: days }, (_, index) => {
    const targetDate = dateFnsSubDays(new Date(), days - 1 - index);
    const key = format(targetDate, "yyyy-MM-dd");
    const row = map[key];
    const distraction = row
      ? DISTRACTION_APP_KEYS.reduce((sum, appKey) => sum + (Number(row[appKey as keyof ScreenTimeEntry]) || 0), 0)
      : 0;
    return {
      date: key,
      displayDate: format(targetDate, days > 60 ? "MMM dd" : "MMM dd"),
      distraction: Number(distraction.toFixed(1)),
      study: row ? row.youtubeStudy : 0,
      total: Number((distraction + (row ? row.youtubeStudy : 0)).toFixed(1)),
      samples: row ? 1 : 0,
    };
  });
}

function buildScreenChartData(rows: ScreenTimeEntry[], range: RangeKey): ScreenChartPoint[] {
  if (range === "7d") return buildDailyScreenRows(rows, 7);

  const days = RANGE_DAYS[range];
  const dailyRows = buildDailyScreenRows(rows, days);
  const bucketSize = range === "month" ? 6 : 30;
  const formatter = range === "month"
    ? (start: ScreenChartPoint, _end: ScreenChartPoint, index: number) => `W${index + 1} · ${start.displayDate}`
    : (start: ScreenChartPoint) => format(new Date(start.date), "MMM");

  const buckets: ScreenChartPoint[] = [];
  for (let index = 0; index < dailyRows.length; index += bucketSize) {
    const slice = dailyRows.slice(index, index + bucketSize);
    if (!slice.length) continue;
    const divisor = slice.length;
    const distraction = slice.reduce((sum, point) => sum + point.distraction, 0) / divisor;
    const study = slice.reduce((sum, point) => sum + point.study, 0) / divisor;
    buckets.push({
      date: slice[0].date,
      displayDate: formatter(slice[0], slice[slice.length - 1], buckets.length),
      distraction: Number(distraction.toFixed(1)),
      study: Number(study.toFixed(1)),
      total: Number((distraction + study).toFixed(1)),
      samples: slice.reduce((sum, point) => sum + point.samples, 0),
    });
  }

  return buckets;
}

function buildSubjectAnalytics(goals: DailyGoalEntry[], subjects: Subject[]): SubjectAnalytics[] {
  const fallback = new Map<string, SubjectAnalytics>();
  subjects.forEach((subject) => {
    fallback.set(subject.id, {
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      color: subject.color,
      hours: 0,
      questions: 0,
    });
  });

  goals.forEach((goal) => {
    const subject = fallback.get(goal.subjectId) || {
      id: goal.subjectId,
      name: goal.subject.name,
      slug: goal.subject.slug,
      color: goal.subject.color,
      hours: 0,
      questions: 0,
    };
    subject.hours += goal.hoursStudied;
    subject.questions += goal.questionsSolved;
    fallback.set(goal.subjectId, subject);
  });

  return [...fallback.values()].sort((a, b) => b.hours - a.hours);
}

function getPerformanceBand(score: number): PerformanceBand {
  if (score >= 0.9) {
    return { label: "Chumma", score, accent: "var(--gold)", glowClass: "gold-glow", cardClass: "band-chumma" };
  }
  if (score >= 0.72) {
    return { label: "Very Good", score, accent: "var(--physics)", glowClass: "physics-glow", cardClass: "band-very-good" };
  }
  if (score >= 0.5) {
    return { label: "Good", score, accent: "var(--botany)", glowClass: "botany-glow", cardClass: "band-good" };
  }
  if (score >= 0.25) {
    return { label: "Moderate", score, accent: "var(--text-primary)", glowClass: "gray-glow", cardClass: "band-moderate" };
  }
  return { label: "Poor", score, accent: "var(--rose-bright)", glowClass: "danger-glow", cardClass: "band-poor" };
}

function getCurrentStreak(goals: DailyGoalEntry[]): number {
  const uniqueDates = [...new Set(goals.map((goal) => goal.date.split("T")[0]))].sort().reverse();
  let streak = 0;

  for (let index = 0; index < uniqueDates.length; index++) {
    const expected = format(dateFnsSubDays(new Date(), index), "yyyy-MM-dd");
    if (uniqueDates[index] === expected) streak++;
    else break;
  }

  return streak;
}

function readOfflineDailyGoals(): QueuedDailyGoal[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_DAILY_GOALS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineDailyGoals(queue: QueuedDailyGoal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(OFFLINE_DAILY_GOALS_KEY, JSON.stringify(queue));
}

function queueOfflineDailyGoals(entries: QueuedDailyGoal[]) {
  const merged = new Map(readOfflineDailyGoals().map((entry) => [entry.id, entry]));
  entries.forEach((entry) => merged.set(entry.id, entry));
  const queue = Array.from(merged.values());
  writeOfflineDailyGoals(queue);
  return queue.length;
}

function renderAiLine(line: string, index: number) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const clean = trimmed.replace(/\*\*/g, "");
  const labelMatch = clean.match(/^([^:]+):\s*(.*)$/);
  if (labelMatch && !/^\d+\./.test(clean)) {
    return (
      <p className="ai-report-line ai-report-labelled" key={`${index}-${clean}`}>
        <span>{labelMatch[1]}</span>
        {labelMatch[2]}
      </p>
    );
  }

  return (
    <p className={/^\d+\./.test(clean) ? "ai-report-line ai-report-action" : "ai-report-line"} key={`${index}-${clean}`}>
      {clean}
    </p>
  );
}

export default function DailyGoalsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [goals, setGoals] = useState<DailyGoalEntry[]>([]);
  const [screenRows, setScreenRows] = useState<ScreenTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [form, setForm] = useState<GoalFormState>({});
  const [dailyMeta, setDailyMeta] = useState<DailyMetaState>({ disciplineScore: "", completionPercent: "" });
  const [screenForm, setScreenForm] = useState<ScreenTimeForm>(EMPTY_SCREEN_FORM);
  const [saving, setSaving] = useState(false);
  const [savingScreen, setSavingScreen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [screenSaved, setScreenSaved] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [hoveredHeat, setHoveredHeat] = useState<HeatCell | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [studyRange, setStudyRange] = useState<RangeKey>("month");
  const [studyMetric, setStudyMetric] = useState<StudyMetricKey>("questions");
  const [screenRange, setScreenRange] = useState<RangeKey>("7d");
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [subjectsData, goalsData, screenData] = await Promise.all([
        fetch("/api/subjects")
          .then(async (response) => (response.ok ? ((await response.json()) as Subject[]) : null))
          .catch(() => null),
        fetch(`/api/daily-goals?start=${TRACKER_START_KEY}&end=${TRACKER_END_KEY}`)
          .then(async (response) => (response.ok ? ((await response.json()) as DailyGoalEntry[]) : null))
          .catch(() => null),
        fetch(`/api/screen-time?start=${TRACKER_START_KEY}&end=${TRACKER_END_KEY}`)
          .then(async (response) => (response.ok ? ((await response.json()) as ScreenTimeEntry[]) : null))
          .catch(() => null),
      ]);

      if (subjectsData) setSubjects(subjectsData);
      if (screenData) {
        setScreenRows(screenData);
        if (!silent) {
          const todayScreen = screenData.find((row) => screenDateKey(row.date) === selectedDate);
          setScreenForm(todayScreen ? {
            instagram: todayScreen.instagram,
            whatsapp: todayScreen.whatsapp,
            youtube: todayScreen.youtube,
            youtubeStudy: todayScreen.youtubeStudy,
            facebook: todayScreen.facebook,
            netflix: todayScreen.netflix,
            hotstar: todayScreen.hotstar,
            mxPlayer: todayScreen.mxPlayer,
            google: todayScreen.google,
            other: todayScreen.other,
            note: todayScreen.note || "",
          } : EMPTY_SCREEN_FORM);
        }
      }
      if (goalsData) {
        const gs = goalsData;
        setGoals(gs);

        if (!silent) {
          const todayGoals = gs.filter((g: DailyGoalEntry) => g.date.split("T")[0] === selectedDate);
          const initial: GoalFormState = {};
          todayGoals.forEach((g: DailyGoalEntry) => {
            initial[g.subjectId] = {
              hours: String(g.hoursStudied),
              questions: String(g.questionsSolved),
              notes: g.notes || "",
            };
          });
          setForm(initial);
          setDailyMeta({
            disciplineScore: todayGoals.length
              ? String(Math.round(todayGoals.reduce((sum, goal) => sum + goal.disciplineScore, 0) / todayGoals.length))
              : "",
            completionPercent: todayGoals.length
              ? String(Math.round(todayGoals.reduce((sum, goal) => sum + goal.completionPercent, 0) / todayGoals.length))
              : "",
          });
        }
      }
      setLastSynced(new Date());
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const syncOfflineGoals = useCallback(async () => {
    const queue = readOfflineDailyGoals();
    setPendingOffline(queue.length);

    if (!queue.length || !navigator.onLine) return;

    let remaining: QueuedDailyGoal[] = [];

    try {
      const response = await fetch("/api/daily-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: queue }),
      });

      if (!response.ok) {
        remaining = queue;
      } else {
        const data = (await response.json()) as DailyGoalBatchResponse;
        const failedIds = new Set((data.results || []).filter((result) => !result.ok).map((result) => result.id));
        remaining = queue.filter((entry) => failedIds.has(entry.id));
      }
    } catch {
      remaining = queue;
    }

    writeOfflineDailyGoals(remaining);
    setPendingOffline(remaining.length);
    if (remaining.length < queue.length) fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    syncOfflineGoals();
    window.addEventListener("online", syncOfflineGoals);
    return () => window.removeEventListener("online", syncOfflineGoals);
  }, [syncOfflineGoals]);

  useEffect(() => {
    const id = window.setInterval(() => fetchData(true), LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [fetchData]);

  const heatCells = useMemo(() => buildCycleHeatmap(goals), [goals]);
  const chartData = useMemo(() => buildChartData(goals, RANGE_DAYS[studyRange]), [goals, studyRange]);
  const monthlyChartData = useMemo(() => buildChartData(goals, 30), [goals]);
  const screenChartData = useMemo(() => buildScreenChartData(screenRows, screenRange), [screenRows, screenRange]);
  const subjectAnalytics = useMemo(() => buildSubjectAnalytics(goals, subjects), [goals, subjects]);
  const lastLoggedDate = useMemo(() => {
    const loggedDates = goals
      .map((goal) => goal.date.split("T")[0])
      .filter((goalDate) => goalDate < selectedDate)
      .sort()
      .reverse();
    return loggedDates[0] || null;
  }, [goals, selectedDate]);

  const setSubjectFormValue = useCallback((subjectId: string, patch: Partial<GoalFormValue>) => {
    setForm((current) => {
      const existing = current[subjectId] || { hours: "", questions: "", notes: "" };
      return {
        ...current,
        [subjectId]: { ...existing, ...patch },
      };
    });
  }, []);

  const applySubjectPreset = useCallback((subjectId: string, preset: SubjectQuickPreset) => {
    setSubjectFormValue(subjectId, { hours: preset.hours, questions: preset.questions });
  }, [setSubjectFormValue]);

  const clearSubjectEntry = useCallback((subjectId: string) => {
    setSubjectFormValue(subjectId, { hours: "", questions: "", notes: "" });
  }, [setSubjectFormValue]);

  const applyDailyPreset = useCallback((preset: DailyQuickPreset) => {
    setForm((current) => {
      const next: GoalFormState = { ...current };
      subjects.forEach((subject) => {
        const existing = current[subject.id] || { hours: "", questions: "", notes: "" };
        next[subject.id] = {
          ...existing,
          hours: formatPresetHours(preset.hoursPerSubject),
          questions: String(preset.questionsPerSubject),
        };
      });
      return next;
    });
    setDailyMeta({
      disciplineScore: preset.disciplineScore,
      completionPercent: preset.completionPercent,
    });
  }, [subjects]);

  const copyLastLoggedDay = useCallback(() => {
    if (!lastLoggedDate) return;

    const copiedGoals = goals.filter((goal) => goal.date.split("T")[0] === lastLoggedDate);
    const next: GoalFormState = {};
    copiedGoals.forEach((goal) => {
      next[goal.subjectId] = {
        hours: String(goal.hoursStudied),
        questions: String(goal.questionsSolved),
        notes: goal.notes || "",
      };
    });

    setForm(next);
    setDailyMeta({
      disciplineScore: copiedGoals.length
        ? String(Math.round(copiedGoals.reduce((sum, goal) => sum + goal.disciplineScore, 0) / copiedGoals.length))
        : "",
      completionPercent: copiedGoals.length
        ? String(Math.round(copiedGoals.reduce((sum, goal) => sum + goal.completionPercent, 0) / copiedGoals.length))
        : "",
    });
  }, [goals, lastLoggedDate]);

  const handleSave = async () => {
    setSaving(true);
    const disciplineScore = Math.max(0, Math.min(100, parseInt(dailyMeta.disciplineScore) || 0));
    const completionPercent = Math.max(0, Math.min(100, parseInt(dailyMeta.completionPercent) || 0));
    const entries: QueuedDailyGoal[] = Object.entries(form)
      .filter(([, v]) => v.hours !== "" || v.questions !== "" || v.notes !== "")
      .map(([subjectId, v]) => ({
        id: `${selectedDate}:${subjectId}`,
        subjectId,
        date: selectedDate,
        hoursStudied: parseFloat(v.hours) || 0,
        questionsSolved: parseInt(v.questions) || 0,
        disciplineScore,
        completionPercent,
        notes: v.notes || null,
      }));

    const failedEntries: QueuedDailyGoal[] = [];

    if (entries.length) {
      try {
        const response = await fetch("/api/daily-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        });

        if (!response.ok) {
          failedEntries.push(...entries);
        } else {
          const data = (await response.json()) as DailyGoalBatchResponse;
          const failedIds = new Set((data.results || []).filter((result) => !result.ok).map((result) => result.id));
          failedEntries.push(...entries.filter((entry) => failedIds.has(entry.id)));
        }
      } catch {
        failedEntries.push(...entries);
      }
    }

    if (failedEntries.length) {
      setPendingOffline(queueOfflineDailyGoals(failedEntries));
    } else {
      await syncOfflineGoals();
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    if (!failedEntries.length) fetchData();
  };

  const handleScreenSave = async () => {
    setSavingScreen(true);
    setScreenSaved(false);
    try {
      const response = await fetch("/api/screen-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, ...screenForm }),
      });

      if (!response.ok) throw new Error("Unable to save screen-time");
      setScreenSaved(true);
      setTimeout(() => setScreenSaved(false), 2800);
      await fetchData(true);
    } finally {
      setSavingScreen(false);
    }
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/daily-goals/analyze");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI analysis failed");
      setAiInsight(data.content || "No AI response returned.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiLoading(false);
    }
  };

  const changeDate = (days: number) => {
    const cur = new Date(selectedDate);
    setSelectedDate(format(addDays(cur, days), "yyyy-MM-dd"));
  };

  const weeks: Array<Array<HeatCell | null>> = [];
  let week: Array<HeatCell | null> = Array.from({ length: TRACKER_START.getDay() }, () => null);
  heatCells.forEach((cell) => {
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const todayTotalHours = Object.values(form).reduce((s: number, v) => s + (parseFloat(v.hours) || 0), 0);
  const todayTotalQs = Object.values(form).reduce((s: number, v) => s + (parseInt(v.questions) || 0), 0);
  const filledSubjects = Object.values(form).filter((v) => v.hours !== "" || v.questions !== "").length;
  const activeDaysInRange = chartData.filter((d) => d.questions > 0 || d.hours > 0).length;
  const activeDays30 = monthlyChartData.filter((d) => d.questions > 0 || d.hours > 0).length;
  const selectedMetric = STUDY_METRICS[studyMetric];
  const selectedMetricValues = chartData.map((d) => Number(d[studyMetric]) || 0);
  const avgSelectedMetric = selectedMetricValues.reduce((sum, value) => sum + value, 0) / Math.max(chartData.length, 1);
  const avgHoursInRange = chartData.reduce((sum, d) => sum + d.hours, 0) / chartData.length;
  const bestChartPoint = chartData.reduce((best, current) => (Number(current[studyMetric]) > Number(best[studyMetric]) ? current : best), chartData[0]);
  const currentStreak = getCurrentStreak(goals);
  const cycleActiveDays = heatCells.filter((cell) => cell.intensity > 0).length;
  const cycleHours = heatCells.reduce((sum, cell) => sum + cell.totalHours, 0);
  const cycleQuestions = heatCells.reduce((sum, cell) => sum + cell.totalQuestions, 0);
  const todayDiscipline = Math.max(0, Math.min(100, parseInt(dailyMeta.disciplineScore) || 0));
  const todayCompletion = Math.max(0, Math.min(100, parseInt(dailyMeta.completionPercent) || 0));
  const todayDistraction = DISTRACTION_APP_KEYS.reduce((sum, appKey) => sum + (Number(screenForm[appKey]) || 0), 0);
  const todayStudyYoutube = Number(screenForm.youtubeStudy) || 0;
  const screenTotalToday = todayDistraction + todayStudyYoutube;
  const topScreenApp = SCREEN_APPS
    .filter((app) => app.key !== "youtubeStudy")
    .map((app) => ({ ...app, value: Number(screenForm[app.key]) || 0 }))
    .sort((a, b) => b.value - a.value)[0];
  const screenMax = Math.max(4, ...screenChartData.map((point) => point.total), 1);
  const screenAverages = {
    distraction: screenChartData.reduce((sum, point) => sum + point.distraction, 0) / Math.max(screenChartData.length, 1),
    study: screenChartData.reduce((sum, point) => sum + point.study, 0) / Math.max(screenChartData.length, 1),
    total: screenChartData.reduce((sum, point) => sum + point.total, 0) / Math.max(screenChartData.length, 1),
  };
  const screenChartModeLabel = screenRange === "7d" ? "Daily rows" : screenRange === "month" ? "Weekly averages" : "Monthly averages";
  const screenLoggedBuckets = screenChartData.filter((point) => point.samples > 0).length;
  const trackerElapsedDays = Math.min(
    TRACKER_DAYS,
    Math.max(1, differenceInCalendarDays(new Date(), TRACKER_START) + 1)
  );
  const cycleConsistencyPct = Math.round((cycleActiveDays / trackerElapsedDays) * 100);
  const maxSubjectHours = Math.max(...subjectAnalytics.map((subject) => subject.hours), 1);
  const subjectCoverage = subjects.length > 0 ? filledSubjects / subjects.length : 0;
  const dailyPerformanceScore = Math.min(1, todayTotalHours / 12 * 0.4 + todayTotalQs / 500 * 0.4 + subjectCoverage * 0.2);
  const consistencyScore = Math.min(1, activeDays30 / 30 * 0.55 + Math.min(currentStreak, 10) / 10 * 0.25 + cycleConsistencyPct / 100 * 0.2);
  const intensityBand = getPerformanceBand(dailyPerformanceScore);
  const consistencyBand = getPerformanceBand(consistencyScore);
  const monthMarkers = weeks
    .map((currentWeek, index) => ({
      index,
      firstDay: currentWeek.find(Boolean),
    }))
    .filter((marker): marker is { index: number; firstDay: HeatCell } => Boolean(marker.firstDay))
    .map((marker) => ({
      index: marker.index,
      label: format(new Date(marker.firstDay.date), "MMM"),
    }))
    .filter((marker, index, all) => index === 0 || marker.label !== all[index - 1].label);

  const maxChartValue = Math.max(selectedMetric.cap, ...selectedMetricValues, 1);
  const chartWidth = 1000;
  const chartHeight = 270;
  const padX = Math.max(58, String(Math.ceil(maxChartValue)).length * 9 + 28);
  const padY = 44;
  const usableW = chartWidth - padX * 2;
  const usableH = chartHeight - padY * 2;

  const chartPoints = chartData.map((d, i) => {
    const x = padX + (i / Math.max(chartData.length - 1, 1)) * usableW;
    const value = Number(d[studyMetric]) || 0;
    const y = chartHeight - padY - (value / maxChartValue) * usableH;
    return { x, y, value, ...d };
  });

  const lineD = `M ${chartPoints.map((p) => `${p.x},${p.y}`).join(" L ")}`;
  const areaD = `${lineD} L ${chartPoints[chartPoints.length - 1].x},${chartHeight - padY} L ${chartPoints[0].x},${chartHeight - padY} Z`;

  return (
    <div className="goals-page">
      <div className={`ambient-orb orb-1 ${intensityBand.label === "Chumma" ? "orb-peak" : ""}`} />
      <div className={`ambient-orb orb-2 ${intensityBand.label === "Chumma" ? "orb-peak" : ""}`} />
      <div className="ambient-orb orb-3" />
      <div className="ambient-grid" />

      <div className="content-wrapper">
        <header className="page-header animate-fade-in" style={{ animationDelay: "0ms" }}>
          <div className="header-text">
            <div className="eyebrow-row">
              <span className="eyebrow-chip">Daily Goals</span>
              <span className="eyebrow-divider" />
              <span className="eyebrow-copy">May 2026 to May 2027. Live from real logs.</span>
            </div>
            <h1 className="title gradient-text">Daily Analytics</h1>
            <p className="subtitle">Log the day, then read the full NEET cycle from left to right without fabricated numbers.</p>
          </div>
          <div className="date-picker-glass">
            <button className="date-nav-btn" onClick={() => changeDate(-1)} aria-label="Previous day">
              <ChevronLeft size={18} />
            </button>
            <div className="date-display">
              <Calendar size={16} className="date-icon" />
              <span>{format(new Date(selectedDate), "MMM dd, yyyy")}</span>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="hidden-date-input" />
            </div>
            <button
              className="date-nav-btn"
              onClick={() => changeDate(1)}
              disabled={selectedDate === format(new Date(), "yyyy-MM-dd")}
              aria-label="Next day"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        <section className="hero-band animate-slide-up" style={{ animationDelay: "60ms" }}>
          <div className="hero-copy">
            <span className="hero-kicker">Live command center</span>
            <h2 className="hero-title">One honest timeline from May 2026 to May 2027.</h2>
            <p className="hero-desc">
              Every tile, line, and subject bar below is calculated from saved daily-goal entries. Empty days stay empty until work is logged.
            </p>
            <div className="hero-mini-row">
              <div className="mini-chip">
                <Sparkles size={14} />
                <span>{filledSubjects} subjects touched</span>
              </div>
              <div className="mini-chip">
                <Target size={14} />
                <span>{activeDays30}/30 active days</span>
              </div>
              <div className="mini-chip">
                <Activity size={14} />
                <span>{lastSynced ? `Synced ${format(lastSynced, "HH:mm:ss")}` : "Live sync pending"}</span>
              </div>
            </div>
          </div>

          <div className="hero-pulse-card">
            <div className="hero-pulse-label">Cycle consistency</div>
            <div className="hero-pulse-value">{cycleConsistencyPct}%</div>
            <div className="hero-pulse-meta">
              <span>{cycleActiveDays} active days in the NEET cycle</span>
              <span>{cycleHours.toFixed(1)} total hours logged</span>
              <span>{cycleQuestions} total questions solved</span>
            </div>
          </div>
        </section>

        <div className="metrics-grid">
          <div className="metric-card animate-slide-up" style={{ animationDelay: "100ms" }}>
            <div className="metric-icon-wrap blue-glow">
              <Clock size={24} />
            </div>
            <div className="metric-info">
              <h2 className="metric-val">{todayTotalHours.toFixed(1)}</h2>
              <span className="metric-label">Hours Logged</span>
            </div>
          </div>
          <div className="metric-card animate-slide-up" style={{ animationDelay: "180ms" }}>
            <div className="metric-icon-wrap purple-glow">
              <BookOpen size={24} />
            </div>
            <div className="metric-info">
              <h2 className="metric-val">{todayTotalQs}</h2>
              <span className="metric-label">Questions Solved</span>
            </div>
          </div>
          <div className="metric-card animate-slide-up" style={{ animationDelay: "250ms" }}>
            <div className="metric-icon-wrap blue-glow soft-alt">
              <CheckCircle2 size={24} />
            </div>
            <div className="metric-info">
              <h2 className="metric-val">{filledSubjects}</h2>
              <span className="metric-label">Subjects Logged</span>
            </div>
          </div>
          <div className={`metric-card animate-slide-up ${intensityBand.cardClass}`} style={{ animationDelay: "320ms" }}>
            <div className={`metric-icon-wrap ${intensityBand.glowClass}`}>
              <Flame size={24} className={intensityBand.label === "Chumma" ? "flame-peak" : ""} />
            </div>
            <div className="metric-info">
              <h2 className="metric-val" style={{ color: intensityBand.accent }}>
                {intensityBand.label}
              </h2>
              <span className="metric-label">Intensity Level</span>
            </div>
          </div>
        </div>

        <div className="glass-panel chart-panel animate-slide-up" style={{ animationDelay: "400ms" }}>
          <div className="panel-header chart-header">
            <div>
              <h3>
                <TrendingUp size={20} className="inline-icon" /> Performance Trajectory
              </h3>
              <p className="panel-desc">Switch between hours, questions, discipline, completion, and rhythm without leaving the daily desk.</p>
            </div>
            <div className="chart-control-stack">
              <div className="range-tabs" aria-label="Study range">
                {RANGE_LABELS.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    className={`range-tab ${studyRange === range.key ? "range-tab-active" : ""}`}
                    onClick={() => setStudyRange(range.key)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <div className="chart-stat-badge">
                Max: <span>{Math.ceil(maxChartValue)} {selectedMetric.unit}</span>
              </div>
            </div>
          </div>

          <div className="metric-tabs" aria-label="Study metric">
            {(Object.keys(STUDY_METRICS) as StudyMetricKey[]).map((metricKey) => (
              <button
                key={metricKey}
                type="button"
                className={`metric-tab ${studyMetric === metricKey ? "metric-tab-active" : ""}`}
                style={{ "--metric-accent": STUDY_METRICS[metricKey].accent } as CSSProperties}
                onClick={() => setStudyMetric(metricKey)}
              >
                {STUDY_METRICS[metricKey].label}
              </button>
            ))}
          </div>

          <div className="chart-layout">
            <div className="chart-container">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="line-chart">
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsla(38,72%,58%,0.34)" />
                    <stop offset="100%" stopColor="hsla(38,72%,58%,0)" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <text x={padX} y="20" className="chart-axis-title">
                  {selectedMetric.label}
                </text>

                {[0, 0.5, 1].map((ratio) => {
                  const y = chartHeight - padY - ratio * usableH;
                  return (
                    <g key={ratio} className="grid-line-group">
                      <line x1={padX} y1={y} x2={chartWidth - padX} y2={y} className="grid-line" />
                      <text x={padX - 12} y={y + 4} className="axis-label y-axis">
                        {Math.round(ratio * maxChartValue)}
                      </text>
                    </g>
                  );
                })}

                <path d={areaD} fill="url(#areaGradient)" className="chart-area" />
                <path d={lineD} fill="none" className="chart-line" filter="url(#glow)" style={{ stroke: selectedMetric.accent }} />

                {chartPoints.map((p, i) => {
                  const isHovered = hoveredPoint === i;
                  const tooltipWidth = 104;
                  const tooltipHeight = 38;
                  const tooltipGap = 14;
                  const tooltipX = Math.min(
                    Math.max(p.x - tooltipWidth / 2, padX - 10),
                    chartWidth - padX - tooltipWidth + 10
                  );
                  const showBelow = p.y < padY + tooltipHeight + tooltipGap;
                  const tooltipY = showBelow ? p.y + tooltipGap : p.y - tooltipHeight - tooltipGap;
                  const tooltipCenterX = tooltipX + tooltipWidth / 2;
                  const tooltipCenterY = tooltipY + tooltipHeight / 2 + 1;

                  return (
                    <g key={i} onMouseEnter={() => setHoveredPoint(i)} onMouseLeave={() => setHoveredPoint(null)} className="point-group">
                      <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? "6" : "4"}
                        className={`chart-point ${isHovered ? "point-hovered" : ""}`}
                        style={{ stroke: selectedMetric.accent, fill: isHovered ? selectedMetric.accent : undefined } as CSSProperties}
                      />

                      {i % 3 === 0 && (
                        <text x={p.x} y={chartHeight - 12} className="axis-label x-axis">
                          {p.displayDate}
                        </text>
                      )}

                      {isHovered && (
                        <g className={`chart-tooltip ${showBelow ? "tooltip-below" : ""}`}>
                          <line
                            x1={p.x}
                            y1={showBelow ? p.y + 9 : p.y - 9}
                            x2={p.x}
                            y2={showBelow ? tooltipY : tooltipY + tooltipHeight}
                            className="tooltip-stem"
                          />
                          <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="13" className="tooltip-bg" />
                          <text x={tooltipCenterX} y={tooltipCenterY} className="tooltip-text">
                            <tspan className="tooltip-value">{Number.isInteger(p.value) ? p.value : p.value.toFixed(1)}</tspan>
                            <tspan dx="4" className="tooltip-unit">{selectedMetric.unit}</tspan>
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="chart-insight-rail">
              <div className="insight-card insight-card-primary">
                <span className="insight-label">Average / day</span>
                <strong className="insight-value">{studyMetric === "hours" ? avgSelectedMetric.toFixed(1) : Math.round(avgSelectedMetric)}</strong>
                <span className="insight-meta">{selectedMetric.label.toLowerCase()} across {RANGE_DAYS[studyRange]} days</span>
              </div>
              <div className="insight-card">
                <span className="insight-label">Best day</span>
                <strong className="insight-value">
                  {studyMetric === "hours" ? Number(bestChartPoint[studyMetric]).toFixed(1) : Math.round(Number(bestChartPoint[studyMetric]) || 0)}
                </strong>
                <span className="insight-meta">{bestChartPoint.displayDate}</span>
              </div>
              <div className="insight-card">
                <span className="insight-label">Active cadence</span>
                <strong className="insight-value">{activeDaysInRange}/{RANGE_DAYS[studyRange]}</strong>
                <span className="insight-meta">{avgHoursInRange.toFixed(1)} avg hours per day</span>
              </div>
            </div>
          </div>

          <div className="subject-analytics">
            {subjectAnalytics.map((subject) => (
              <div className="subject-analytics-row" key={subject.id}>
                <div className="subject-analytics-copy">
                  <span className="subject-analytics-name" style={{ color: subject.color }}>
                    {subject.name}
                  </span>
                  <span>{subject.hours.toFixed(1)} hrs / {subject.questions} qs</span>
                </div>
                <div className="subject-analytics-track">
                  <span
                    className="subject-analytics-fill"
                    style={{
                      width: `${Math.max(3, (subject.hours / maxSubjectHours) * 100)}%`,
                      background: subject.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="main-grid">
          <div className="glass-panel form-panel animate-slide-up" style={{ animationDelay: "500ms" }}>
            <div className="panel-header">
              <div>
                <h3>
                  <BarChart3 size={20} className="inline-icon" /> Daily Logging Desk
                </h3>
                <p className="panel-desc">Capture work subject by subject so the graph and heatmap stay honest.</p>
              </div>
              {loading && <span className="loading-pulse">Restoring...</span>}
              {pendingOffline > 0 && !loading && <span className="offline-sync-pill">{pendingOffline} queued offline</span>}
            </div>

            <div className="form-summary-strip">
              <div className="summary-pill">
                <span className="summary-pill-label">Hours target</span>
                <strong>{todayTotalHours.toFixed(1)} / 12</strong>
              </div>
              <div className="summary-pill">
                <span className="summary-pill-label">Questions target</span>
                <strong>{todayTotalQs} / 500</strong>
              </div>
              <div className="summary-pill">
                <span className="summary-pill-label">Subjects logged</span>
                <strong>{filledSubjects} / {Math.max(subjects.length, 1)}</strong>
              </div>
            </div>

            <div className="quick-log-dock">
              <div className="quick-log-label">
                <span>
                  <Wand2 size={14} /> Quick fill
                </span>
                <strong>{lastLoggedDate ? format(new Date(lastLoggedDate), "MMM dd") : "Fresh day"}</strong>
              </div>
              <div className="quick-log-actions" aria-label="Daily quick fill actions">
                {DAILY_QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="quick-log-btn"
                    onClick={() => applyDailyPreset(preset)}
                    disabled={loading || subjects.length === 0}
                  >
                    <Wand2 size={14} />
                    <span>{preset.label}</span>
                    <small>{formatPresetHours(preset.hoursPerSubject * Math.max(subjects.length, 1))}h / {preset.questionsPerSubject * Math.max(subjects.length, 1)}q</small>
                  </button>
                ))}
                <button
                  type="button"
                  className="quick-log-btn quick-copy-btn"
                  onClick={copyLastLoggedDay}
                  disabled={loading || !lastLoggedDate}
                  title={lastLoggedDate ? `Copy ${format(new Date(lastLoggedDate), "MMM dd")} log` : "No earlier log found"}
                >
                  <RotateCcw size={14} />
                  <span>Last log</span>
                  <small>{lastLoggedDate ? format(new Date(lastLoggedDate), "MMM dd") : "None"}</small>
                </button>
              </div>
            </div>

            <div className="daily-meta-grid">
              <div className="daily-meta-card">
                <div className="daily-meta-copy">
                  <span className="daily-meta-kicker">
                    <ShieldCheck size={14} /> Discipline
                  </span>
                  <strong>{todayDiscipline || "--"}/100</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={dailyMeta.disciplineScore || "0"}
                  onChange={(event) => setDailyMeta((current) => ({ ...current, disciplineScore: event.target.value }))}
                  className="meta-range discipline-range"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={dailyMeta.disciplineScore}
                  onChange={(event) => setDailyMeta((current) => ({ ...current, disciplineScore: event.target.value }))}
                  className="meta-number-input"
                  aria-label="Daily discipline score"
                />
              </div>

              <div className="daily-meta-card">
                <div className="daily-meta-copy">
                  <span className="daily-meta-kicker">
                    <CheckCircle2 size={14} /> Completion
                  </span>
                  <strong>{todayCompletion || "--"}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={dailyMeta.completionPercent || "0"}
                  onChange={(event) => setDailyMeta((current) => ({ ...current, completionPercent: event.target.value }))}
                  className="meta-range completion-range"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={dailyMeta.completionPercent}
                  onChange={(event) => setDailyMeta((current) => ({ ...current, completionPercent: event.target.value }))}
                  className="meta-number-input"
                  aria-label="Daily completion percentage"
                />
              </div>
            </div>

            <div className="subjects-list">
              {subjects.length === 0 && !loading && <div className="empty-state">No subjects found.</div>}
              {subjects.map((s) => {
                const e = form[s.id] || { hours: "", questions: "", notes: "" };
                const isFilled = e.hours !== "" || e.questions !== "" || e.notes !== "";
                return (
                  <div className={`subject-row group ${isFilled ? "subject-row-active" : ""}`} key={s.id}>
                    <div className="subject-info">
                      <div className="subject-avatar" style={{ color: s.color }}>
                        <span className="emoji">{s.emoji}</span>
                      </div>
                      <div className="subject-copy">
                        <span className="name" style={{ color: s.color }}>
                          {s.name}
                        </span>
                        <span className="subject-tag">{isFilled ? "Logged today" : "Awaiting entry"}</span>
                      </div>
                    </div>
                    <div className="inputs-group">
                      <div className="input-field">
                        <label className="input-label">Hours</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="0.0"
                          value={e.hours}
                          onChange={(ev) => setSubjectFormValue(s.id, { hours: ev.target.value })}
                          className="glass-input"
                        />
                        <span className="input-suffix">hrs</span>
                      </div>
                      <div className="input-field">
                        <label className="input-label">Questions</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={e.questions}
                          onChange={(ev) => setSubjectFormValue(s.id, { questions: ev.target.value })}
                          className="glass-input"
                        />
                        <span className="input-suffix">qs</span>
                      </div>
                    </div>
                    <div className="quick-subject-actions" aria-label={`${s.name} quick fill`}>
                      {SUBJECT_QUICK_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className="quick-subject-chip"
                          onClick={() => applySubjectPreset(s.id, preset)}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="quick-subject-chip quick-clear-chip"
                        onClick={() => clearSubjectEntry(s.id)}
                        aria-label={`Clear ${s.name} log`}
                        title={`Clear ${s.name}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className={`save-btn ${saved ? "saved" : ""}`} onClick={handleSave} disabled={saving || loading}>
              {saved ? (
                <>
                  <CheckCircle2 size={18} /> {pendingOffline > 0 ? "Queued" : "Recorded"}
                </>
              ) : saving ? (
                <>
                  <span className="spinner" /> Saving...
                </>
              ) : (
                <>
                  <Save size={18} /> {pendingOffline > 0 ? "Save / Sync Later" : "Forge Daily Goal"}
                </>
              )}
            </button>
          </div>

          <div className="glass-panel heatmap-panel animate-slide-up" style={{ animationDelay: "600ms" }}>
            <div className="panel-header heatmap-header">
              <div>
                <h3>
                  <Activity size={20} className="inline-icon" /> Consistency Atlas
                </h3>
                <p className="panel-desc">May 2026 starts at the left edge and May 2027 closes the map on the right.</p>
              </div>
              <div className={`heatmap-callout ${consistencyBand.cardClass}`}>
                <span className="heatmap-callout-label">Consistency</span>
                <strong>{consistencyBand.label}</strong>
                <span className="heatmap-callout-meta">{cycleActiveDays} active cycle days logged</span>
              </div>
            </div>

            <div className="heatmap-meta-row">
              <div className="heatmap-meta-card">
                <span className="heatmap-meta-kicker">Today</span>
                <strong>{todayTotalHours.toFixed(1)} hrs</strong>
              </div>
              <div className="heatmap-meta-card">
                <span className="heatmap-meta-kicker">Intensity</span>
                <strong>{intensityBand.label}</strong>
              </div>
              <div className="heatmap-meta-card">
                <span className="heatmap-meta-kicker">Streak</span>
                <strong>{currentStreak} days</strong>
              </div>
            </div>

            <div className="heatmap-month-row" aria-hidden="true">
              {monthMarkers.map((marker) => (
                <span key={`${marker.label}-${marker.index}`} style={{ gridColumn: `${marker.index + 1}` }}>
                  {marker.label}
                </span>
              ))}
            </div>

            <div className="heatmap-container-wrap">
              <div className="heatmap-grid">
                {weeks.map((w, i) => (
                  <div className="heatmap-col" key={`week-${i}`}>
                    {w.map((c, rowIndex) => {
                      if (!c) return <span className="heat-cell heat-cell-empty" key={`empty-${i}-${rowIndex}`} aria-hidden="true" />;
                      const tier = getHeatTier(c.totalHours);
                      return (
                        <button
                          key={c.date}
                          className={`heat-cell emoji-heat-cell tier-${HEAT_TIERS.indexOf(tier)}`}
                          style={{ background: tier.color } as CSSProperties}
                          title={`${c.date}: ${tier.label} - ${c.totalHours} hrs, ${c.totalQuestions} qs`}
                          onMouseEnter={() => setHoveredHeat(c)}
                          onMouseLeave={() => setHoveredHeat(null)}
                          type="button"
                        >
                          <span className="heat-emoji">{tier.emoji}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="heatmap-footer">
              <div className="heatmap-legend">
                <span>Below 10h is still building</span>
                <div className="legend-colors">
                  {HEAT_TIERS.map((tier) => (
                    <div key={tier.label} className="legend-cell emoji-legend-cell" style={{ background: tier.color } as CSSProperties}>
                      {tier.emoji}
                    </div>
                  ))}
                </div>
                <span>10h good, 12h excellent, 13h+ peak</span>
              </div>
              <div className="heatmap-hover-card">
                {hoveredHeat ? (
                  <>
                    <strong>{format(new Date(hoveredHeat.date), "MMM dd, yyyy")} · {getHeatTier(hoveredHeat.totalHours).label}</strong>
                    <span>{hoveredHeat.totalHours} hrs / {hoveredHeat.totalQuestions} qs</span>
                  </>
                ) : (
                  <>
                    <strong>Hover a cell</strong>
                    <span>See the exact daily load</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel screen-panel animate-slide-up" style={{ animationDelay: "680ms" }}>
          <div className="panel-header chart-header">
            <div>
              <h3>
                <Smartphone size={20} className="inline-icon" /> Screen-Time Discipline Zone
              </h3>
              <p className="panel-desc">Manual app-wise logging for distraction debt, with YouTube study kept separate from entertainment time.</p>
            </div>
            <div className="range-tabs" aria-label="Screen-time range">
              {RANGE_LABELS.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  className={`range-tab ${screenRange === range.key ? "range-tab-active" : ""}`}
                  onClick={() => setScreenRange(range.key)}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          <div className="screen-summary-grid">
            <div className="screen-summary-card screen-danger">
              <span>Distraction today</span>
              <strong>{todayDistraction.toFixed(1)} hrs</strong>
              <small>{topScreenApp?.value ? `${topScreenApp.label} leads at ${topScreenApp.value.toFixed(1)} hrs` : "No distraction logged yet"}</small>
            </div>
            <div className="screen-summary-card screen-study">
              <span>Study YouTube</span>
              <strong>{todayStudyYoutube.toFixed(1)} hrs</strong>
              <small>Allowed only when it genuinely supports NEET prep</small>
            </div>
            <div className="screen-summary-card">
              <span>{RANGE_DAYS[screenRange]} day avg</span>
              <strong>{screenAverages.total.toFixed(1)} hrs</strong>
              <small>{screenAverages.distraction.toFixed(1)} distraction / {screenAverages.study.toFixed(1)} study</small>
            </div>
          </div>

          <div className="screen-layout">
            <div className="screen-form-stack">
              {(["Social", "Video", "Utility"] as AppDef["group"][]).map((group) => (
                <div className="screen-app-group" key={group}>
                  <div className="screen-group-title">{group}</div>
                  <div className="screen-app-grid">
                    {SCREEN_APPS.filter((app) => app.group === group).map((app) => (
                      <label className="screen-app-card" key={app.key}>
                        <span className="app-logo" style={{ background: app.color } as CSSProperties}>{app.short}</span>
                        <span className="screen-app-copy">
                          <span>{app.label}</span>
                          <small>{app.key === "youtubeStudy" ? "study-safe" : "track honestly"}</small>
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="24"
                          step="0.25"
                          value={screenForm[app.key] || ""}
                          onChange={(event) =>
                            setScreenForm((current) => ({ ...current, [app.key]: Number(event.target.value) || 0 }))
                          }
                          className="screen-input"
                          aria-label={`${app.label} hours`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <textarea
                value={screenForm.note}
                onChange={(event) => setScreenForm((current) => ({ ...current, note: event.target.value }))}
                className="screen-note"
                rows={3}
                placeholder="Optional note: what was study, what was avoidable?"
              />

              <button className={`save-btn screen-save-btn ${screenSaved ? "saved" : ""}`} onClick={handleScreenSave} disabled={savingScreen}>
                {screenSaved ? (
                  <>
                    <CheckCircle2 size={18} /> Screen-time recorded
                  </>
                ) : savingScreen ? (
                  <>
                    <span className="spinner" /> Saving screen-time...
                  </>
                ) : (
                  <>
                    <Save size={18} /> Save Screen-Time Log
                  </>
                )}
              </button>
            </div>

            <div className={`screen-chart-card screen-range-${screenRange}`}>
              <div className="screen-chart-header">
                <div>
                  <span>Distraction vs study</span>
                  <small>{screenChartModeLabel} · {screenLoggedBuckets}/{screenChartData.length} with logs</small>
                </div>
                <strong>{screenTotalToday.toFixed(1)} hrs today</strong>
              </div>
              <div className="screen-chart">
                {screenChartData.map((point) => (
                  <div className={`screen-bar-row ${point.total > 0 ? "screen-bar-row-active" : ""}`} key={point.date}>
                    <span className="screen-bar-date">{point.displayDate}</span>
                    <div className="screen-bar-track">
                      <span
                        className="screen-bar-fill screen-bar-distraction"
                        style={{ width: `${Math.min(100, (point.distraction / screenMax) * 100)}%` }}
                      />
                      <span
                        className="screen-bar-fill screen-bar-study"
                        style={{ width: `${Math.min(100, (point.study / screenMax) * 100)}%` }}
                      />
                    </div>
                    <span className="screen-bar-total">{point.total.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel ai-discipline-panel animate-slide-up" style={{ animationDelay: "760ms" }}>
          <div className="panel-header">
            <div>
              <h3>
                <Sparkles size={20} className="inline-icon" /> AI Discipline Analyzer
              </h3>
              <p className="panel-desc">Reads study hours, questions, discipline, completion, weak subjects, and screen-time before suggesting the next correction.</p>
            </div>
            <button className="ai-run-btn" type="button" onClick={runAiAnalysis} disabled={aiLoading}>
              {aiLoading ? <span className="spinner" /> : <Sparkles size={16} />}
              Analyze
            </button>
          </div>
          <div className="ai-insight-box">
            {aiError ? (
              <p className="ai-error">{aiError}</p>
            ) : aiInsight ? (
              <div className="ai-report">{aiInsight.split("\n").map(renderAiLine)}</div>
            ) : (
              <p>Run the analyzer after logging the day. It will treat 10h as good, 12h as excellent, 13h+ as peak, and screen-time leakage as part of discipline.</p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .goals-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, var(--lotus-dim), transparent 30%),
            radial-gradient(circle at top right, var(--gold-dim), transparent 28%),
            linear-gradient(180deg, var(--bg-void) 0%, var(--bg-deep) 35%, var(--bg-base) 100%);
          padding: 40px 24px 88px;
          position: relative;
          color: var(--text-primary);
          font-family: var(--font-sans);
          overflow-x: hidden;
        }

        .ambient-grid {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,1) 40%);
          opacity: 0.3;
        }

        .ambient-orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(140px);
          z-index: 0;
          pointer-events: none;
          opacity: 0.12;
          transition: all 1s ease-in-out;
        }
        .orb-1 {
          width: 460px;
          height: 460px;
          top: -120px;
          left: -100px;
          background: var(--lotus);
          animation: float 12s ease-in-out infinite;
        }
        .orb-2 {
          width: 560px;
          height: 560px;
          bottom: 5%;
          right: -210px;
          background: var(--gold);
          animation: float 15s ease-in-out infinite 2s;
        }
        .orb-3 {
          width: 340px;
          height: 340px;
          top: 38%;
          left: 20%;
          background: var(--physics);
          animation: float 14s ease-in-out infinite 4s;
          opacity: 0.08;
        }
        .orb-peak {
          opacity: 0.24;
          filter: blur(100px);
          transform: scale(1.12);
        }

        .content-wrapper {
          position: relative;
          z-index: 1;
          width: min(1480px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          flex-wrap: wrap;
        }
        .header-text { min-width: 0; }
        .eyebrow-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .eyebrow-chip {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 800;
          color: rgba(255,255,255,0.88);
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .eyebrow-divider { width: 24px; height: 1px; background: linear-gradient(90deg, rgba(255,255,255,0.25), transparent); }
        .eyebrow-copy { color: var(--text-muted); font-size: 13px; letter-spacing: 0.03em; }
        .gradient-text {
          background: linear-gradient(135deg, var(--gold-bright), var(--rose-bright), var(--lotus-bright));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .title {
          font-size: clamp(36px, 5vw, 56px);
          font-weight: 850;
          letter-spacing: -0.05em;
          margin: 0 0 4px 0;
        }
        .subtitle { color: var(--text-secondary); font-size: 16px; margin: 0; max-width: 68ch; line-height: 1.7; }

        .date-picker-glass {
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--glass-border-mid);
          border-radius: 100px;
          padding: 6px;
          backdrop-filter: blur(20px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.35);
        }
        .date-nav-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .date-nav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: var(--text-primary); transform: translateY(-1px); }
        .date-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .date-display {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 18px;
          position: relative;
          font-weight: 600;
          font-size: 15px;
          white-space: nowrap;
        }
        .date-icon { color: var(--gold); }
        .hidden-date-input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
          width: 100%;
        }
        .hidden-date-input::-webkit-calendar-picker-indicator { width: 100%; height: 100%; cursor: pointer; }

        .hero-band {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.86fr);
          gap: 22px;
          padding: 30px;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,0.08);
          background:
            radial-gradient(circle at top left, var(--gold-dim), transparent 34%),
            radial-gradient(circle at bottom right, var(--physics-dim), transparent 25%),
            linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
          backdrop-filter: blur(24px);
          box-shadow: 0 18px 60px rgba(0,0,0,0.3);
        }
        .hero-copy { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
        .hero-kicker {
          display: inline-flex;
          width: fit-content;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 800;
          color: var(--gold);
          background: var(--gold-dim);
          border: 1px solid hsla(38,72%,58%,0.16);
        }
        .hero-title { margin: 0; font-size: clamp(26px, 4vw, 40px); line-height: 1.06; letter-spacing: -0.05em; max-width: 14ch; }
        .hero-desc { margin: 0; max-width: 68ch; color: var(--text-secondary); font-size: 15px; line-height: 1.75; }
        .hero-mini-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        .mini-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
        }

        .hero-pulse-card {
          padding: 24px;
          border-radius: 24px;
          background: rgba(0,0,0,0.24);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 18px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
          min-height: 210px;
        }
        .hero-pulse-label {
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted);
          font-weight: 700;
        }
        .hero-pulse-value {
          font-size: clamp(24px, 3vw, 34px);
          font-weight: 850;
          letter-spacing: -0.05em;
          line-height: 1.05;
        }
        .hero-pulse-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        .metric-card {
          background: var(--glass-mid);
          border: 1px solid var(--glass-border);
          border-radius: var(--r-2xl);
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 18px;
          backdrop-filter: blur(24px);
          box-shadow: 0 12px 36px rgba(0,0,0,0.2);
          transition: transform 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease;
        }
        .metric-card:hover { transform: translateY(-6px); border-color: var(--glass-border-mid); box-shadow: 0 18px 44px rgba(0,0,0,0.26); }
        .peak-card { border-color: hsla(38,72%,58%,0.3); background: linear-gradient(180deg, var(--gold-dim) 0%, var(--glass-mid) 100%); }
        .metric-icon-wrap {
          width: 60px;
          height: 60px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .blue-glow,
        .physics-glow { background: var(--physics-dim); color: var(--physics); box-shadow: inset 0 0 20px var(--physics-glow); }
        .soft-alt,
        .botany-glow { background: var(--botany-dim); color: var(--botany); box-shadow: inset 0 0 20px var(--botany-glow); }
        .purple-glow { background: var(--lotus-dim); color: var(--lotus-bright); box-shadow: inset 0 0 20px var(--lotus-glow); }
        .gold-glow { background: hsla(38, 90%, 55%, 0.15); color: var(--gold); box-shadow: inset 0 0 20px hsla(38, 90%, 55%, 0.2); }
        .gray-glow { background: hsla(0, 0%, 50%, 0.1); color: var(--text-secondary); }
        .danger-glow { background: var(--rose-dim); color: var(--rose-bright); box-shadow: inset 0 0 20px var(--rose-glow); }
        .metric-info { min-width: 0; }
        .metric-val {
          font-size: clamp(28px, 3vw, 40px);
          font-weight: 850;
          margin: 0 0 4px 0;
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .metric-label {
          font-size: 12px;
          font-weight: 800;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .flame-peak { animation: pulseWarning 2s infinite alternate; }
        .band-poor { border-color: hsla(352,52%,54%,0.22); background: linear-gradient(180deg, var(--rose-dim) 0%, var(--glass-mid) 100%); }
        .band-moderate { border-color: rgba(255,255,255,0.12); }
        .band-good { border-color: hsla(142,60%,48%,0.24); background: linear-gradient(180deg, var(--botany-dim) 0%, var(--glass-mid) 100%); }
        .band-very-good { border-color: hsla(218,84%,62%,0.24); background: linear-gradient(180deg, var(--physics-dim) 0%, var(--glass-mid) 100%); }
        .band-chumma { border-color: hsla(38,72%,58%,0.3); background: linear-gradient(180deg, var(--gold-dim) 0%, var(--glass-mid) 100%); }

        .glass-panel {
          background: var(--glass-mid);
          backdrop-filter: blur(24px);
          border: 1px solid var(--glass-border);
          border-radius: var(--r-2xl);
          padding: 30px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.24);
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }
        .panel-header h3 {
          font-size: 20px;
          font-weight: 750;
          margin: 0 0 6px 0;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: -0.03em;
        }
        .panel-desc { font-size: 15px; color: var(--text-secondary); margin: 0; line-height: 1.6; }
        .inline-icon { color: var(--gold); }
        .loading-pulse { font-size: 13px; color: var(--gold); font-weight: 700; animation: pulse 1.5s infinite; }
        .offline-sync-pill {
          flex: 0 0 auto;
          border: 1px solid hsla(38,72%,58%,0.28);
          border-radius: 999px;
          padding: 7px 11px;
          color: var(--gold);
          background: var(--gold-dim);
          font-size: 12px;
          font-weight: 800;
        }

        .chart-panel {
          padding-bottom: 24px;
          overflow: hidden;
        }
        .chart-header { align-items: center; }
        .chart-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(240px, 0.68fr);
          gap: 18px;
          align-items: stretch;
        }
        .chart-stat-badge {
          background: var(--gold-dim);
          border: 1px solid hsla(38,72%,58%,0.3);
          color: var(--gold);
          padding: 6px 12px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }
        .chart-stat-badge span { font-weight: 800; }
        .chart-control-stack {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 10px;
        }
        .range-tabs,
        .metric-tabs {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          padding: 5px;
          border-radius: 999px;
          background: rgba(0,0,0,0.24);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .metric-tabs {
          justify-content: flex-start;
          border-radius: 18px;
          width: fit-content;
          max-width: 100%;
        }
        .range-tab,
        .metric-tab {
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--text-secondary);
          padding: 8px 12px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
          white-space: nowrap;
        }
        .metric-tab {
          border-radius: 13px;
          color: var(--text-muted);
        }
        .range-tab-active,
        .range-tab:hover {
          background: var(--gold-dim);
          color: var(--gold);
          box-shadow: inset 0 0 0 1px hsla(38,72%,58%,0.18);
        }
        .metric-tab-active,
        .metric-tab:hover {
          background: color-mix(in srgb, var(--metric-accent) 16%, transparent);
          color: var(--metric-accent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--metric-accent) 26%, transparent);
        }
        .chart-container {
          width: 100%;
          position: relative;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 12px 10px 14px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.055);
          background:
            radial-gradient(circle at 12% 0%, hsla(38,72%,58%,0.1), transparent 28%),
            linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.08));
        }
        .chart-container::-webkit-scrollbar { height: 8px; }
        .chart-container::-webkit-scrollbar-thumb { background: var(--glass-border-mid); border-radius: 999px; }
        .line-chart { width: 100%; min-width: 780px; height: auto; display: block; overflow: visible; }
        .grid-line { stroke: rgba(255,255,255,0.05); stroke-width: 1; stroke-dasharray: 4 4; }
        .axis-label { fill: var(--text-muted); font-size: 12px; font-weight: 600; }
        .y-axis { text-anchor: end; alignment-baseline: middle; }
        .x-axis { text-anchor: middle; }
        .chart-axis-title {
          fill: var(--text-secondary);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .chart-area { opacity: 0; animation: fadeIn 1s ease-out 0.4s forwards; }
        .chart-line {
          stroke: var(--gold);
          stroke-width: 3.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 3000;
          stroke-dashoffset: 3000;
          animation: drawLine 2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .chart-point {
          fill: var(--bg-base);
          stroke: var(--gold);
          stroke-width: 2;
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          opacity: 0;
          animation: fadeIn 0.5s ease-out 1.3s forwards;
        }
        .point-hovered {
          fill: var(--gold);
          transform-origin: center;
          transform: scale(1.45);
          filter: drop-shadow(0 0 10px var(--gold-glow));
        }
        .chart-tooltip { pointer-events: none; }
        .tooltip-stem {
          stroke: hsla(38,72%,58%,0.42);
          stroke-width: 1.4;
          stroke-linecap: round;
        }
        .tooltip-bg {
          fill: rgba(10,10,14,0.98);
          stroke: hsla(38,72%,58%,0.3);
          stroke-width: 1;
          filter: drop-shadow(0 8px 18px rgba(0,0,0,0.45));
        }
        .tooltip-text {
          fill: var(--text-primary);
          font-size: 13px;
          font-weight: 800;
          text-anchor: middle;
          dominant-baseline: middle;
        }
        .tooltip-unit {
          fill: var(--text-secondary);
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .chart-insight-rail { display: flex; flex-direction: column; gap: 12px; }
        .insight-card {
          flex: 1;
          min-height: 0;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
        }
        .insight-card-primary {
          background: linear-gradient(180deg, var(--gold-dim), rgba(255,255,255,0.025));
          border-color: hsla(38,72%,58%,0.15);
        }
        .insight-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text-muted);
          font-weight: 800;
        }
        .insight-value { font-size: 30px; line-height: 1; letter-spacing: -0.05em; }
        .insight-meta { color: var(--text-secondary); font-size: 13px; line-height: 1.55; }

        .subject-analytics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          padding-top: 4px;
        }
        .subject-analytics-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          padding: 14px 16px;
          border-radius: var(--r-lg);
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--glass-border);
        }
        .subject-analytics-copy {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 12px;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.4;
        }
        .subject-analytics-name {
          font-weight: 800;
          min-width: 0;
        }
        .subject-analytics-copy span:last-child {
          overflow-wrap: anywhere;
          text-align: right;
        }
        .subject-analytics-track {
          height: 7px;
          border-radius: var(--r-pill);
          background: rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .subject-analytics-fill {
          display: block;
          height: 100%;
          border-radius: inherit;
        }

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
          gap: 22px;
          align-items: start;
        }

        .form-summary-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .summary-pill {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .summary-pill-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text-muted);
          font-weight: 800;
        }
        .summary-pill strong { font-size: 20px; letter-spacing: -0.03em; }
        .quick-log-dock {
          display: grid;
          grid-template-columns: minmax(132px, 0.34fr) minmax(0, 1fr);
          gap: 12px;
          align-items: stretch;
          padding: 12px;
          border-radius: 20px;
          background:
            radial-gradient(circle at 12% 0%, var(--gold-dim), transparent 42%),
            rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
        }
        .quick-log-label {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 6px;
          min-width: 0;
          padding: 4px 4px 4px 6px;
        }
        .quick-log-label span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--gold);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .quick-log-label strong {
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 800;
        }
        .quick-log-actions {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .quick-log-btn {
          min-width: 0;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          background: rgba(0,0,0,0.22);
          color: var(--text-primary);
          padding: 10px 11px;
          font: inherit;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 5px;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .quick-log-btn svg { color: var(--gold); flex-shrink: 0; }
        .quick-log-btn span {
          font-size: 12px;
          font-weight: 900;
          line-height: 1.1;
        }
        .quick-log-btn small {
          max-width: 100%;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .quick-log-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: hsla(38,72%,58%,0.28);
          background: var(--gold-dim);
        }
        .quick-copy-btn svg { color: var(--botany); }
        .quick-log-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
        }
        .daily-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .daily-meta-card {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 86px;
          gap: 12px 14px;
          align-items: center;
          padding: 16px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.075);
        }
        .daily-meta-copy {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .daily-meta-kicker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .daily-meta-copy strong {
          font-size: 26px;
          line-height: 1;
          letter-spacing: -0.05em;
        }
        .meta-range {
          grid-column: 1 / -1;
          width: 100%;
          accent-color: var(--gold);
        }
        .discipline-range { accent-color: var(--botany); }
        .completion-range { accent-color: var(--rose-bright); }
        .meta-number-input {
          width: 86px;
          border: 1px solid var(--glass-border);
          border-radius: 13px;
          background: rgba(0,0,0,0.34);
          color: var(--text-primary);
          padding: 10px 12px;
          font: inherit;
          font-weight: 800;
          text-align: center;
        }
        .meta-number-input:focus,
        .screen-input:focus,
        .screen-note:focus {
          outline: none;
          border-color: var(--gold);
          box-shadow: 0 0 0 3px var(--gold-dim);
        }
        .subjects-list { display: flex; flex-direction: column; gap: 14px; }
        .empty-state { padding: 20px; text-align: center; color: var(--text-muted); font-style: italic; }
        .subject-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          padding: 18px 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 20px;
          transition: all 0.28s ease;
        }
        .subject-row:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.1);
          transform: translateY(-2px);
        }
        .subject-row-active {
          border-color: hsla(38,72%,58%,0.22);
          box-shadow: inset 0 0 0 1px var(--gold-dim);
        }
        .subject-info { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1 1 160px; }
        .subject-avatar {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .emoji { font-size: 22px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)); }
        .subject-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .name { font-weight: 700; font-size: 15px; letter-spacing: 0.01em; }
        .subject-tag { font-size: 12px; color: var(--text-muted); }
        .inputs-group { display: flex; gap: 12px; align-items: flex-end; flex: 0 0 auto; }
        .input-field { position: relative; display: flex; align-items: center; flex-direction: column; gap: 8px; }
        .input-label {
          width: 100%;
          text-align: left;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }
        .glass-input {
          width: 90px;
          background: rgba(0,0,0,0.4);
          border: 1px solid var(--glass-border);
          color: var(--text-primary);
          border-radius: 12px;
          padding: 10px 32px 10px 14px;
          font-family: inherit;
          font-size: 15px;
          font-weight: 600;
          transition: all 0.2s;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .glass-input:focus {
          outline: none;
          border-color: var(--gold);
          background: rgba(0,0,0,0.55);
          box-shadow: 0 0 0 3px var(--gold-dim), inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .glass-input::placeholder { color: rgba(255,255,255,0.15); }
        .glass-input::-webkit-outer-spin-button,
        .glass-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .input-suffix {
          position: absolute;
          right: 12px;
          top: 34px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          pointer-events: none;
          text-transform: uppercase;
        }
        .quick-subject-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex: 0 1 184px;
          flex-wrap: wrap;
        }
        .quick-subject-chip {
          min-height: 31px;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 999px;
          background: rgba(255,255,255,0.035);
          color: var(--text-secondary);
          padding: 7px 9px;
          font: inherit;
          font-size: 11px;
          font-weight: 850;
          cursor: pointer;
          transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }
        .quick-subject-chip:hover {
          color: var(--gold);
          border-color: hsla(38,72%,58%,0.26);
          background: var(--gold-dim);
          transform: translateY(-1px);
        }
        .quick-clear-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 31px;
          padding: 0;
          color: var(--text-muted);
        }
        .quick-clear-chip:hover {
          color: var(--rose-bright);
          border-color: hsla(352,52%,54%,0.26);
          background: var(--rose-dim);
        }
        .save-btn {
          margin-top: 10px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: linear-gradient(135deg, var(--gold), var(--rose));
          color: var(--bg-void);
          border: none;
          padding: 18px;
          border-radius: var(--r-xl);
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 10px 28px var(--gold-glow);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .save-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px var(--gold-glow);
        }
        .save-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
        .save-btn.saved { background: linear-gradient(135deg, var(--success), var(--botany)); box-shadow: 0 10px 28px var(--botany-glow); }

        .heatmap-panel {
          overflow: hidden;
          gap: 16px;
          padding: 26px;
        }
        .heatmap-header { align-items: center; }
        .heatmap-callout {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: flex-end;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .heatmap-callout-label {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted);
          font-weight: 800;
        }
        .heatmap-callout strong { font-size: 20px; letter-spacing: -0.03em; }
        .heatmap-callout-meta { font-size: 12px; color: var(--text-secondary); }
        .heatmap-meta-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .heatmap-meta-card {
          padding: 14px 16px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
          border: 1px solid rgba(255,255,255,0.07);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .heatmap-meta-kicker {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text-muted);
          font-weight: 800;
        }
        .heatmap-meta-card strong { font-size: 18px; letter-spacing: -0.03em; }
        .heatmap-month-row {
          display: grid;
          grid-template-columns: repeat(${weeks.length}, minmax(14px, 1fr));
          gap: 5px;
          margin: 2px 0 -2px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .heatmap-month-row span { white-space: nowrap; }
        .heatmap-container-wrap {
          overflow-x: auto;
          padding: 12px 12px 14px;
          border-radius: var(--r-lg);
          background:
            radial-gradient(circle at 12% 10%, rgba(255,255,255,0.045), transparent 30%),
            rgba(0,0,0,0.16);
          border: 1px solid rgba(255,255,255,0.055);
          mask-image: linear-gradient(90deg, rgba(0,0,0,1) 94%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,1) 94%, transparent 100%);
        }
        .heatmap-container-wrap::-webkit-scrollbar { height: 8px; }
        .heatmap-container-wrap::-webkit-scrollbar-thumb { background: var(--glass-border-mid); border-radius: 10px; }
        .heatmap-container-wrap::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 10px; }
        .heatmap-grid { display: flex; gap: 5px; width: max-content; padding-bottom: 12px; }
        .heatmap-col { display: flex; flex-direction: column; gap: 5px; }
        .heat-cell {
          width: 15px;
          height: 15px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.03);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
          cursor: crosshair;
          padding: 0;
        }
        .emoji-heat-cell {
          position: relative;
          display: grid;
          place-items: center;
          overflow: visible;
          border-color: rgba(255,255,255,0.06);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
        }
        .heat-emoji {
          font-size: 9px;
          line-height: 1;
          transform: translateY(-0.5px);
          filter: saturate(1.05) drop-shadow(0 1px 3px rgba(0,0,0,0.48));
          animation: heatBreath 3.6s ease-in-out infinite;
        }
        .tier-4 .heat-emoji,
        .tier-5 .heat-emoji,
        .tier-6 .heat-emoji {
          animation-duration: 2.4s;
        }
        .heat-cell-empty {
          visibility: hidden;
          pointer-events: none;
        }
        .heat-cell:hover {
          transform: scale(1.45);
          border-color: rgba(255,255,255,0.85);
          z-index: 10;
          position: relative;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .heatmap-footer {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid var(--glass-border);
        }
        .heatmap-legend {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: var(--text-muted);
          justify-content: space-between;
          font-weight: 700;
          flex-wrap: wrap;
        }
        .legend-colors { display: flex; gap: 5px; }
        .legend-cell {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          display: grid;
          place-items: center;
          font-size: 9px;
          line-height: 1;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .emoji-legend-cell { width: 18px; height: 18px; border-radius: 6px; }
        .heatmap-hover-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          color: var(--text-secondary);
        }
        .heatmap-hover-card strong { color: var(--text-primary); }

        .screen-panel {
          overflow: hidden;
        }
        .screen-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .screen-summary-card {
          padding: 18px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
          border: 1px solid rgba(255,255,255,0.07);
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
        }
        .screen-summary-card span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.13em;
        }
        .screen-summary-card strong {
          font-size: 30px;
          line-height: 1;
          letter-spacing: -0.05em;
        }
        .screen-summary-card small {
          color: var(--text-secondary);
          line-height: 1.45;
        }
        .screen-danger { border-color: hsla(352,52%,54%,0.2); background: linear-gradient(180deg, var(--rose-dim), rgba(255,255,255,0.018)); }
        .screen-study { border-color: hsla(142,60%,48%,0.22); background: linear-gradient(180deg, var(--botany-dim), rgba(255,255,255,0.018)); }
        .screen-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
          gap: 18px;
          align-items: start;
        }
        .screen-form-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .screen-app-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .screen-group-title {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .screen-app-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .screen-app-card {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) 74px;
          gap: 10px;
          align-items: center;
          padding: 12px;
          border-radius: 18px;
          background: rgba(255,255,255,0.028);
          border: 1px solid rgba(255,255,255,0.065);
          transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }
        .screen-app-card:hover {
          border-color: rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.045);
          transform: translateY(-1px);
        }
        .app-logo {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: white;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: -0.02em;
          box-shadow: 0 10px 24px rgba(0,0,0,0.26);
        }
        .screen-app-copy {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 3px;
        }
        .screen-app-copy span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 850;
        }
        .screen-app-copy small {
          color: var(--text-muted);
          font-size: 11px;
        }
        .screen-input {
          width: 74px;
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          background: rgba(0,0,0,0.34);
          color: var(--text-primary);
          padding: 9px 10px;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
        }
        .screen-input::-webkit-outer-spin-button,
        .screen-input::-webkit-inner-spin-button,
        .meta-number-input::-webkit-outer-spin-button,
        .meta-number-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .screen-input,
        .meta-number-input {
          appearance: textfield;
          -moz-appearance: textfield;
        }
        .screen-note {
          width: 100%;
          resize: vertical;
          border: 1px solid var(--glass-border);
          border-radius: 18px;
          background: rgba(0,0,0,0.28);
          color: var(--text-primary);
          padding: 14px 16px;
          font: inherit;
          line-height: 1.5;
        }
        .screen-note::placeholder { color: rgba(255,255,255,0.22); }
        .screen-save-btn { margin-top: 0; }
        .screen-chart-card {
          min-height: 0;
          padding: clamp(14px, 1.8vw, 18px);
          border-radius: 22px;
          background:
            radial-gradient(circle at 15% 0%, var(--rose-dim), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.08));
          border: 1px solid rgba(255,255,255,0.07);
        }
        .screen-chart-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .screen-chart-header div {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }
        .screen-chart-header span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .screen-chart-header small {
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          line-height: 1.35;
        }
        .screen-chart-header strong {
          color: var(--gold);
          font-size: 14px;
          white-space: nowrap;
        }
        .screen-chart {
          display: flex;
          flex-direction: column;
          gap: clamp(7px, 1vw, 10px);
          max-height: clamp(220px, 42vh, 420px);
          overflow: auto;
          padding-right: 4px;
        }
        .screen-range-7d .screen-chart { max-height: none; }
        .screen-range-month .screen-chart { max-height: 310px; }
        .screen-range-year .screen-chart { max-height: 390px; }
        .screen-bar-row {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr) 42px;
          align-items: center;
          gap: 10px;
          color: var(--text-secondary);
          font-size: 12px;
          opacity: 0.64;
          transition: opacity 0.2s ease;
        }
        .screen-bar-row-active { opacity: 1; }
        .screen-bar-date,
        .screen-bar-total {
          font-weight: 800;
          white-space: nowrap;
        }
        .screen-range-month .screen-bar-row,
        .screen-range-year .screen-bar-row {
          grid-template-columns: minmax(70px, 0.22fr) minmax(0, 1fr) 42px;
        }
        .screen-bar-total { text-align: right; color: var(--text-muted); }
        .screen-bar-track {
          position: relative;
          height: clamp(10px, 1.3vw, 13px);
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .screen-bar-fill {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          border-radius: inherit;
        }
        .screen-bar-distraction {
          background: linear-gradient(90deg, var(--rose), var(--rose-bright));
          opacity: 0.78;
        }
        .screen-bar-study {
          background: linear-gradient(90deg, var(--botany), var(--gold));
          opacity: 0.9;
          mix-blend-mode: screen;
        }
        .ai-discipline-panel {
          background:
            radial-gradient(circle at 8% 10%, var(--gold-dim), transparent 34%),
            var(--glass-mid);
        }
        .ai-run-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid hsla(38,72%,58%,0.28);
          border-radius: 999px;
          background: var(--gold-dim);
          color: var(--gold);
          padding: 10px 14px;
          font: inherit;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .ai-run-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          background: hsla(38,72%,58%,0.16);
        }
        .ai-run-btn:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .ai-insight-box {
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.075);
          background: rgba(0,0,0,0.26);
          padding: 18px;
          color: var(--text-secondary);
          line-height: 1.7;
          overflow: auto;
        }
        .ai-insight-box pre {
          margin: 0;
          white-space: pre-wrap;
          color: var(--text-primary);
          font: inherit;
        }
        .ai-insight-box p { margin: 0; }
        .ai-report {
          display: grid;
          gap: 10px;
        }
        .ai-report-line {
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.65;
        }
        .ai-report-labelled {
          display: grid;
          grid-template-columns: minmax(118px, 0.22fr) minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          padding-bottom: 9px;
          border-bottom: 1px solid rgba(255,255,255,0.055);
        }
        .ai-report-labelled span {
          color: var(--gold);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .ai-report-action {
          padding: 9px 12px;
          border-radius: 14px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.06);
          color: var(--text-primary);
        }
        .ai-error { color: var(--rose-bright); }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: var(--text-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .animate-fade-in { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
        .animate-slide-up { opacity: 0; transform: translateY(20px); animation: slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }

        @keyframes pulseWarning {
          0% { filter: drop-shadow(0 0 5px var(--gold-glow)); transform: scale(1); }
          100% { filter: drop-shadow(0 0 18px var(--gold)); transform: scale(1.15); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.62; }
          50% { opacity: 1; }
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes heatBreath {
          0%, 100% { transform: translateY(-0.5px) scale(0.92); opacity: 0.72; }
          50% { transform: translateY(-1px) scale(1.12); opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.05); }
        }
        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes slideUp { to { opacity: 1; transform: translateY(0); } }
        @keyframes drawLine { to { stroke-dashoffset: 0; } }

        @media (max-width: 1180px) {
          .main-grid { grid-template-columns: 1fr; }
          .chart-layout { grid-template-columns: 1fr; }
          .subject-analytics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .screen-layout { grid-template-columns: 1fr; }
        }

        @media (max-width: 900px) {
          .goals-page { padding: 32px 18px 136px; }
          .content-wrapper { gap: 22px; }
          .hero-band { grid-template-columns: 1fr; padding: 24px; }
          .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .metric-card { padding: 22px; }
          .glass-panel { padding: 24px; }
          .panel-header { gap: 14px; flex-wrap: wrap; }
          .chart-header { align-items: flex-start; }
          .chart-control-stack { justify-content: flex-start; }
          .heatmap-callout { align-items: flex-start; }
          .main-grid { grid-template-columns: 1fr !important; }
          .screen-summary-grid { grid-template-columns: 1fr; }
          .form-summary-strip { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .quick-log-dock { grid-template-columns: 1fr; }
          .quick-log-label { flex-direction: row; align-items: center; justify-content: space-between; }
          .heatmap-meta-row { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }

        @media (max-width: 700px) {
          .goals-page { padding: 24px 12px 148px; }
          .page-header { align-items: stretch; gap: 16px; }
          .date-picker-glass { width: 100%; justify-content: space-between; }
          .date-display { flex: 1; min-width: 0; justify-content: center; padding: 0 10px; font-size: 14px; }
          .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px; }
          .metric-card { padding: 20px; }
          .metric-icon-wrap { width: 56px; height: 56px; border-radius: 18px; }
          .metric-val { font-size: 30px; }
          .glass-panel { padding: 18px; gap: 18px; border-radius: 22px; }
          .panel-header h3 { font-size: 18px; }
          .panel-desc { font-size: 14px; }
          .chart-stat-badge { align-self: flex-start; }
          .metric-tabs,
          .range-tabs { width: 100%; border-radius: 18px; }
          .range-tab,
          .metric-tab { flex: 1; min-width: fit-content; }
          .form-summary-strip { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px; }
          .daily-meta-grid { grid-template-columns: 1fr; }
          .summary-pill { padding: 12px 10px; border-radius: 16px; }
          .summary-pill-label { font-size: 9px; letter-spacing: 0.08em; }
          .summary-pill strong { font-size: 18px; }
          .quick-log-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .quick-log-btn { min-height: 70px; }
          .subject-analytics { grid-template-columns: 1fr; }
          .heatmap-meta-row { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px; }
          .heatmap-meta-card { padding: 12px 10px; border-radius: 16px; }
          .heatmap-meta-kicker { font-size: 9px; letter-spacing: 0.08em; }
          .heatmap-meta-card strong { font-size: 15px; line-height: 1.2; }
          .subject-row { flex-direction: column; align-items: stretch; gap: 14px; padding: 14px; }
          .inputs-group { width: 100%; gap: 10px; }
          .input-field { flex: 1; }
          .glass-input { width: 100%; }
          .quick-subject-actions { justify-content: flex-start; flex: none; width: 100%; }
          .quick-subject-chip { flex: 1; }
          .quick-clear-chip { flex: 0 0 38px; width: 38px; }
          .screen-app-grid { grid-template-columns: 1fr; }
          .heatmap-legend { justify-content: space-between; flex-wrap: wrap; }
          .heatmap-month-row { display: none; }
          .heatmap-hover-card { flex-direction: column; align-items: flex-start; }
        }

        @media (max-width: 480px) {
          .title { font-size: 28px; }
          .subtitle { font-size: 14px; }
          .hero-title { font-size: 24px; }
          .hero-desc { font-size: 14px; }
          .hero-pulse-card { padding: 18px; }
          .date-picker-glass { padding: 4px; }
          .date-nav-btn { width: 34px; height: 34px; }
          .date-display { gap: 6px; font-size: 13px; }
          .line-chart { min-width: 640px; }
          .subjects-list { gap: 10px; }
          .emoji { font-size: 20px; }
          .name { font-size: 14px; }
          .glass-input { padding: 10px 30px 10px 12px; font-size: 14px; }
          .input-suffix { right: 10px; top: 34px; }
          .form-summary-strip,
          .heatmap-meta-row {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .form-summary-strip > :last-child,
          .heatmap-meta-row > :last-child {
            grid-column: 1 / -1;
          }
          .quick-log-dock { padding: 10px; }
          .quick-log-label { align-items: flex-start; flex-direction: column; gap: 5px; }
          .quick-log-actions { grid-template-columns: 1fr; }
          .quick-log-btn { min-height: 0; }
          .heatmap-grid { gap: 4px; }
          .heatmap-col { gap: 4px; }
          .heat-cell,
          .legend-cell { width: 12px; height: 12px; }
          .emoji-legend-cell { width: 16px; height: 16px; }
          .heat-emoji { font-size: 8px; }
          .screen-app-card { grid-template-columns: 38px minmax(0, 1fr) 66px; padding: 10px; }
          .app-logo { width: 38px; height: 38px; border-radius: 12px; }
          .screen-input { width: 66px; }
          .screen-bar-row { grid-template-columns: 52px minmax(0, 1fr) 36px; gap: 8px; }
          .ai-report-labelled { grid-template-columns: 1fr; gap: 4px; }
        }

        @media (max-width: 380px) {
          .metrics-grid,
          .form-summary-strip,
          .heatmap-meta-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
