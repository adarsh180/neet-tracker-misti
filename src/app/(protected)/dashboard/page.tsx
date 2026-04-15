"use client";

import { useEffect, useMemo, useState, useCallback, type CSSProperties } from "react";
import {
  Leaf,
  Zap,
  Microscope,
  Atom,
  TrendingUp,
  BookOpen,
  RefreshCw,
  Flame,
  Clock,
  CheckSquare,
  BarChart2,
  Sparkles,
  ArrowRight,
  Target,
  SmilePlus,
  Brain,
  Heart,
  Trophy,
  ChevronRight,
  Award,
  Activity,
  ShieldCheck,
  Radar,
  LucideIcon,
  Layers3,
  Gauge,
  CalendarDays,
} from "lucide-react";
import CountdownTimer from "@/components/countdown-timer";
import SmoothLink from "@/components/layout/smooth-link";

interface SubjectStat {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
  totalTopics: number;
  completedTopics: number;
  totalChapters: number;
  completedChapters: number;
  completionPct: number;
  totalQuestions: number;
  pendingRevisions: number;
  last7DaysHours: number;
}

interface DashboardMetrics {
  studentName: string;
  subjects: SubjectStat[];
  totalTopics: number;
  completedTopics: number;
  totalChapters: number;
  completedChapters: number;
  overallPct: number;
  totalStudyHours: number;
  totalQuestions: number;
  streak: number;
  pulse: number[];
  testCount: number;
  avgTestScore: number;
  activeDays14: number;
  recentHours7: number;
  recentQuestions7: number;
  momentumScore: number;
}

function getEmoji(pct: number) {
  if (pct >= 90) return "🏆";
  if (pct >= 75) return "🔥";
  if (pct >= 60) return "⭐";
  if (pct >= 40) return "📈";
  if (pct >= 20) return "🌱";
  return "🌀";
}

function getMessage(pct: number) {
  if (pct >= 90) return "Exceptional. AIIMS Delhi is in sight.";
  if (pct >= 75) return "Outstanding momentum. Keep pushing hard.";
  if (pct >= 60) return "Good progress — accelerate toward AIIMS.";
  if (pct >= 40) return "Steady. Intensify effort this week.";
  if (pct >= 20) return "You are behind — significant effort required.";
  return "Every great journey begins with the first step.";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildSparkline(values: number[], width = 320, height = 96) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);

  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 10) - 5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  botany: Leaf,
  zoology: Microscope,
  physics: Zap,
  chemistry: Atom,
};

const SUBJECT_META: Record<string, { gradient: string; glow: string; soft: string; ring: string }> = {
  botany: {
    gradient: "linear-gradient(135deg, hsl(142,60%,48%), hsl(160,55%,36%))",
    glow: "hsla(142,60%,48%,0.22)",
    soft: "hsla(142,60%,48%,0.12)",
    ring: "hsla(142,60%,48%,0.22)",
  },
  zoology: {
    gradient: "linear-gradient(135deg, hsl(38,88%,54%), hsl(28,80%,45%))",
    glow: "hsla(38,88%,54%,0.22)",
    soft: "hsla(38,88%,54%,0.12)",
    ring: "hsla(38,88%,54%,0.22)",
  },
  physics: {
    gradient: "linear-gradient(135deg, hsl(218,84%,62%), hsl(240,72%,52%))",
    glow: "hsla(218,84%,62%,0.22)",
    soft: "hsla(218,84%,62%,0.12)",
    ring: "hsla(218,84%,62%,0.22)",
  },
  chemistry: {
    gradient: "linear-gradient(135deg, hsl(270,68%,62%), hsl(285,56%,48%))",
    glow: "hsla(270,68%,62%,0.22)",
    soft: "hsla(270,68%,62%,0.12)",
    ring: "hsla(270,68%,62%,0.22)",
  },
};

const QUICK_SECTIONS = [
  {
    href: "/daily-goals",
    icon: Target,
    label: "Daily Goals",
    desc: "Log study hours, questions & consistency heatmap",
    color: "var(--rose-bright)",
    glow: "var(--rose-glow)",
    bg: "var(--rose-dim)",
    border: "hsla(352,65%,60%,0.24)",
    emoji: "🎯",
  },
  {
    href: "/tests",
    icon: BarChart2,
    label: "Test Records",
    desc: "Track mocks, AITS & analyze score trends vs cutoffs",
    color: "var(--physics)",
    glow: "var(--physics-glow)",
    bg: "var(--physics-dim)",
    border: "hsla(218,84%,62%,0.24)",
    emoji: "📊",
  },
  {
    href: "/ai-insights",
    icon: Sparkles,
    label: "AI Insights Hub",
    desc: "NEET-GURU, Rank Predictor, Quiz Engine & Planner",
    color: "var(--gold)",
    glow: "var(--gold-glow)",
    bg: "var(--gold-dim)",
    border: "hsla(38,72%,58%,0.24)",
    emoji: "✨",
  },
  {
    href: "/mood",
    icon: SmilePlus,
    label: "Mood Tracker",
    desc: "Daily wellness logging — energy, focus, stress & calendar",
    color: "var(--lotus-bright)",
    glow: "var(--lotus-glow)",
    bg: "var(--lotus-dim)",
    border: "hsla(285,50%,60%,0.24)",
    emoji: "🌙",
  },
  {
    href: "/ai-insights/neet-guru",
    icon: Brain,
    label: "NEET-GURU Chat",
    desc: "Chat with your strict AI mentor — reads all your data",
    color: "var(--gold)",
    glow: "var(--gold-glow)",
    bg: "var(--gold-dim)",
    border: "hsla(38,72%,58%,0.24)",
    emoji: "🧠",
  },
  {
    href: "/ai-insights/cycle-planner",
    icon: Heart,
    label: "Cycle Planner",
    desc: "Phase-aware study schedule based on your cycle & mood",
    color: "var(--rose-bright)",
    glow: "var(--rose-glow)",
    bg: "var(--rose-dim)",
    border: "hsla(352,65%,60%,0.24)",
    emoji: "🩷",
  },
  {
    href: "https://upsc-cse-tracker-adarsh.vercel.app/",
    icon: Award,
    label: "UPSC CSE Tracker",
    desc: "Switch to the UPSC Civil Services Examination Tracker",
    color: "var(--physics)",
    glow: "var(--physics-glow)",
    bg: "var(--physics-dim)",
    border: "hsla(218,84%,62%,0.24)",
    emoji: "🏛️",
  },
];

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/metrics");
      if (res.ok) setMetrics(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const overall = metrics?.overallPct ?? 0;
  const safeOverall = clamp(overall, 0, 100);

  const studyPulse = useMemo(() => {
    if (metrics?.pulse && metrics.pulse.length > 0) return metrics.pulse;
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }, [metrics]);

  const sparkPath = useMemo(() => buildSparkline(studyPulse), [studyPulse]);

  const globalStats = [
    { label: "Study Streak", value: metrics?.streak ?? 0, unit: "days", icon: Flame, color: "var(--rose-bright)" },
    { label: "Total Hours", value: Math.round(metrics?.totalStudyHours ?? 0), unit: "hours", icon: Clock, color: "var(--gold)" },
    { label: "Questions", value: metrics?.totalQuestions ?? 0, unit: "solved", icon: CheckSquare, color: "var(--botany)" },
    { label: "Tests Taken", value: metrics?.testCount ?? 0, unit: "recorded", icon: BarChart2, color: "var(--chemistry)" },
    { label: "Avg Test Score", value: `${(metrics?.avgTestScore ?? 0).toFixed(0)}%`, unit: "average", icon: Trophy, color: "var(--lotus-bright)" },
    { label: "Overall", value: `${safeOverall}%`, unit: "syllabus", icon: TrendingUp, color: "var(--physics)" },
  ];

  const donut = `${safeOverall} 100`;

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-bg">
        <div className="dashboard-orb dashboard-orb-1" />
        <div className="dashboard-orb dashboard-orb-2" />
        <div className="dashboard-orb dashboard-orb-3" />
        <div className="dashboard-orb dashboard-orb-4" />
        <div className="dashboard-grid" />
        <div className="dashboard-noise" />
        <div className="dashboard-vignette" />
      </div>

      <main className="dashboard-shell">
        <section className="db-hero">
          <div className="db-hero-left glass-panel hero-glow">
            <div className="db-kicker">
              <Sparkles size={14} />
              <span>Welcome back, {metrics?.studentName ?? "Misti"}</span>
            </div>

            <div className="db-hero-copy">
              <h1 className="page-title db-title">Sacred Dashboard</h1>
              <p className="page-subtitle db-subtitle">{getMessage(safeOverall)}</p>
            </div>

            <div className="db-hero-points">
              <div className="db-point">
                <span className="db-point-label">Completion</span>
                <span className="db-point-value">{safeOverall}%</span>
              </div>
              <div className="db-point">
                <span className="db-point-label">Topics Done</span>
                <span className="db-point-value">
                  {metrics?.completedTopics ?? 0} <span className="text-muted">/ {metrics?.totalTopics ?? 0}</span>
                </span>
              </div>
              <div className="db-point">
                <span className="db-point-label">Current Mood</span>
                <span className="db-point-value">{getEmoji(safeOverall)}</span>
              </div>
            </div>

            <div className="db-hero-chips">
              <div className="db-chip"><ShieldCheck size={14} /> Consistent progress</div>
              <div className="db-chip"><Award size={14} /> Premium study cockpit</div>
              <div className="db-chip"><Activity size={14} /> Live analytics</div>
            </div>
          </div>

          <div className="db-hero-right">
            <div className="db-hero-card glass-panel">
              <div className="db-hero-card-top">
                <div>
                  <div className="db-mini-label">Today’s Focus</div>
                  <div className="db-mini-title">Your study pulse at a glance</div>
                </div>

                <button className="btn-refresh" onClick={fetchMetrics} disabled={loading}>
                  <RefreshCw size={16} className={loading ? "spinning" : ""} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="db-hero-meter">
                <div className="db-donut-wrap">
                  <div
                    className="db-donut"
                    style={{ background: `conic-gradient(var(--gold) 0 ${donut}%, rgba(255,255,255,0.08) ${donut}% 100%)` }}
                  >
                    <div className="db-donut-center">
                      <span className="db-meter-value">{safeOverall}</span>
                      <span className="db-meter-suffix">%</span>
                    </div>
                  </div>
                </div>

                <div className="db-hero-meter-right">
                  <div className="db-meter-caption">Overall syllabus completion</div>
                  <div className="progress-track db-hero-progress">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${safeOverall}%`,
                        background: "linear-gradient(90deg, var(--gold), var(--rose-bright) 60%, var(--lotus-bright))",
                      }}
                    />
                  </div>

                  <div className="db-mini-chart">
                    <div className="db-mini-chart-top">
                      <span>Momentum</span>
                      <span>{metrics?.momentumScore ?? 0}% live</span>
                    </div>
                    <svg viewBox="0 0 320 96" className="db-sparkline" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="sparkLineFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgba(251,191,36,0.35)" />
                          <stop offset="100%" stopColor="rgba(251,191,36,0)" />
                        </linearGradient>
                        <linearGradient id="sparkLineStroke" x1="0" x2="1" y1="0" y2="0">
                          <stop offset="0%" stopColor="#fbbf24" />
                          <stop offset="55%" stopColor="#fb7185" />
                          <stop offset="100%" stopColor="#c084fc" />
                        </linearGradient>
                      </defs>
                      <path d={`${sparkPath} L 320 96 L 0 96 Z`} fill="url(#sparkLineFill)" opacity="0.9" />
                      <path d={sparkPath} fill="none" stroke="url(#sparkLineStroke)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="db-hero-note">
                <Sparkles size={14} className="inline-mr" />
                {metrics?.completedTopics ?? 0} topics completed · {metrics?.streak ?? 0} day streak · {metrics?.activeDays14 ?? 0} active days in 14
              </div>
            </div>
          </div>
        </section>

        <section className="db-section">
          <div className="db-section-card glass-panel timer-shell">
            <div className="db-section-title-row">
              <div>
                <h2 className="db-section-title">Session Timer</h2>
                <p className="db-section-subtitle">Keep your study blocks visible and structured.</p>
              </div>
              <div className="db-section-chip">
                <Gauge size={14} /> Focus mode
              </div>
            </div>
            <CountdownTimer />
          </div>
        </section>

        <section className="db-section db-cta-strip glass-panel">
          <div>
            <div className="db-section-title">Progress Snapshot</div>
            <p className="db-section-subtitle">A refined view of your current learning curve and study rhythm.</p>
          </div>
          <div className="db-cta-strip-right">
            <div className="db-mini-metric">
              <span className="db-mini-metric-label">Topics</span>
              <span className="db-mini-metric-value">{metrics?.completedTopics ?? 0}/{metrics?.totalTopics ?? 0}</span>
            </div>
            <div className="db-mini-metric">
              <span className="db-mini-metric-label">Chapters</span>
              <span className="db-mini-metric-value">{metrics?.completedChapters ?? 0}/{metrics?.totalChapters ?? 0}</span>
            </div>
            <div className="db-mini-metric">
              <span className="db-mini-metric-label">7D Hours</span>
              <span className="db-mini-metric-value">{Math.round(metrics?.recentHours7 ?? 0)}h</span>
            </div>
            <div className="db-mini-metric">
              <span className="db-mini-metric-label">Momentum</span>
              <span className="db-mini-metric-value">{metrics?.momentumScore ?? 0}%</span>
            </div>
          </div>
        </section>

        <section className="db-section">
          <div className="db-section-head">
            <div>
              <h2 className="db-section-title">Core Metrics</h2>
              <p className="db-section-subtitle">A clean view of your current study momentum</p>
            </div>
          </div>

          <div className="db-stats-grid">
            {globalStats.map((s, index) => (
              <div key={s.label} className="db-stat-card glass-panel" style={{ animationDelay: `${index * 60}ms` }}>
                <div
                  className="db-stat-icon-wrap"
                  style={{
                    background: `color-mix(in srgb, ${s.color} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${s.color} 25%, transparent)`,
                    boxShadow: `0 0 24px color-mix(in srgb, ${s.color} 20%, transparent)`,
                  }}
                >
                  <s.icon size={18} style={{ color: s.color }} />
                </div>
                <div className="db-stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="db-stat-label">{s.label}</div>
                <div className="db-stat-unit">{s.unit}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="db-section db-overall glass-panel">
          <div className="db-panel-head">
            <div className="db-panel-copy">
              <h2 className="db-panel-title">Overall Syllabus Completion</h2>
              <p className="db-panel-subtitle">
                {metrics?.completedTopics ?? 0} of {metrics?.totalTopics ?? 0} topics mastered
              </p>
            </div>

            <div className="db-score-badge">
              <span className="db-score-value">{safeOverall}</span>
              <span className="db-score-suffix">%</span>
              <span className="db-score-emoji">{getEmoji(safeOverall)}</span>
            </div>
          </div>

          <div className="db-overall-main">
            <div className="db-overall-left">
              <div className="progress-track db-main-progress">
                <div
                  className="progress-fill"
                  style={{
                    width: `${safeOverall}%`,
                    background: "linear-gradient(90deg, var(--gold), var(--rose-bright) 60%, var(--lotus-bright))",
                  }}
                />
              </div>

              <div className="db-overall-fineprint">
                <span>
                  <TrendingUp size={14} />
                  Visual target line
                </span>
                <span>
                  <Radar size={14} />
                  Adaptive progress readout
                </span>
                <span>
                  <CalendarDays size={14} />
                  Syllabus pace tracking
                </span>
              </div>
            </div>

            <div className="db-overall-msg">
              <div className="db-overall-msg-title">Performance Insight</div>
              <div className="db-overall-msg-copy">{getMessage(safeOverall)}</div>
            </div>
          </div>

          {metrics?.subjects && (
            <div className="db-sub-progress-list">
              {metrics.subjects.map((sub) => (
                <SmoothLink key={sub.slug} href={`/subjects/${sub.slug}`} className="db-sub-progress-link">
                  <div className="db-sub-row">
                    <span className="db-sub-name" style={{ color: sub.color }}>{sub.name}</span>
                    <span className="db-sub-pct">{sub.completionPct}%</span>
                  </div>
                  <div className="progress-track db-mini-progress">
                    <div className="progress-fill" style={{ width: `${sub.completionPct}%`, background: sub.color }} />
                  </div>
                </SmoothLink>
              ))}
            </div>
          )}
        </section>

        <section className="db-section">
          <div className="db-section-head">
            <div>
              <h2 className="db-section-title">Subjects</h2>
              <p className="db-section-subtitle">Click any subject to manage topics and revisions</p>
            </div>
          </div>

          {loading ? (
            <div className="db-subject-grid">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton db-skeleton glass-panel" />
              ))}
            </div>
          ) : (
            <div className="db-subject-grid">
              {(metrics?.subjects ?? []).map((sub, index) => {
                const Icon = SUBJECT_ICONS[sub.slug] || BookOpen;
                const meta = SUBJECT_META[sub.slug] || SUBJECT_META.botany;

                return (
                  <SmoothLink
                    href={`/subjects/${sub.slug}`}
                    key={sub.slug}
                    className="db-sub-card glass-panel interactive-card"
                    style={
                      {
                        "--sub-color": sub.color,
                        "--sub-glow": meta.glow,
                        "--sub-ring": meta.ring,
                        animationDelay: `${index * 90}ms`,
                      } as CSSProperties
                    }
                  >
                    <div className="db-sub-card-border" />
                    <div
                      className="db-sub-card-glow"
                      style={{ background: `radial-gradient(circle at 85% 15%, ${meta.soft} 0%, transparent 60%)` }}
                    />

                    <div className="db-sub-top">
                      <div className="db-sub-icon" style={{ background: meta.gradient, boxShadow: `0 8px 24px ${meta.glow}` }}>
                        <Icon size={24} color="white" />
                      </div>
                      <div className="db-sub-emoji">{getEmoji(sub.completionPct)}</div>
                    </div>

                    <div className="db-sub-body">
                      <div className="db-sub-name-lg">{sub.name}</div>
                      <div className="db-sub-meta">
                        {sub.completedTopics} / {sub.totalTopics} topics · {sub.completedChapters} / {sub.totalChapters} chapters
                      </div>

                      <div className="db-sub-big-pct">
                        {sub.completionPct}
                        <span>%</span>
                      </div>

                      <div className="progress-track db-sub-progress-bar">
                        <div className="progress-fill" style={{ width: `${sub.completionPct}%`, background: meta.gradient }} />
                      </div>

                      <div className="db-sub-foot">
                        <span>
                          <CheckSquare size={12} />
                          {sub.totalQuestions} Qs
                        </span>
                        <span>
                          <RefreshCw size={12} />
                          {sub.pendingRevisions} rev
                        </span>
                        <span>
                          <Layers3 size={12} />
                          {sub.totalChapters} ch
                        </span>
                        <span>
                          <Clock size={12} />
                          {sub.last7DaysHours}h
                        </span>
                      </div>
                    </div>

                    <div className="db-sub-cta">
                      <span>Explore Subject</span>
                      <ChevronRight size={16} />
                    </div>
                  </SmoothLink>
                );
              })}
            </div>
          )}
        </section>

        <section className="db-section">
          <div className="db-section-head">
            <div>
              <h2 className="db-section-title">Quick Access</h2>
              <p className="db-section-subtitle">Jump straight into your most-used study modules</p>
            </div>
          </div>

          <div className="db-quick-grid">
            {QUICK_SECTIONS.map((sec, index) => (
              <SmoothLink
                key={sec.href}
                href={sec.href}
                className="db-quick-card glass-panel interactive-card"
                style={{ "--qc": sec.color, "--qg": sec.glow, animationDelay: `${index * 70}ms` } as CSSProperties}
              >
                <div className="db-quick-sheen" />
                <div className="db-quick-top">
                  <div className="db-quick-icon" style={{ background: sec.bg, border: `1px solid ${sec.border}` }}>
                    {sec.emoji}
                  </div>
                  <ArrowRight size={20} className="db-quick-arrow" style={{ color: sec.color }} />
                </div>

                <div className="db-quick-content">
                  <div className="db-quick-title" style={{ color: sec.color }}>
                    {sec.label}
                  </div>
                  <p className="db-quick-desc">{sec.desc}</p>
                </div>
              </SmoothLink>
            ))}
          </div>
        </section>
      </main>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html) {
          scroll-behavior: smooth;
        }

        :global(body) {
          background: #060608;
        }

        .dashboard-page {
          --rose-bright: #fb7185;
          --rose-glow: rgba(251, 113, 133, 0.4);
          --rose-dim: rgba(251, 113, 133, 0.1);
          --physics: #3b82f6;
          --physics-glow: rgba(59, 130, 246, 0.4);
          --physics-dim: rgba(59, 130, 246, 0.1);
          --gold: #fbbf24;
          --gold-glow: rgba(251, 191, 36, 0.4);
          --gold-dim: rgba(251, 191, 36, 0.1);
          --lotus-bright: #c084fc;
          --lotus-glow: rgba(192, 132, 252, 0.4);
          --lotus-dim: rgba(192, 132, 252, 0.1);
          --botany: #34d399;
          --chemistry: #a78bfa;

          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #f4f4f5;
          background:
            radial-gradient(circle at top, rgba(251, 191, 36, 0.07), transparent 30%),
            linear-gradient(180deg, #08080b 0%, #050507 100%);
          font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
        }

        .dashboard-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }

        .dashboard-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.45;
          animation: floatOrb 12s ease-in-out infinite;
        }

        .dashboard-orb-1 { width: 450px; height: 450px; left: -150px; top: -100px; background: rgba(212, 168, 83, 0.12); }
        .dashboard-orb-2 { width: 400px; height: 400px; right: -100px; top: 15%; background: rgba(91, 156, 245, 0.1); animation-delay: -3s; }
        .dashboard-orb-3 { width: 500px; height: 500px; left: 30%; bottom: -200px; background: rgba(232, 114, 138, 0.08); animation-delay: -6s; }
        .dashboard-orb-4 { width: 320px; height: 320px; right: 18%; bottom: 10%; background: rgba(192, 132, 252, 0.08); animation-delay: -4s; }

        .dashboard-grid {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(ellipse at top, rgba(0, 0, 0, 1) 0%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse at top, rgba(0, 0, 0, 1) 0%, transparent 80%);
        }

        .dashboard-noise {
          position: absolute;
          inset: 0;
          opacity: 0.025;
          background-image: radial-gradient(circle at 20% 20%, white 1px, transparent 1px);
          background-size: 28px 28px;
          mix-blend-mode: screen;
        }

        .dashboard-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 35%, #060608 100%);
        }

        .dashboard-shell {
          position: relative;
          z-index: 1;
          max-width: 1500px;
          margin: 0 auto;
          padding: 48px 28px 120px;
        }

        .glass-panel {
          position: relative;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.018) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          box-shadow:
            0 24px 80px rgba(0, 0, 0, 0.28),
            inset 0 1px 1px rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(24px) saturate(170%);
          -webkit-backdrop-filter: blur(24px) saturate(170%);
          overflow: hidden;
        }

        .glass-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, rgba(255,255,255,0.06), transparent 28%, transparent 72%, rgba(255,255,255,0.04));
          opacity: 0.3;
          pointer-events: none;
        }

        .hero-glow::after {
          content: "";
          position: absolute;
          inset: auto -20% -35% auto;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.16), transparent 65%);
          pointer-events: none;
          filter: blur(10px);
        }

        .interactive-card {
          transition:
            transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
            border-color 0.35s ease,
            box-shadow 0.35s ease,
            background 0.35s ease;
          will-change: transform;
        }

        .interactive-card:hover {
          transform: translateY(-6px) scale(1.01);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%);
          border-color: rgba(255, 255, 255, 0.14);
          box-shadow:
            0 24px 60px rgba(0, 0, 0, 0.45),
            inset 0 1px 1px rgba(255, 255, 255, 0.1);
        }

        .text-muted { color: rgba(255, 255, 255, 0.42); }

        .progress-track {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 99px;
          overflow: hidden;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .progress-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
        }

        .db-hero {
          display: grid;
          grid-template-columns: 1.45fr 1fr;
          gap: 24px;
          margin-bottom: 36px;
        }

        .db-hero-left {
          padding: 42px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 100%;
        }

        .db-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          padding: 9px 16px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--gold);
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.2);
          width: fit-content;
        }

        .db-title {
          margin: 0;
          font-size: clamp(42px, 5vw, 70px);
          line-height: 1.02;
          letter-spacing: -0.06em;
          font-weight: 900;
          background: linear-gradient(180deg, #ffffff 0%, #b7b7c0 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .db-subtitle {
          margin-top: 16px;
          font-size: 16px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.63);
          max-width: 78%;
        }

        .db-hero-points {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-top: 32px;
          position: relative;
          z-index: 1;
        }

        .db-point {
          padding: 18px 18px 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .db-point-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
          margin-bottom: 8px;
        }

        .db-point-value {
          display: block;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #ffffff;
        }

        .db-hero-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
          position: relative;
          z-index: 1;
        }

        .db-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.76);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }

        .db-hero-right { display: flex; }

        .db-hero-card {
          width: 100%;
          padding: 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 22px;
        }

        .db-hero-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .db-mini-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
          margin-bottom: 8px;
        }

        .db-mini-title {
          font-size: 20px;
          line-height: 1.3;
          font-weight: 700;
          color: #ffffff;
          max-width: 220px;
        }

        .btn-refresh {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.11);
          border-radius: 999px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-refresh:hover {
          background: rgba(255, 255, 255, 0.11);
          transform: translateY(-1px);
        }

        .btn-refresh:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .db-hero-meter {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 20px;
          align-items: center;
        }

        .db-donut-wrap { display: grid; place-items: center; }

        .db-donut {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          padding: 10px;
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.28), inset 0 1px 1px rgba(255,255,255,0.08);
        }

        .db-donut-center {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          background: rgba(8, 8, 11, 0.84);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(12px);
        }

        .db-meter-value {
          font-size: 34px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #ffffff;
        }

        .db-meter-suffix {
          margin-top: 2px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.54);
        }

        .db-meter-caption {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.66);
          margin-bottom: 12px;
        }

        .db-hero-progress { height: 12px; }

        .db-mini-chart {
          margin-top: 16px;
          padding: 14px 14px 10px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .db-mini-chart-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.56);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .db-sparkline { width: 100%; height: 96px; display: block; }

        .db-hero-note {
          padding: 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.68);
          font-size: 13px;
          line-height: 1.6;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .inline-mr { color: var(--gold); flex-shrink: 0; }

        .db-section { margin-bottom: 48px; }
        .db-section-head { margin-bottom: 24px; }
        .db-section-title {
          font-size: 22px;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 8px 0;
          letter-spacing: -0.02em;
        }
        .db-section-subtitle {
          font-size: 15px;
          color: rgba(255, 255, 255, 0.52);
          margin: 0;
        }

        .db-section-card { padding: 28px; }
        .db-section-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }
        .db-section-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.75);
          font-size: 13px;
          font-weight: 700;
        }

        .timer-shell {
          padding: 28px;
        }

        .db-cta-strip {
          padding: 24px 26px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 48px;
        }

        .db-cta-strip-right {
          display: grid;
          grid-template-columns: repeat(4, minmax(110px, auto));
          gap: 12px;
        }

        .db-mini-metric {
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          min-width: 110px;
        }

        .db-mini-metric-label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.44);
          margin-bottom: 8px;
          font-weight: 700;
        }

        .db-mini-metric-value {
          display: block;
          font-size: 18px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .db-stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
        }

        .db-stat-card {
          padding: 24px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .db-stat-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          margin-bottom: 16px;
        }

        .db-stat-value {
          font-size: 28px;
          font-weight: 800;
          line-height: 1;
          margin-bottom: 8px;
        }

        .db-stat-label {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.72);
          margin-bottom: 4px;
        }

        .db-stat-unit {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.42);
        }

        .db-overall {
          padding: 32px 40px;
          margin-bottom: 48px;
        }

        .db-panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          margin-bottom: 28px;
        }

        .db-panel-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px 0;
        }

        .db-panel-subtitle {
          font-size: 15px;
          color: rgba(255, 255, 255, 0.54);
          margin: 0;
        }

        .db-score-badge {
          display: flex;
          align-items: baseline;
          padding: 16px 22px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.2);
        }

        .db-score-value {
          font-size: 48px;
          font-weight: 900;
          color: #ffffff;
          line-height: 1;
        }

        .db-score-suffix {
          font-size: 20px;
          color: rgba(255, 255, 255, 0.5);
          margin: 0 8px 0 4px;
        }

        .db-score-emoji { font-size: 32px; }

        .db-overall-main {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 28px;
          align-items: stretch;
          margin-bottom: 28px;
        }

        .db-overall-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 14px;
        }

        .db-main-progress { height: 18px; }

        .db-overall-fineprint {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          color: rgba(255, 255, 255, 0.56);
          font-size: 13px;
        }

        .db-overall-fineprint span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .db-overall-msg {
          padding: 20px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .db-overall-msg-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.44);
          margin-bottom: 8px;
          font-weight: 700;
        }

        .db-overall-msg-copy {
          font-size: 15px;
          color: #ffffff;
          line-height: 1.7;
        }

        .db-sub-progress-list {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
          padding-top: 28px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .db-sub-progress-link {
          display: block;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s;
          text-decoration: none;
        }

        .db-sub-progress-link:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-2px);
        }

        .db-sub-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .db-sub-name {
          font-size: 13px;
          font-weight: 700;
        }

        .db-sub-pct {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.52);
        }

        .db-mini-progress { height: 6px; }

        .db-subject-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .db-skeleton {
          height: 320px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.03);
          animation: pulse 1.6s infinite ease-in-out;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.72; transform: translateY(-2px); }
        }

        .db-sub-card {
          position: relative;
          padding: 32px 24px 24px;
          display: flex;
          flex-direction: column;
          min-height: 320px;
          text-decoration: none;
          overflow: hidden;
          animation: cardIn 0.7s ease both;
        }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .db-sub-card-border {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sub-ring) 20%, transparent);
          pointer-events: none;
        }

        .db-sub-card-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.95;
        }

        .db-sub-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          position: relative;
          z-index: 2;
        }

        .db-sub-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: grid;
          place-items: center;
        }

        .db-sub-emoji { font-size: 28px; }

        .db-sub-body {
          flex: 1;
          position: relative;
          z-index: 2;
        }

        .db-sub-name-lg {
          font-size: 20px;
          font-weight: 800;
          color: #ffffff;
          margin-bottom: 4px;
        }

        .db-sub-meta {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.52);
          margin-bottom: 24px;
        }

        .db-sub-big-pct {
          font-size: 42px;
          font-weight: 900;
          color: var(--sub-color);
          line-height: 1;
          margin-bottom: 12px;
          letter-spacing: -0.05em;
        }

        .db-sub-big-pct span {
          font-size: 20px;
          opacity: 0.6;
        }

        .db-sub-progress-bar { height: 8px; margin-bottom: 20px; }

        .db-sub-foot {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 16px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.54);
        }

        .db-sub-foot span {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .db-sub-cta {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.62);
          position: relative;
          z-index: 2;
          transition: color 0.3s;
        }

        .db-sub-card:hover .db-sub-cta { color: #ffffff; }

        .db-quick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 24px;
        }

        .db-quick-card {
          position: relative;
          padding: 30px 26px;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 180px;
          animation: cardIn 0.7s ease both;
        }

        .db-quick-card:hover {
          border-color: color-mix(in srgb, var(--qc) 40%, transparent);
          box-shadow:
            0 16px 40px rgba(0, 0, 0, 0.42),
            0 0 32px color-mix(in srgb, var(--qg) 22%, transparent),
            inset 0 1px 1px rgba(255, 255, 255, 0.1);
        }

        .db-quick-sheen {
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.06) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.85s ease;
          pointer-events: none;
        }

        .db-quick-card:hover .db-quick-sheen { transform: translateX(100%); }

        .db-quick-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          position: relative;
          z-index: 1;
        }

        .db-quick-icon {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          font-size: 26px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }

        .db-quick-arrow {
          opacity: 0.42;
          transform: translateX(-8px);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        .db-quick-card:hover .db-quick-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        .db-quick-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
          position: relative;
          z-index: 1;
        }

        .db-quick-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }

        .db-quick-desc {
          margin: 0;
          font-size: 14px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.52);
        }

        @keyframes floatOrb {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -18px, 0) scale(1.04); }
        }

        .animate-fade-in { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
        .animate-slide-up { opacity: 0; transform: translateY(20px); animation: slideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }

        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes slideUp { to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 1280px) {
          .db-hero { grid-template-columns: 1fr; }
          .db-stats-grid { grid-template-columns: repeat(3, 1fr); }
          .db-subject-grid { grid-template-columns: repeat(2, 1fr); }
          .db-sub-progress-list { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 900px) {
          .dashboard-shell { padding: 32px 20px 80px; }
          .db-hero-left,
          .db-hero-card,
          .db-overall,
          .db-section-card,
          .timer-shell { padding: 24px; }
          .db-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .db-overall-main { grid-template-columns: 1fr; gap: 18px; }
          .db-sub-progress-list { grid-template-columns: 1fr; }
          .db-cta-strip { flex-direction: column; align-items: flex-start; }
          .db-cta-strip-right { width: 100%; grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 640px) {
          .db-title { font-size: clamp(32px, 10vw, 42px); }
          .db-subtitle { max-width: 100%; }
          .db-hero-points { grid-template-columns: 1fr; }
          .db-hero-meter { grid-template-columns: 1fr; }
          .db-donut { width: 96px; height: 96px; }
          .db-stats-grid,
          .db-subject-grid,
          .db-quick-grid { grid-template-columns: 1fr; }
          .db-score-badge { padding: 12px 16px; }
          .db-score-value { font-size: 36px; }
          .db-panel-head { flex-direction: column; align-items: flex-start; }
          .db-cta-strip-right { grid-template-columns: 1fr; }
          .db-section-title-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
