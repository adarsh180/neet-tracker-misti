"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  Atom,
  BarChart2,
  BookOpen,
  Brain,
  CalendarDays,
  CheckSquare,
  Clock,
  Flame,
  Gauge,
  HeartPulse,
  Leaf,
  LineChart,
  Microscope,
  RefreshCw,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
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

interface PrepConfidence {
  exam: string;
  score: number;
  label: string;
  reliability: number;
  updatedAt: string;
  source?: string;
  signals: string[];
}

type QuickSection = {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  tone: string;
};

type SubjectVisual = {
  icon: LucideIcon;
  accent: string;
  tint: string;
  line: string;
};

const SUBJECT_VISUALS: Record<string, SubjectVisual> = {
  botany: {
    icon: Leaf,
    accent: "hsl(150, 55%, 55%)",
    tint: "hsla(150, 55%, 55%, 0.12)",
    line: "linear-gradient(90deg, hsl(150, 55%, 55%), hsl(174, 58%, 56%))",
  },
  zoology: {
    icon: Microscope,
    accent: "hsl(35, 88%, 62%)",
    tint: "hsla(35, 88%, 62%, 0.12)",
    line: "linear-gradient(90deg, hsl(35, 88%, 62%), hsl(18, 80%, 62%))",
  },
  physics: {
    icon: Zap,
    accent: "hsl(214, 86%, 66%)",
    tint: "hsla(214, 86%, 66%, 0.12)",
    line: "linear-gradient(90deg, hsl(214, 86%, 66%), hsl(252, 80%, 68%))",
  },
  chemistry: {
    icon: Atom,
    accent: "hsl(285, 62%, 68%)",
    tint: "hsla(285, 62%, 68%, 0.12)",
    line: "linear-gradient(90deg, hsl(285, 62%, 68%), hsl(326, 70%, 68%))",
  },
};

const QUICK_SECTIONS: QuickSection[] = [
  { href: "/daily-goals", icon: Target, label: "Daily goals", desc: "Plan today", tone: "gold" },
  { href: "/todo", icon: CheckSquare, label: "Todo deck", desc: "Next actions", tone: "green" },
  { href: "/tests", icon: BarChart2, label: "Tests", desc: "Mock review", tone: "blue" },
  { href: "/visual-lab", icon: Atom, label: "Visual lab", desc: "See concepts", tone: "violet" },
  { href: "/ai-insights/neet-guru", icon: Brain, label: "NEET-GURU", desc: "Ask mentor", tone: "rose" },
  { href: "/mood", icon: SmilePlus, label: "Mood", desc: "Energy check", tone: "amber" },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getMessage(pct: number) {
  if (pct >= 90) return "You are polishing mastery now. Keep the rhythm clean.";
  if (pct >= 75) return "Strong command is forming. Protect your momentum.";
  if (pct >= 60) return "The foundation is alive. This week can move the needle.";
  if (pct >= 40) return "Steady build phase. A few sharp sessions will change the feel.";
  if (pct >= 20) return "Early momentum counts. Make today simple and complete.";
  return "A calm first page. Pick one subject and let the streak begin.";
}

function getReadinessBand(pct: number) {
  if (pct >= 90) return "Mastery";
  if (pct >= 75) return "High control";
  if (pct >= 60) return "Rising";
  if (pct >= 40) return "Building";
  if (pct >= 20) return "Early";
  return "Fresh start";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(value));
}

function buildSparkline(values: number[], width = 460, height = 120) {
  if (!values.length) return "";

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * (height - 18) - 9;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function subjectVisual(slug: string): SubjectVisual {
  return SUBJECT_VISUALS[slug] ?? {
    icon: BookOpen,
    accent: "hsl(38, 72%, 62%)",
    tint: "hsla(38, 72%, 62%, 0.12)",
    line: "linear-gradient(90deg, hsl(38, 72%, 62%), hsl(350, 72%, 66%))",
  };
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [upscConfidence, setUpscConfidence] = useState<PrepConfidence | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/metrics", { cache: "no-store" });
      if (res.ok) setMetrics(await res.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUpscConfidence = useCallback(async () => {
    try {
      const res = await fetch("/api/prep-confidence?target=upsc", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUpscConfidence(data.source === "unavailable" ? null : data);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    fetchUpscConfidence();
  }, [fetchMetrics, fetchUpscConfidence]);

  const overall = clamp(metrics?.overallPct ?? 0, 0, 100);
  const subjects = useMemo(() => metrics?.subjects ?? [], [metrics?.subjects]);
  const studyPulse = useMemo(() => {
    if (metrics?.pulse?.length) return metrics.pulse;
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }, [metrics]);
  const sparkPath = useMemo(() => buildSparkline(studyPulse), [studyPulse]);
  const topSubject = useMemo(() => {
    return [...subjects].sort((a, b) => b.completionPct - a.completionPct)[0] ?? null;
  }, [subjects]);

  const statRail = [
    { label: "Streak", value: `${metrics?.streak ?? 0}`, unit: "days", icon: Flame },
    { label: "Study", value: `${formatNumber(metrics?.totalStudyHours ?? 0)}`, unit: "hours", icon: Clock },
    { label: "Solved", value: `${formatNumber(metrics?.totalQuestions ?? 0)}`, unit: "questions", icon: CheckSquare },
    { label: "Tests", value: `${metrics?.testCount ?? 0}`, unit: "logged", icon: Trophy },
  ];

  return (
    <main className="dashboard-page">
      <div className="dashboard-backdrop" aria-hidden="true" />

      <section className="studio-hero">
        <div className="hero-lustre" aria-hidden="true" />
        <div className="hero-thread hero-thread-one" aria-hidden="true" />
        <div className="hero-thread hero-thread-two" aria-hidden="true" />

        <div className="hero-copy">
          <div className="hero-kicker">
            <Sparkles size={15} />
            <span>NEET 2027 study studio</span>
          </div>
          <h1>Welcome back, {metrics?.studentName ?? "Divyani"}.</h1>
          <p>{getMessage(overall)}</p>
          <div className="hero-mini-deck" aria-label="Today summary">
            <div>
              <span>Today lane</span>
              <strong>{topSubject?.name ?? "Choose focus"}</strong>
            </div>
            <div>
              <span>Momentum</span>
              <strong>{metrics?.momentumScore ?? 0}%</strong>
            </div>
            <div>
              <span>Streak</span>
              <strong>{metrics?.streak ?? 0}d</strong>
            </div>
          </div>
        </div>

        <div className="hero-focus" aria-label="Overall progress">
          <div className="readiness-card">
            <div className="readiness-top">
              <span className="eyebrow">Syllabus readiness</span>
              <span className="readiness-band">{getReadinessBand(overall)}</span>
            </div>

            <div className="readiness-main">
              <div className="focus-ring" style={{ "--progress": `${overall}%` } as CSSProperties}>
                <span className="ring-spark ring-spark-one" />
                <span className="ring-spark ring-spark-two" />
                <div className="focus-ring-inner">
                  <span>{overall}<em>%</em></span>
                </div>
              </div>
              <div className="focus-copy">
                <strong>{metrics?.completedTopics ?? 0}/{metrics?.totalTopics ?? 0}</strong>
                <p>topics completed</p>
                <div className="chapter-pill">
                  <BookOpen size={14} />
                  {metrics?.completedChapters ?? 0}/{metrics?.totalChapters ?? 0} chapters
                </div>
              </div>
            </div>

            <div className="readiness-footer">
              <div>
                <span>Best subject</span>
                <strong>{topSubject?.name ?? "Loading"}</strong>
              </div>
              <div>
                <span>Active days</span>
                <strong>{metrics?.activeDays14 ?? 0}/14</strong>
              </div>
            </div>
          </div>
        </div>

        <button
          className="refresh-button"
          onClick={() => {
            fetchMetrics();
            fetchUpscConfidence();
          }}
          disabled={loading}
          type="button"
          aria-label="Refresh dashboard"
          data-tip="Refresh dashboard"
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
        </button>
      </section>

      <section className="stat-rail" aria-label="Study summary">
        {statRail.map((stat) => (
          <div className="stat-tile" key={stat.label}>
            <stat.icon size={18} />
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.unit}</small>
          </div>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="panel panel-pulse">
          <div className="section-head">
            <div>
              <span className="eyebrow">Momentum</span>
              <h2>Study pulse</h2>
            </div>
            <div className="soft-pill">
              <Activity size={14} />
              {metrics?.momentumScore ?? 0}% live
            </div>
          </div>

          <div className="pulse-chart">
            <svg viewBox="0 0 460 120" preserveAspectRatio="none" role="img" aria-label="Fourteen day study pulse">
              <defs>
                <linearGradient id="pulseStroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="hsl(150, 55%, 55%)" />
                  <stop offset="44%" stopColor="hsl(38, 88%, 62%)" />
                  <stop offset="100%" stopColor="hsl(285, 62%, 68%)" />
                </linearGradient>
                <linearGradient id="pulseFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255, 214, 138, 0.24)" />
                  <stop offset="100%" stopColor="rgba(255, 214, 138, 0)" />
                </linearGradient>
              </defs>
              <path d={`${sparkPath} L 460 120 L 0 120 Z`} fill="url(#pulseFill)" />
              <path d={sparkPath} fill="none" stroke="url(#pulseStroke)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="pulse-notes">
            <div>
              <span>7 day hours</span>
              <strong>{Math.round(metrics?.recentHours7 ?? 0)}h</strong>
            </div>
            <div>
              <span>7 day questions</span>
              <strong>{formatNumber(metrics?.recentQuestions7 ?? 0)}</strong>
            </div>
            <div>
              <span>Active days</span>
              <strong>{metrics?.activeDays14 ?? 0}/14</strong>
            </div>
          </div>
        </div>

        <div className="panel panel-timer">
          <div className="section-head">
            <div>
              <span className="eyebrow">Focus block</span>
              <h2>Timer</h2>
            </div>
            <div className="soft-pill">
              <Gauge size={14} />
              Deep work
            </div>
          </div>
          <CountdownTimer />
        </div>
      </section>

      <section className="subject-section">
        <div className="section-head section-head-roomy">
          <div>
            <span className="eyebrow">Subjects</span>
            <h2>Progress lanes</h2>
          </div>
          {topSubject && (
            <div className="soft-pill">
              <ShieldCheck size={14} />
              Strongest: {topSubject.name}
            </div>
          )}
        </div>

        <div className="subject-lanes">
          {subjects.length ? (
            subjects.map((subject, index) => {
              const visual = subjectVisual(subject.slug);
              const Icon = visual.icon;
              const pct = clamp(subject.completionPct, 0, 100);

              return (
                <SmoothLink
                  key={subject.id}
                  href={`/subjects/${subject.slug}`}
                  className="subject-lane"
                  style={
                    {
                      "--accent": visual.accent,
                      "--tint": visual.tint,
                      "--line": visual.line,
                      animationDelay: `${index * 55}ms`,
                    } as CSSProperties
                  }
                >
                  <div className="subject-mark">
                    <Icon size={21} />
                  </div>
                  <div className="subject-main">
                    <div className="subject-row">
                      <strong>{subject.name}</strong>
                      <span>{pct}%</span>
                    </div>
                    <div className="subject-track">
                      {Array.from({ length: 10 }).map((_, segment) => {
                        const fill = clamp((pct - segment * 10) * 10, 0, 100);
                        return (
                          <i
                            key={segment}
                            className={fill >= 100 ? "is-filled" : fill > 0 ? "is-partial" : undefined}
                            style={{ "--fill": `${fill}%` } as CSSProperties}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="subject-meta">
                    <span>{subject.completedTopics}/{subject.totalTopics} topics</span>
                    <span>{Math.round(subject.last7DaysHours)}h this week</span>
                  </div>
                  <ArrowRight size={17} className="lane-arrow" />
                </SmoothLink>
              );
            })
          ) : (
            <div className="empty-lane">
              <BookOpen size={20} />
              <span>Subject progress will appear after your syllabus data loads.</span>
            </div>
          )}
        </div>
      </section>

      <section className="quick-section">
        <div className="section-head section-head-roomy">
          <div>
            <span className="eyebrow">Quick access</span>
            <h2>Launch board</h2>
          </div>
          <div className="soft-pill">
            <CalendarDays size={14} />
            Study routes
          </div>
        </div>

        <nav className="command-bar" aria-label="Quick access">
          {QUICK_SECTIONS.map((section, index) => (
            <SmoothLink key={section.href} href={section.href} className={`command-link command-${section.tone}`}>
              <span className="command-index">0{index + 1}</span>
              <span className="command-icon">
                <section.icon size={19} />
              </span>
              <span className="command-copy">
                <strong>{section.label}</strong>
                <small>{section.desc}</small>
              </span>
              <ArrowRight size={16} className="command-arrow" />
            </SmoothLink>
          ))}
        </nav>
      </section>

      <section className="closing-strip">
        <div className="closing-item">
          <LineChart size={18} />
          <div>
            <span>Average test score</span>
            <strong>{(metrics?.avgTestScore ?? 0).toFixed(0)}%</strong>
          </div>
        </div>
        <div className="closing-item">
          <HeartPulse size={18} />
          <div>
            <span>UPSC side confidence</span>
            <strong>{upscConfidence ? `${upscConfidence.score}%` : "Optional"}</strong>
          </div>
        </div>
      </section>

      <style jsx>{`
        .dashboard-page {
          position: relative;
          min-height: 100vh;
          padding: 34px;
          color: var(--text-primary);
          isolation: isolate;
        }

        .dashboard-backdrop {
          position: fixed;
          inset: 0;
          z-index: -1;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.035), transparent 28%),
            linear-gradient(135deg, rgba(18, 34, 29, 0.72), transparent 38%),
            linear-gradient(225deg, rgba(39, 26, 38, 0.62), transparent 42%),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 72px),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.014) 0 1px, transparent 1px 72px),
            hsl(240, 18%, 5%);
        }

        .studio-hero,
        .panel,
        .stat-tile,
        .subject-lane,
        .command-bar,
        .closing-strip {
          border: 1px solid rgba(255,255,255,0.08);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.072), rgba(255,255,255,0.032)),
            rgba(5, 6, 10, 0.72);
          box-shadow: 0 18px 46px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.07);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-radius: 8px;
        }

        .studio-hero {
          position: relative;
          min-height: 300px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(420px, 520px) 46px;
          align-items: center;
          gap: 28px;
          padding: 38px;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 4%, rgba(244, 208, 126, 0.18), transparent 25%),
            radial-gradient(circle at 78% 48%, rgba(77, 212, 151, 0.15), transparent 30%),
            linear-gradient(100deg, rgba(255,255,255,0.09), rgba(255,255,255,0.026) 58%),
            linear-gradient(135deg, rgba(71, 129, 96, 0.22), transparent 36%),
            linear-gradient(315deg, rgba(244, 170, 94, 0.17), transparent 40%),
            rgba(5, 6, 10, 0.78);
        }

        .studio-hero::before {
          content: "";
          position: absolute;
          inset: auto 34px 30px 34px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
        }

        .hero-lustre {
          position: absolute;
          width: 420px;
          height: 420px;
          right: 160px;
          top: -210px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255, 224, 166, 0.17), rgba(255, 224, 166, 0.05) 42%, transparent 68%);
          filter: blur(10px);
          pointer-events: none;
        }

        .hero-thread {
          position: absolute;
          width: 360px;
          height: 360px;
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 999px;
          pointer-events: none;
        }

        .hero-thread-one {
          right: 104px;
          top: -116px;
        }

        .hero-thread-two {
          right: 42px;
          bottom: -210px;
          border-color: rgba(77, 212, 151, 0.09);
        }

        .hero-copy,
        .hero-focus,
        .section-head,
        .stat-tile,
        .subject-lane,
        .command-link,
        .closing-item,
        .pulse-notes {
          display: flex;
          align-items: center;
        }

        .hero-copy {
          align-items: flex-start;
          flex-direction: column;
          gap: 20px;
          max-width: 720px;
          position: relative;
          z-index: 1;
        }

        .hero-kicker,
        .eyebrow,
        .soft-pill {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .hero-kicker,
        .soft-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: hsl(42, 90%, 76%);
        }

        .hero-kicker {
          padding: 8px 10px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 999px;
          background: rgba(255,255,255,0.045);
        }

        h1,
        h2,
        p {
          margin: 0;
          letter-spacing: 0;
        }

        h1 {
          max-width: 12ch;
          font-family: var(--font-display);
          font-size: 68px;
          line-height: 1.01;
          text-shadow: 0 20px 54px rgba(0,0,0,0.38);
        }

        h2 {
          font-family: var(--font-display);
          font-size: 28px;
          line-height: 1.1;
        }

        .hero-copy p {
          max-width: 620px;
          color: rgba(255,255,255,0.72);
          font-size: 17px;
          line-height: 1.75;
        }

        .hero-mini-deck {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          width: min(560px, 100%);
          margin-top: 4px;
        }

        .hero-mini-deck div {
          min-height: 72px;
          display: grid;
          align-content: center;
          gap: 5px;
          padding: 13px 15px;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 8px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.024)),
            rgba(0,0,0,0.12);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        }

        .hero-mini-deck span,
        .readiness-footer span {
          color: rgba(255,255,255,0.42);
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .hero-mini-deck strong {
          overflow: hidden;
          color: rgba(255,255,255,0.92);
          font-size: 16px;
          line-height: 1.1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hero-focus {
          justify-content: flex-start;
          min-width: 0;
          position: relative;
          z-index: 1;
        }

        .readiness-card {
          width: 100%;
          min-height: 244px;
          padding: 18px;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px;
          background:
            linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.036) 48%, rgba(77,212,151,0.055)),
            rgba(3,4,8,0.46);
          box-shadow:
            0 24px 70px rgba(0,0,0,0.32),
            inset 0 1px 0 rgba(255,255,255,0.09),
            inset 0 -1px 0 rgba(0,0,0,0.26);
        }

        .readiness-top,
        .readiness-main,
        .readiness-footer {
          display: flex;
          align-items: center;
        }

        .readiness-top {
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        .readiness-band {
          padding: 6px 9px;
          border: 1px solid rgba(77,212,151,0.22);
          border-radius: 999px;
          color: hsl(150, 55%, 66%);
          background: rgba(77,212,151,0.095);
          font-size: 11px;
          font-weight: 850;
        }

        .readiness-main {
          gap: 22px;
          padding: 8px 0 18px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }

        .focus-ring {
          position: relative;
          width: 152px;
          height: 152px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background:
            conic-gradient(from 210deg, hsl(150, 65%, 58%) 0 var(--progress), rgba(255,255,255,0.075) var(--progress) 100%),
            rgba(255,255,255,0.04);
          box-shadow:
            0 18px 36px rgba(0,0,0,0.24),
            0 0 46px rgba(77,212,151,0.13);
          animation: softArrive 680ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .focus-ring::before {
          content: "";
          position: absolute;
          inset: -10px;
          border-radius: inherit;
          border: 1px solid rgba(255,255,255,0.055);
          background: radial-gradient(circle, rgba(77,212,151,0.08), transparent 70%);
          animation: haloBreath 4.8s ease-in-out infinite;
        }

        .focus-ring-inner {
          position: relative;
          z-index: 1;
          width: 108px;
          height: 108px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background:
            radial-gradient(circle at 50% 20%, rgba(255,255,255,0.08), transparent 52%),
            hsl(240, 18%, 7%);
          border: 1px solid rgba(255,255,255,0.095);
          box-shadow: inset 0 10px 24px rgba(0,0,0,0.28);
        }

        .focus-ring-inner span {
          position: relative;
          display: grid;
          width: 100%;
          height: 100%;
          place-items: center;
          font-size: 40px;
          font-weight: 850;
          line-height: 1;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }

        .focus-ring-inner em {
          position: absolute;
          left: calc(50% + 25px);
          top: calc(50% - 18px);
          color: rgba(255,255,255,0.52);
          font-size: 16px;
          font-style: normal;
          font-weight: 800;
        }

        .ring-spark {
          position: absolute;
          z-index: 2;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: hsl(42, 90%, 72%);
          box-shadow: 0 0 18px hsl(42, 90%, 72%);
        }

        .ring-spark-one {
          right: 24px;
          top: 10px;
        }

        .ring-spark-two {
          left: 18px;
          bottom: 25px;
          width: 6px;
          height: 6px;
          background: hsl(150, 65%, 62%);
          box-shadow: 0 0 16px hsl(150, 65%, 62%);
        }

        .focus-copy {
          display: grid;
          gap: 7px;
          min-width: 0;
        }

        .eyebrow {
          color: rgba(255,255,255,0.42);
        }

        .focus-copy strong {
          font-size: 40px;
          line-height: 1.05;
        }

        .focus-copy p {
          color: rgba(255,255,255,0.58);
          line-height: 1.6;
        }

        .chapter-pill {
          width: max-content;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 5px;
          padding: 8px 10px;
          border: 1px solid rgba(255,255,255,0.085);
          border-radius: 999px;
          color: rgba(255,255,255,0.7);
          background: rgba(255,255,255,0.045);
          font-size: 12px;
          font-weight: 800;
        }

        .chapter-pill svg {
          color: hsl(42, 90%, 70%);
        }

        .readiness-footer {
          justify-content: space-between;
          gap: 12px;
          padding-top: 15px;
        }

        .readiness-footer div {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .readiness-footer strong {
          overflow: hidden;
          color: rgba(255,255,255,0.86);
          font-size: 15px;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .refresh-button {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          align-self: start;
          justify-self: end;
          color: rgba(255,255,255,0.72);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          background: rgba(255,255,255,0.055);
          cursor: pointer;
          transition: transform 180ms ease, background 180ms ease, color 180ms ease;
        }

        .refresh-button:hover {
          color: white;
          background: rgba(255,255,255,0.09);
          transform: translateY(-1px);
        }

        .refresh-button:disabled {
          cursor: wait;
          opacity: 0.72;
        }

        .spin {
          animation: spin 900ms linear infinite;
        }

        .stat-rail {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin: 14px 0;
        }

        .stat-tile {
          min-height: 96px;
          gap: 10px;
          padding: 18px;
        }

        .stat-tile svg {
          color: hsl(42, 90%, 70%);
          flex: 0 0 auto;
        }

        .stat-tile span {
          flex: 1;
          color: rgba(255,255,255,0.52);
          font-size: 13px;
          font-weight: 700;
        }

        .stat-tile strong {
          font-size: 30px;
          line-height: 1;
        }

        .stat-tile small {
          color: rgba(255,255,255,0.36);
          font-size: 12px;
          font-weight: 700;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.18fr) minmax(330px, 0.82fr);
          gap: 14px;
          margin-bottom: 14px;
        }

        .panel {
          padding: 24px;
          min-width: 0;
        }

        .section-head {
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
        }

        .section-head-roomy {
          margin: 24px 0 14px;
        }

        .section-head > div:first-child {
          display: grid;
          gap: 7px;
        }

        .soft-pill {
          flex: 0 0 auto;
          min-height: 32px;
          padding: 8px 11px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.68);
        }

        .pulse-chart {
          height: 210px;
          padding: 18px 0 8px;
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .pulse-chart svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.2));
        }

        .pulse-notes {
          justify-content: space-between;
          gap: 10px;
          margin-top: 18px;
        }

        .pulse-notes div {
          display: grid;
          gap: 4px;
        }

        .pulse-notes span,
        .closing-item span,
        .subject-meta {
          color: rgba(255,255,255,0.48);
          font-size: 12px;
          font-weight: 750;
        }

        .pulse-notes strong {
          font-size: 24px;
        }

        .panel-timer :global(.countdown-timer),
        .panel-timer :global(.timer-card) {
          border-radius: 8px;
        }

        .subject-lanes {
          display: grid;
          gap: 10px;
        }

        .subject-lane {
          position: relative;
          min-height: 102px;
          grid-template-columns: auto minmax(210px, 1fr) minmax(230px, auto) auto;
          gap: 18px;
          padding: 18px 20px;
          color: inherit;
          text-decoration: none;
          animation: laneIn 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
          overflow: hidden;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
        }

        .subject-lane::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
          background: var(--line);
          opacity: 0.86;
        }

        .subject-lane::after {
          content: "";
          position: absolute;
          right: -80px;
          top: -82px;
          width: 190px;
          height: 190px;
          border-radius: 999px;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent), transparent 66%);
          opacity: 0.72;
          pointer-events: none;
        }

        .subject-lane:hover {
          transform: translateX(4px) translateY(-1px);
          border-color: color-mix(in srgb, var(--accent) 45%, rgba(255,255,255,0.08));
          background:
            linear-gradient(90deg, var(--tint), rgba(255,255,255,0.03)),
            rgba(5, 6, 10, 0.78);
          box-shadow:
            0 20px 50px rgba(0,0,0,0.32),
            0 0 38px color-mix(in srgb, var(--accent) 12%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .subject-mark {
          position: relative;
          z-index: 1;
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: var(--accent);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.12), transparent 42%),
            var(--tint);
          border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
          box-shadow:
            0 12px 26px rgba(0,0,0,0.22),
            0 0 24px color-mix(in srgb, var(--accent) 16%, transparent),
            inset 0 1px 0 rgba(255,255,255,0.1);
        }

        .subject-main {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 14px;
          min-width: 0;
        }

        .subject-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .subject-row strong {
          font-size: 18px;
        }

        .subject-row span {
          color: var(--accent);
          font-size: 17px;
          font-weight: 850;
        }

        .subject-track {
          width: 100%;
          height: 19px;
          display: grid;
          grid-template-columns: repeat(10, minmax(0, 1fr));
          gap: 5px;
          padding: 3px;
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.03)),
            rgba(0,0,0,0.16);
          border: 1px solid rgba(255,255,255,0.065);
          box-shadow: inset 0 1px 6px rgba(0,0,0,0.26);
        }

        .subject-track i {
          position: relative;
          display: block;
          height: 100%;
          overflow: hidden;
          border-radius: inherit;
          background: rgba(255,255,255,0.06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.055);
        }

        .subject-track i::before {
          content: "";
          position: absolute;
          inset: 0;
          width: 0;
          border-radius: inherit;
          background: var(--line);
          box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 42%, transparent);
          transition: width 700ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .subject-track i.is-filled::before {
          width: 100%;
        }

        .subject-track i.is-partial::before {
          width: var(--fill);
        }

        .subject-meta {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, max-content);
          gap: 12px;
          justify-content: end;
        }

        .subject-meta span {
          padding: 7px 9px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 999px;
          background: rgba(255,255,255,0.035);
        }

        .lane-arrow {
          position: relative;
          z-index: 1;
          color: rgba(255,255,255,0.42);
          transition: transform 180ms ease, color 180ms ease;
        }

        .subject-lane:hover .lane-arrow {
          color: var(--accent);
          transform: translateX(2px);
        }

        .empty-lane {
          min-height: 88px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 18px;
          color: rgba(255,255,255,0.56);
          border: 1px dashed rgba(255,255,255,0.12);
          border-radius: 8px;
        }

        .command-bar {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding: 12px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.022)),
            rgba(5, 6, 10, 0.72);
        }

        .command-link {
          position: relative;
          min-height: 102px;
          justify-content: flex-start;
          gap: 13px;
          padding: 16px;
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 8px;
          color: rgba(255,255,255,0.72);
          text-decoration: none;
          overflow: hidden;
          background:
            radial-gradient(circle at 92% 16%, var(--command-glow), transparent 34%),
            linear-gradient(150deg, rgba(255,255,255,0.078), rgba(255,255,255,0.024));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          transition: transform 180ms ease, background 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }

        .command-link::before {
          content: "";
          position: absolute;
          left: 16px;
          right: 16px;
          bottom: 0;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, var(--command-color), transparent);
          opacity: 0.55;
        }

        .command-link:hover {
          color: white;
          border-color: color-mix(in srgb, var(--command-color) 34%, rgba(255,255,255,0.08));
          transform: translateY(-3px);
          box-shadow:
            0 18px 42px rgba(0,0,0,0.3),
            0 0 34px var(--command-glow),
            inset 0 1px 0 rgba(255,255,255,0.085);
        }

        .command-index {
          position: absolute;
          right: 14px;
          top: 10px;
          color: rgba(255,255,255,0.08);
          font-size: 28px;
          font-weight: 950;
          line-height: 1;
        }

        .command-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 8px;
          color: var(--command-color);
          background: color-mix(in srgb, var(--command-color) 13%, transparent);
          border: 1px solid color-mix(in srgb, var(--command-color) 24%, transparent);
          box-shadow: 0 0 22px var(--command-glow);
        }

        .command-copy {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .command-copy strong {
          color: rgba(255,255,255,0.9);
          font-size: 16px;
          line-height: 1.15;
        }

        .command-copy small {
          color: rgba(255,255,255,0.46);
          font-size: 12px;
          font-weight: 750;
        }

        .command-arrow {
          margin-left: auto;
          color: rgba(255,255,255,0.32);
          transition: transform 180ms ease, color 180ms ease;
        }

        .command-link:hover .command-arrow {
          color: var(--command-color);
          transform: translateX(2px);
        }

        .command-gold {
          --command-color: hsl(42, 90%, 70%);
          --command-glow: rgba(250, 204, 94, 0.13);
        }

        .command-amber {
          --command-color: hsl(32, 88%, 66%);
          --command-glow: rgba(251, 146, 60, 0.13);
        }

        .command-green {
          --command-color: hsl(150, 55%, 55%);
          --command-glow: rgba(77, 212, 151, 0.13);
        }

        .command-blue {
          --command-color: hsl(214, 86%, 66%);
          --command-glow: rgba(96, 165, 250, 0.13);
        }

        .command-violet {
          --command-color: hsl(285, 62%, 68%);
          --command-glow: rgba(192, 132, 252, 0.13);
        }

        .command-rose {
          --command-color: hsl(350, 72%, 66%);
          --command-glow: rgba(251, 113, 133, 0.13);
        }

        .closing-strip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
          padding: 14px;
          background:
            linear-gradient(90deg, rgba(77,212,151,0.07), transparent 42%, rgba(192,132,252,0.055)),
            rgba(5, 6, 10, 0.72);
        }

        .closing-item {
          gap: 14px;
          min-height: 76px;
          padding: 12px 14px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          background: rgba(255,255,255,0.026);
        }

        .closing-item svg {
          color: hsl(150, 55%, 55%);
        }

        .closing-item div {
          display: grid;
          gap: 2px;
        }

        .closing-item strong {
          font-size: 22px;
          line-height: 1.1;
        }

        :global(html[data-theme="light"]) .dashboard-page {
          color: hsl(32, 28%, 13%);
        }

        :global(html[data-theme="light"]) .dashboard-backdrop {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.72), transparent 35%),
            linear-gradient(135deg, rgba(229, 213, 189, 0.86), transparent 38%),
            linear-gradient(225deg, rgba(244, 224, 205, 0.8), transparent 42%),
            repeating-linear-gradient(90deg, rgba(93,67,44,0.038) 0 1px, transparent 1px 72px),
            repeating-linear-gradient(0deg, rgba(93,67,44,0.03) 0 1px, transparent 1px 72px),
            hsl(36, 56%, 95%);
        }

        :global(html[data-theme="light"]) .studio-hero,
        :global(html[data-theme="light"]) .panel,
        :global(html[data-theme="light"]) .stat-tile,
        :global(html[data-theme="light"]) .subject-lane,
        :global(html[data-theme="light"]) .command-bar,
        :global(html[data-theme="light"]) .closing-strip {
          border-color: rgba(83, 57, 35, 0.12);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,250,240,0.58)),
            rgba(255, 250, 240, 0.72);
          box-shadow: 0 18px 46px rgba(83,57,35,0.12), inset 0 1px 0 rgba(255,255,255,0.8);
        }

        :global(html[data-theme="light"]) .studio-hero {
          background:
            radial-gradient(circle at 18% 4%, rgba(205, 145, 53, 0.16), transparent 25%),
            radial-gradient(circle at 78% 48%, rgba(56, 145, 102, 0.14), transparent 30%),
            linear-gradient(100deg, rgba(255,255,255,0.82), rgba(255,249,236,0.58) 58%),
            linear-gradient(135deg, rgba(171, 206, 172, 0.24), transparent 36%),
            linear-gradient(315deg, rgba(216, 145, 77, 0.16), transparent 40%),
            rgba(255, 250, 240, 0.84);
        }

        :global(html[data-theme="light"]) h1,
        :global(html[data-theme="light"]) h2,
        :global(html[data-theme="light"]) .focus-copy strong,
        :global(html[data-theme="light"]) .stat-tile strong,
        :global(html[data-theme="light"]) .pulse-notes strong,
        :global(html[data-theme="light"]) .subject-row strong,
        :global(html[data-theme="light"]) .command-copy strong,
        :global(html[data-theme="light"]) .closing-item strong,
        :global(html[data-theme="light"]) .hero-mini-deck strong,
        :global(html[data-theme="light"]) .readiness-footer strong {
          color: hsl(31, 30%, 13%);
          text-shadow: none;
        }

        :global(html[data-theme="light"]) .hero-copy p,
        :global(html[data-theme="light"]) .focus-copy p,
        :global(html[data-theme="light"]) .chapter-pill,
        :global(html[data-theme="light"]) .stat-tile span,
        :global(html[data-theme="light"]) .stat-tile small,
        :global(html[data-theme="light"]) .pulse-notes span,
        :global(html[data-theme="light"]) .closing-item span,
        :global(html[data-theme="light"]) .subject-meta,
        :global(html[data-theme="light"]) .command-copy small {
          color: hsla(31, 22%, 22%, 0.66);
        }

        :global(html[data-theme="light"]) .eyebrow,
        :global(html[data-theme="light"]) .hero-mini-deck span,
        :global(html[data-theme="light"]) .readiness-footer span {
          color: hsla(31, 18%, 28%, 0.54);
        }

        :global(html[data-theme="light"]) .hero-kicker,
        :global(html[data-theme="light"]) .soft-pill,
        :global(html[data-theme="light"]) .hero-mini-deck div,
        :global(html[data-theme="light"]) .readiness-card,
        :global(html[data-theme="light"]) .subject-meta span,
        :global(html[data-theme="light"]) .closing-item {
          border-color: rgba(83,57,35,0.12);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,247,232,0.44)),
            rgba(255, 250, 240, 0.5);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.78);
        }

        :global(html[data-theme="light"]) .readiness-card {
          box-shadow:
            0 24px 70px rgba(83,57,35,0.14),
            inset 0 1px 0 rgba(255,255,255,0.85),
            inset 0 -1px 0 rgba(83,57,35,0.05);
        }

        :global(html[data-theme="light"]) .focus-ring-inner {
          background:
            radial-gradient(circle at 50% 20%, rgba(255,255,255,0.82), transparent 52%),
            hsl(38, 54%, 96%);
          border-color: rgba(83,57,35,0.12);
          box-shadow: inset 0 10px 24px rgba(83,57,35,0.08);
        }

        :global(html[data-theme="light"]) .focus-ring-inner em {
          color: hsla(31, 18%, 28%, 0.56);
        }

        :global(html[data-theme="light"]) .subject-track,
        :global(html[data-theme="light"]) .pulse-chart {
          border-color: rgba(83,57,35,0.1);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.74), rgba(244,229,206,0.42)),
            rgba(255,255,255,0.42);
          box-shadow: inset 0 1px 6px rgba(83,57,35,0.08);
        }

        :global(html[data-theme="light"]) .subject-track i {
          background: rgba(83,57,35,0.07);
        }

        :global(html[data-theme="light"]) .command-link {
          border-color: rgba(83,57,35,0.1);
          background:
            radial-gradient(circle at 92% 16%, var(--command-glow), transparent 34%),
            linear-gradient(150deg, rgba(255,255,255,0.78), rgba(255,248,235,0.42));
        }

        :global(html[data-theme="light"]) .command-index {
          color: rgba(83,57,35,0.12);
        }

        :global(html[data-theme="light"]) .command-arrow,
        :global(html[data-theme="light"]) .lane-arrow {
          color: hsla(31, 18%, 28%, 0.38);
        }

        :global(html[data-theme="light"]) .refresh-button {
          color: hsla(31, 18%, 28%, 0.68);
          border-color: rgba(83,57,35,0.12);
          background: rgba(255,255,255,0.54);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes softArrive {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes haloBreath {
          0%, 100% { opacity: 0.62; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.035); }
        }

        @keyframes laneIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1200px) {
          .studio-hero {
            grid-template-columns: 1fr;
          }

          .refresh-button {
            position: absolute;
            right: 24px;
            top: 24px;
          }

          h1 {
            max-width: 14ch;
            font-size: 54px;
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .command-bar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .dashboard-page {
            padding: 18px;
          }

          .studio-hero,
          .panel {
            padding: 20px;
          }

          h1 {
            font-size: 42px;
          }

          h2 {
            font-size: 24px;
          }

          .stat-rail,
          .closing-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .hero-focus {
            align-items: flex-start;
            flex-direction: column;
          }

          .readiness-main {
            align-items: flex-start;
            flex-direction: column;
          }

          .subject-lane {
            grid-template-columns: auto minmax(0, 1fr) auto;
          }

          .subject-meta {
            grid-column: 2 / -1;
            grid-template-columns: 1fr;
            justify-content: start;
          }
        }

        @media (max-width: 560px) {
          .dashboard-page {
            padding: 12px;
          }

          .studio-hero {
            min-height: auto;
            gap: 22px;
          }

          h1 {
            font-size: 34px;
          }

          .hero-copy p {
            font-size: 15px;
          }

          .focus-ring {
            width: 118px;
            height: 118px;
          }

          .focus-ring-inner {
            width: 88px;
            height: 88px;
          }

          .focus-ring-inner span {
            font-size: 34px;
          }

          .stat-rail,
          .closing-strip,
          .command-bar,
          .hero-mini-deck {
            grid-template-columns: 1fr;
          }

          .stat-tile {
            min-height: 78px;
          }

          .pulse-notes,
          .section-head {
            align-items: flex-start;
            flex-direction: column;
          }

          .pulse-chart {
            height: 170px;
          }

          .subject-lane {
            min-height: 112px;
            align-items: flex-start;
            padding: 16px;
          }

          .lane-arrow {
            margin-top: 15px;
          }
        }
      `}</style>
    </main>
  );
}
