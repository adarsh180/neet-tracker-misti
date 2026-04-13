"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { format, addDays, subDays as dateFnsSubDays } from "date-fns";
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
} from "lucide-react";

/* ---------- TYPES ---------- */
interface DailyGoalEntry {
  id: string;
  subjectId: string;
  date: string;
  hoursStudied: number;
  questionsSolved: number;
  notes: string | null;
  subject: { id: string; name: string; slug: string; color: string };
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
  questions: number;
}

interface GoalFormValue {
  hours: string;
  questions: string;
  notes: string;
}

type GoalFormState = Record<string, GoalFormValue>;
type PerformanceLabel = "Poor" | "Moderate" | "Good" | "Very Good" | "Chumma";

interface PerformanceBand {
  label: PerformanceLabel;
  score: number;
  accent: string;
  glowClass: string;
  cardClass: string;
}

/* ---------- LOGIC ---------- */
function getIntensity(hours: number, questions: number): number {
  const score = (hours / 12) * 0.5 + (questions / 500) * 0.5;
  if (score >= 1) return 4;
  if (score >= 0.6) return 3;
  if (score >= 0.35) return 2;
  if (score > 0) return 1;
  return 0;
}

const INTENSITY_COLORS = [
  "rgba(255,255,255,0.04)",
  "rgba(212,168,83,0.22)",
  "rgba(212,168,83,0.46)",
  "rgba(194,96,110,0.72)",
  "#d4a853",
];

function build365Heatmap(goals: DailyGoalEntry[]): HeatCell[] {
  const map: Record<string, { hours: number; questions: number }> = {};
  goals.forEach((g) => {
    const d = g.date.split("T")[0];
    if (!map[d]) map[d] = { hours: 0, questions: 0 };
    map[d].hours += g.hoursStudied;
    map[d].questions += g.questionsSolved;
  });

  const cells: HeatCell[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = format(dateFnsSubDays(new Date(), i), "yyyy-MM-dd");
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

function buildChartData(goals: DailyGoalEntry[], days = 14): ChartPoint[] {
  const map: Record<string, number> = {};
  goals.forEach((g) => {
    const d = g.date.split("T")[0];
    if (!map[d]) map[d] = 0;
    map[d] += g.questionsSolved;
  });

  const data: ChartPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const targetDate = dateFnsSubDays(new Date(), i);
    const dateStr = format(targetDate, "yyyy-MM-dd");
    data.push({
      date: dateStr,
      displayDate: format(targetDate, "MMM dd"),
      questions: map[dateStr] || 0,
    });
  }
  return data;
}

function getPerformanceBand(score: number): PerformanceBand {
  if (score >= 0.9) {
    return { label: "Chumma", score, accent: "var(--gold)", glowClass: "gold-glow", cardClass: "band-chumma" };
  }
  if (score >= 0.72) {
    return { label: "Very Good", score, accent: "#8bd3ff", glowClass: "blue-glow", cardClass: "band-very-good" };
  }
  if (score >= 0.5) {
    return { label: "Good", score, accent: "#86efac", glowClass: "soft-alt", cardClass: "band-good" };
  }
  if (score >= 0.25) {
    return { label: "Moderate", score, accent: "var(--text-primary)", glowClass: "gray-glow", cardClass: "band-moderate" };
  }
  return { label: "Poor", score, accent: "#fda4af", glowClass: "danger-glow", cardClass: "band-poor" };
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

export default function DailyGoalsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [goals, setGoals] = useState<DailyGoalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [form, setForm] = useState<GoalFormState>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [hoveredHeat, setHoveredHeat] = useState<HeatCell | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsData, goalsData] = await Promise.all([
        fetch("/api/subjects")
          .then(async (response) => (response.ok ? ((await response.json()) as Subject[]) : null))
          .catch(() => null),
        fetch("/api/daily-goals?days=365")
          .then(async (response) => (response.ok ? ((await response.json()) as DailyGoalEntry[]) : null))
          .catch(() => null),
      ]);

      if (subjectsData) setSubjects(subjectsData);
      if (goalsData) {
        const gs = goalsData;
        setGoals(gs);

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
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const heatCells = useMemo(() => build365Heatmap(goals), [goals]);
  const chartData = useMemo(() => buildChartData(goals, 14), [goals]);

  const handleSave = async () => {
    setSaving(true);
    const entries = Object.entries(form).filter(([, v]) => v.hours !== "" || v.questions !== "");

    await Promise.all(
      entries.map(([subjectId, v]) =>
        fetch("/api/daily-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectId,
            date: selectedDate,
            hoursStudied: parseFloat(v.hours) || 0,
            questionsSolved: parseInt(v.questions) || 0,
            notes: v.notes || null,
          }),
        }).catch(console.error)
      )
    );

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    fetchData();
  };

  const changeDate = (days: number) => {
    const cur = new Date(selectedDate);
    setSelectedDate(format(addDays(cur, days), "yyyy-MM-dd"));
  };

  const weeks: HeatCell[][] = [];
  let week: HeatCell[] = [];
  heatCells.forEach((cell) => {
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  if (week.length > 0) weeks.push(week);

  const todayTotalHours = Object.values(form).reduce((s: number, v) => s + (parseFloat(v.hours) || 0), 0);
  const todayTotalQs = Object.values(form).reduce((s: number, v) => s + (parseInt(v.questions) || 0), 0);
  const filledSubjects = Object.values(form).filter((v) => v.hours !== "" || v.questions !== "").length;
  const activeDays14 = chartData.filter((d) => d.questions > 0).length;
  const avgQuestions14 = Math.round(chartData.reduce((sum, d) => sum + d.questions, 0) / chartData.length);
  const bestChartPoint = chartData.reduce((best, current) => (current.questions > best.questions ? current : best), chartData[0]);
  const activeDays30 = heatCells.slice(-30).filter((cell) => cell.intensity > 0).length;
  const currentStreak = getCurrentStreak(goals);
  const subjectCoverage = subjects.length > 0 ? filledSubjects / subjects.length : 0;
  const dailyPerformanceScore = Math.min(1, todayTotalHours / 12 * 0.4 + todayTotalQs / 500 * 0.4 + subjectCoverage * 0.2);
  const consistencyScore = Math.min(1, activeDays14 / 14 * 0.45 + activeDays30 / 30 * 0.35 + Math.min(currentStreak, 10) / 10 * 0.2);
  const intensityBand = getPerformanceBand(dailyPerformanceScore);
  const consistencyBand = getPerformanceBand(consistencyScore);
  const monthMarkers = weeks
    .map((currentWeek, index) => ({
      index,
      label: format(new Date(currentWeek[0].date), "MMM"),
    }))
    .filter((marker, index, all) => index === 0 || marker.label !== all[index - 1].label);

  const chartWidth = 1000;
  const chartHeight = 240;
  const padX = 42;
  const padY = 30;
  const usableW = chartWidth - padX * 2;
  const usableH = chartHeight - padY * 2;
  const maxChartQ = Math.max(...chartData.map((d) => d.questions), 50);

  const chartPoints = chartData.map((d, i) => {
    const x = padX + (i / (chartData.length - 1)) * usableW;
    const y = chartHeight - padY - (d.questions / maxChartQ) * usableH;
    return { x, y, ...d };
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
              <span className="eyebrow-copy">Plan with intent. Log with precision.</span>
            </div>
            <h1 className="title gradient-text">Daily Forging</h1>
            <p className="subtitle">Execute your routine. Read the pattern. Improve the system.</p>
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
            <span className="hero-kicker">Today’s command center</span>
            <h2 className="hero-title">Log your work, read the pattern, and stay brutally consistent.</h2>
            <p className="hero-desc">
              This layout turns the page into a dense dashboard: daily entry, performance line, and annual heatmap live in one frame so the rhythm is easy to see.
            </p>
            <div className="hero-mini-row">
              <div className="mini-chip">
                <Sparkles size={14} />
                <span>{filledSubjects} subjects touched</span>
              </div>
              <div className="mini-chip">
                <Target size={14} />
                <span>{activeDays14}/14 active days</span>
              </div>
              <div className="mini-chip">
                <Activity size={14} />
                <span>{intensityBand.label} intensity</span>
              </div>
            </div>
          </div>

          <div className="hero-pulse-card">
            <div className="hero-pulse-label">Current pulse</div>
            <div className="hero-pulse-value">{intensityBand.label}</div>
            <div className="hero-pulse-meta">
              <span>{filledSubjects}/{Math.max(subjects.length, 1)} subjects logged</span>
              <span>{activeDays14} active days in the last 14</span>
              <span>{avgQuestions14} avg questions per day</span>
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
              <p className="panel-desc">Questions solved over the last 14 days.</p>
            </div>
            <div className="chart-stat-badge">
              Max: <span>{maxChartQ} Qs</span>
            </div>
          </div>

          <div className="chart-layout">
            <div className="chart-container">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="line-chart">
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(212,168,83,0.34)" />
                    <stop offset="100%" stopColor="rgba(212,168,83,0.0)" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {[0, 0.5, 1].map((ratio) => {
                  const y = chartHeight - padY - ratio * usableH;
                  return (
                    <g key={ratio} className="grid-line-group">
                      <line x1={padX} y1={y} x2={chartWidth - padX} y2={y} className="grid-line" />
                      <text x={padX - 12} y={y + 4} className="axis-label y-axis">
                        {Math.round(ratio * maxChartQ)}
                      </text>
                    </g>
                  );
                })}

                <path d={areaD} fill="url(#areaGradient)" className="chart-area" />
                <path d={lineD} fill="none" className="chart-line" filter="url(#glow)" />

                {chartPoints.map((p, i) => (
                  <g key={i} onMouseEnter={() => setHoveredPoint(i)} onMouseLeave={() => setHoveredPoint(null)} className="point-group">
                    <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={hoveredPoint === i ? "6" : "4"} className={`chart-point ${hoveredPoint === i ? "point-hovered" : ""}`} />

                    {i % 3 === 0 && (
                      <text x={p.x} y={chartHeight - 10} className="axis-label x-axis">
                        {p.displayDate}
                      </text>
                    )}

                    {hoveredPoint === i && (
                      <g className="chart-tooltip">
                        <rect x={p.x - 44} y={p.y - 48} width="88" height="30" rx="10" className="tooltip-bg" />
                        <text x={p.x} y={p.y - 28} className="tooltip-text">
                          {p.questions} Qs
                        </text>
                      </g>
                    )}
                  </g>
                ))}
              </svg>
            </div>

            <div className="chart-insight-rail">
              <div className="insight-card insight-card-primary">
                <span className="insight-label">Average / day</span>
                <strong className="insight-value">{avgQuestions14}</strong>
                <span className="insight-meta">questions across the last 14 days</span>
              </div>
              <div className="insight-card">
                <span className="insight-label">Best day</span>
                <strong className="insight-value">{bestChartPoint.questions}</strong>
                <span className="insight-meta">{bestChartPoint.displayDate}</span>
              </div>
              <div className="insight-card">
                <span className="insight-label">Active cadence</span>
                <strong className="insight-value">{activeDays14}/14</strong>
                <span className="insight-meta">days with recorded question practice</span>
              </div>
            </div>
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
                          onChange={(ev) => setForm((f) => ({ ...f, [s.id]: { ...e, hours: ev.target.value } }))}
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
                          onChange={(ev) => setForm((f) => ({ ...f, [s.id]: { ...e, questions: ev.target.value } }))}
                          className="glass-input"
                        />
                        <span className="input-suffix">qs</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className={`save-btn ${saved ? "saved" : ""}`} onClick={handleSave} disabled={saving || loading}>
              {saved ? (
                <>
                  <CheckCircle2 size={18} /> Recorded
                </>
              ) : saving ? (
                <>
                  <span className="spinner" /> Saving...
                </>
              ) : (
                <>
                  <Save size={18} /> Forge Daily Goal
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
                <p className="panel-desc">A full-year field view of your logged effort density.</p>
              </div>
              <div className={`heatmap-callout ${consistencyBand.cardClass}`}>
                <span className="heatmap-callout-label">Consistency</span>
                <strong>{consistencyBand.label}</strong>
                <span className="heatmap-callout-meta">{activeDays30} active days in the last 30</span>
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
                    {w.map((c) => (
                      <button
                        key={c.date}
                        className="heat-cell"
                        style={{ backgroundColor: INTENSITY_COLORS[c.intensity] }}
                        title={`${c.date}: ${c.totalHours} hrs, ${c.totalQuestions} qs`}
                        onMouseEnter={() => setHoveredHeat(c)}
                        onMouseLeave={() => setHoveredHeat(null)}
                        type="button"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="heatmap-footer">
              <div className="heatmap-legend">
                <span>Rest</span>
                <div className="legend-colors">
                  {INTENSITY_COLORS.map((color, i) => (
                    <div key={i} className="legend-cell" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <span>Peak</span>
              </div>
              <div className="heatmap-hover-card">
                {hoveredHeat ? (
                  <>
                    <strong>{format(new Date(hoveredHeat.date), "MMM dd")}</strong>
                    <span>{hoveredHeat.totalHours} hrs · {hoveredHeat.totalQuestions} qs</span>
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
      </div>

      <style jsx>{`
        :root {
          --bg-color: #050508;
          --bg-soft: #090a0f;
          --text-primary: #f3f4f6;
          --text-secondary: #a1a1aa;
          --text-muted: #71717a;
          --glass-bg: rgba(13, 14, 20, 0.72);
          --glass-border: rgba(255, 255, 255, 0.08);
          --glass-border-mid: rgba(255, 255, 255, 0.14);
          --gold: #d4a853;
          --blue: #60a5fa;
          --purple: #c084fc;
          --r-lg: 14px;
          --r-xl: 18px;
          --r-2xl: 26px;
        }

        .goals-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(192, 132, 252, 0.08), transparent 30%),
            radial-gradient(circle at top right, rgba(212, 168, 83, 0.09), transparent 28%),
            linear-gradient(180deg, #030304 0%, #07080b 35%, #050508 100%);
          padding: 40px 24px 88px;
          position: relative;
          color: var(--text-primary);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
          background: var(--purple);
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
          background: var(--blue);
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
          background: linear-gradient(to right, #fff, #bbb);
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
            radial-gradient(circle at top left, rgba(212,168,83,0.14), transparent 34%),
            radial-gradient(circle at bottom right, rgba(96,165,250,0.09), transparent 25%),
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
          background: rgba(212,168,83,0.08);
          border: 1px solid rgba(212,168,83,0.16);
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
          background: var(--glass-bg);
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
        .peak-card { border-color: rgba(212,168,83,0.3); background: linear-gradient(180deg, rgba(212,168,83,0.05) 0%, rgba(15,15,20,0.7) 100%); }
        .metric-icon-wrap {
          width: 60px;
          height: 60px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .blue-glow { background: hsla(210, 80%, 60%, 0.15); color: var(--blue); box-shadow: inset 0 0 20px hsla(210, 80%, 60%, 0.1); }
        .soft-alt { background: hsla(160, 45%, 50%, 0.14); color: #86efac; box-shadow: inset 0 0 20px rgba(134,239,172,0.1); }
        .purple-glow { background: hsla(285, 60%, 60%, 0.15); color: var(--purple); box-shadow: inset 0 0 20px hsla(285, 60%, 60%, 0.1); }
        .gold-glow { background: hsla(38, 90%, 55%, 0.15); color: var(--gold); box-shadow: inset 0 0 20px hsla(38, 90%, 55%, 0.2); }
        .gray-glow { background: hsla(0, 0%, 50%, 0.1); color: var(--text-secondary); }
        .danger-glow { background: rgba(244, 114, 182, 0.14); color: #fda4af; box-shadow: inset 0 0 20px rgba(253,164,175,0.12); }
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
        .band-poor { border-color: rgba(253,164,175,0.22); background: linear-gradient(180deg, rgba(253,164,175,0.05) 0%, rgba(15,15,20,0.7) 100%); }
        .band-moderate { border-color: rgba(255,255,255,0.12); }
        .band-good { border-color: rgba(134,239,172,0.24); background: linear-gradient(180deg, rgba(134,239,172,0.05) 0%, rgba(15,15,20,0.7) 100%); }
        .band-very-good { border-color: rgba(139,211,255,0.24); background: linear-gradient(180deg, rgba(139,211,255,0.06) 0%, rgba(15,15,20,0.7) 100%); }
        .band-chumma { border-color: rgba(212,168,83,0.3); background: linear-gradient(180deg, rgba(212,168,83,0.05) 0%, rgba(15,15,20,0.7) 100%); }

        .glass-panel {
          background: var(--glass-bg);
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

        .chart-panel { padding-bottom: 24px; }
        .chart-header { align-items: center; }
        .chart-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(240px, 0.68fr);
          gap: 18px;
          align-items: stretch;
        }
        .chart-stat-badge {
          background: rgba(212,168,83,0.1);
          border: 1px solid rgba(212,168,83,0.3);
          color: var(--gold);
          padding: 6px 12px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }
        .chart-stat-badge span { font-weight: 800; }
        .chart-container {
          width: 100%;
          position: relative;
          overflow-x: auto;
          overflow-y: visible;
          padding-bottom: 10px;
        }
        .chart-container::-webkit-scrollbar { height: 8px; }
        .chart-container::-webkit-scrollbar-thumb { background: var(--glass-border-mid); border-radius: 999px; }
        .line-chart { width: 100%; min-width: 760px; height: auto; display: block; overflow: visible; }
        .grid-line { stroke: rgba(255,255,255,0.05); stroke-width: 1; stroke-dasharray: 4 4; }
        .axis-label { fill: var(--text-muted); font-size: 12px; font-weight: 600; }
        .y-axis { text-anchor: end; alignment-baseline: middle; }
        .x-axis { text-anchor: middle; }
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
          fill: var(--bg-color);
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
          filter: drop-shadow(0 0 10px rgba(212,168,83,0.8));
        }
        .chart-tooltip { pointer-events: none; }
        .tooltip-bg { fill: rgba(15,15,20,0.95); stroke: var(--glass-border-mid); stroke-width: 1; }
        .tooltip-text { fill: #fff; font-size: 13px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; }
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
          background: linear-gradient(180deg, rgba(212,168,83,0.09), rgba(255,255,255,0.025));
          border-color: rgba(212,168,83,0.15);
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

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
          gap: 22px;
          align-items: stretch;
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
          border-color: rgba(212,168,83,0.22);
          box-shadow: inset 0 0 0 1px rgba(212,168,83,0.06);
        }
        .subject-info { display: flex; align-items: center; gap: 14px; min-width: 0; }
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
        .inputs-group { display: flex; gap: 12px; align-items: flex-end; }
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
          color: white;
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
          box-shadow: 0 0 0 3px rgba(212,168,83,0.15), inset 0 2px 4px rgba(0,0,0,0.2);
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
        .save-btn {
          margin-top: 10px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: linear-gradient(135deg, hsla(38, 90%, 50%, 0.92), hsla(285, 60%, 55%, 0.92));
          color: white;
          border: none;
          padding: 18px;
          border-radius: var(--r-xl);
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 10px 28px rgba(212, 168, 83, 0.24);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .save-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(212, 168, 83, 0.34);
        }
        .save-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
        .save-btn.saved { background: linear-gradient(135deg, #059669, #10b981); box-shadow: 0 10px 28px rgba(16, 185, 129, 0.26); }

        .heatmap-panel { overflow: hidden; }
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
          margin-bottom: 10px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .heatmap-month-row span { white-space: nowrap; }
        .heatmap-container-wrap {
          overflow-x: auto;
          padding: 8px 4px 12px;
          border-radius: var(--r-lg);
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
        .heat-cell:hover {
          transform: scale(1.45);
          border-color: rgba(255,255,255,0.85);
          z-index: 10;
          position: relative;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .heatmap-footer {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-top: 16px;
          border-top: 1px solid var(--glass-border);
        }
        .heatmap-legend {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--text-muted);
          justify-content: flex-end;
          font-weight: 600;
        }
        .legend-colors { display: flex; gap: 5px; }
        .legend-cell { width: 14px; height: 14px; border-radius: 4px; }
        .heatmap-hover-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          color: var(--text-secondary);
        }
        .heatmap-hover-card strong { color: var(--text-primary); }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .animate-fade-in { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
        .animate-slide-up { opacity: 0; transform: translateY(20px); animation: slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }

        @keyframes pulseWarning {
          0% { filter: drop-shadow(0 0 5px rgba(212,168,83,0.5)); transform: scale(1); }
          100% { filter: drop-shadow(0 0 18px rgba(212,168,83,1)); transform: scale(1.15); }
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
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
        }

        @media (max-width: 900px) {
          .goals-page { padding: 32px 18px 80px; }
          .content-wrapper { gap: 22px; }
          .hero-band { grid-template-columns: 1fr; padding: 24px; }
          .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .metric-card { padding: 22px; }
          .glass-panel { padding: 24px; }
          .panel-header { gap: 14px; flex-wrap: wrap; }
          .chart-header { align-items: flex-start; }
          .heatmap-callout { align-items: flex-start; }
        }

        @media (max-width: 700px) {
          .goals-page { padding: 24px 14px 72px; }
          .page-header { align-items: stretch; gap: 16px; }
          .date-picker-glass { width: 100%; justify-content: space-between; }
          .date-display { flex: 1; min-width: 0; justify-content: center; padding: 0 10px; font-size: 14px; }
          .metrics-grid { grid-template-columns: 1fr; gap: 14px; }
          .metric-card { padding: 20px; }
          .metric-icon-wrap { width: 56px; height: 56px; border-radius: 18px; }
          .metric-val { font-size: 30px; }
          .glass-panel { padding: 20px; gap: 18px; }
          .panel-header h3 { font-size: 18px; }
          .panel-desc { font-size: 14px; }
          .chart-stat-badge { align-self: flex-start; }
          .form-summary-strip { grid-template-columns: 1fr; }
          .heatmap-meta-row { grid-template-columns: 1fr; }
          .subject-row { flex-direction: column; align-items: stretch; gap: 14px; padding: 14px 16px; }
          .inputs-group { width: 100%; gap: 10px; }
          .input-field { flex: 1; }
          .glass-input { width: 100%; }
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
          .heatmap-grid { gap: 4px; }
          .heatmap-col { gap: 4px; }
          .heat-cell,
          .legend-cell { width: 12px; height: 12px; }
        }
      `}</style>
    </div>
  );
}
