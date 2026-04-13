"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Brain, TrendingUp, Heart, ArrowRight, Sparkles } from "lucide-react";

const TOOLS = [
  {
    href: "/ai-insights/neet-guru",
    icon: Brain,
    title: "NEET-GURU",
    desc: "Chat with your AIIMS-focused mentor. Get study plans, practice MCQs, and honest performance breakdowns.",
    badge: "Personal Ai Mentor NEET-GURU",
    accent: "#d4a853",
  },
  {
    href: "/ai-insights/rank-predictor",
    icon: TrendingUp,
    title: "Rank Predictor",
    desc: "Rigorous analysis of your syllabus, test scores, and study hours versus AIIMS Delhi and Rishikesh cutoffs.",
    badge: "Deep Analysis",
    accent: "#5b9cf5",
  },
  {
    href: "/ai-insights/cycle-planner",
    icon: Heart,
    title: "Wellness Planner",
    desc: "Phase-aware study schedules built from your cycle data and daily mood logs. Mind-body alignment.",
    badge: "Mood Aware",
    accent: "#e8728a",
  },
];

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").trim();
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;

  return `${r}, ${g}, ${b}`;
}

export default function AIInsightsPage() {
  return (
    <div className="ai-page">
      <div className="ai-bg">
        <div className="ai-orb ai-orb-1" />
        <div className="ai-orb ai-orb-2" />
        <div className="ai-orb ai-orb-3" />
        <div className="ai-grid-overlay" />
        <div className="ai-vignette" />
      </div>

      <main className="ai-shell">
        <header className="ai-hero">
          <div className="ai-hero-topline">
            <span className="ai-hero-kicker">
              <Sparkles size={14} />
              AI-Powered Tools
            </span>
            <span className="ai-hero-chip">All models free</span>
          </div>

          <h1 className="ai-title">Intelligence Suite</h1>

          <p className="ai-desc">
            Three specialized AI modules that read your real study data to deliver personalized
            mentorship, predictions, and wellness planning.
          </p>

          <div className="ai-hero-metrics">
            <div className="ai-metric">
              <span className="ai-metric-value">3</span>
              <span className="ai-metric-label">Focused modules</span>
            </div>
            <div className="ai-metric">
              <span className="ai-metric-value">Live</span>
              <span className="ai-metric-label">Study-data aware</span>
            </div>
            <div className="ai-metric">
              <span className="ai-metric-value">AIIMS</span>
              <span className="ai-metric-label">Targeted for your goal</span>
            </div>
          </div>
        </header>

        <section className="ai-panel">
          <div className="ai-panel-head">
            <div>
              <div className="ai-panel-label">Featured modules</div>
              <div className="ai-panel-title">Built for clarity, speed, and premium feel</div>
            </div>
            <div className="ai-panel-note">Tap any card to open</div>
          </div>

          <div className="ai-grid">
            {TOOLS.map((tool, i) => {
              const iconRgb = hexToRgb(tool.accent);

              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="ai-card"
                  style={
                    {
                      "--accent": tool.accent,
                      "--accent-rgb": iconRgb,
                      animationDelay: `${i * 90}ms`,
                    } as CSSProperties
                  }
                >
                  <div className="ai-card-sheen" />
                  <div className="ai-card-glow" />

                  <div className="ai-card-top">
                    <div className="ai-card-icon-wrap">
                      <div className="ai-card-icon">
                        <tool.icon size={20} strokeWidth={1.8} />
                      </div>
                    </div>

                    <span className="ai-card-badge">{tool.badge}</span>
                  </div>

                  <div className="ai-card-body">
                    <h2 className="ai-card-title">{tool.title}</h2>
                    <p className="ai-card-desc">{tool.desc}</p>
                  </div>

                  <div className="ai-card-footer">
                    <span className="ai-card-action">
                      <span className="ai-card-action-dot" />
                      Open
                    </span>
                    <span className="ai-card-arrow-wrap">
                      <ArrowRight size={15} className="ai-card-arrow" />
                    </span>
                  </div>
                </Link>
              );
            })}
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
          background:
            radial-gradient(circle at top left, rgba(212, 168, 83, 0.08), transparent 28%),
            radial-gradient(circle at top right, rgba(91, 156, 245, 0.08), transparent 25%),
            radial-gradient(circle at bottom left, rgba(184, 118, 217, 0.08), transparent 22%),
            #07070a;
        }

        .ai-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(circle at 20% 15%, rgba(212, 168, 83, 0.08), transparent 20%),
            radial-gradient(circle at 85% 0%, rgba(91, 156, 245, 0.08), transparent 18%),
            linear-gradient(180deg, #09090c 0%, #060607 100%);
        }

        .ai-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .ai-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(60px);
          opacity: 0.6;
          transform: translateZ(0);
        }

        .ai-orb-1 {
          width: 360px;
          height: 360px;
          left: -120px;
          top: -90px;
          background: radial-gradient(circle, rgba(212, 168, 83, 0.16), transparent 68%);
        }

        .ai-orb-2 {
          width: 320px;
          height: 320px;
          right: -100px;
          top: 120px;
          background: radial-gradient(circle, rgba(91, 156, 245, 0.14), transparent 68%);
        }

        .ai-orb-3 {
          width: 420px;
          height: 420px;
          left: 20%;
          bottom: -180px;
          background: radial-gradient(circle, rgba(232, 114, 138, 0.12), transparent 68%);
        }

        .ai-grid-overlay {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.5), transparent 78%);
        }

        .ai-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.22) 78%);
        }

        .ai-shell {
          position: relative;
          z-index: 1;
          max-width: 1240px;
          margin: 0 auto;
          padding: 44px 24px 100px;
        }

        .ai-hero {
          max-width: 860px;
          margin-bottom: 28px;
          animation: heroIn 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        @keyframes heroIn {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .ai-hero-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .ai-hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 214, 138, 0.92);
          background: rgba(212, 168, 83, 0.08);
          border: 1px solid rgba(212, 168, 83, 0.14);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .ai-hero-chip {
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .ai-title {
          margin: 0;
          font-size: clamp(42px, 6vw, 74px);
          line-height: 0.95;
          letter-spacing: -0.05em;
          font-weight: 780;
          color: rgba(255, 255, 255, 0.98);
          text-wrap: balance;
        }

        .ai-desc {
          max-width: 720px;
          margin: 18px 0 0;
          font-size: clamp(15px, 1.7vw, 18px);
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.54);
        }

        .ai-hero-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 28px;
          max-width: 760px;
        }

        .ai-metric {
          padding: 16px 18px;
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 16px 40px rgba(0, 0, 0, 0.18),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
        }

        .ai-metric-value {
          display: block;
          font-size: 18px;
          font-weight: 780;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.96);
          margin-bottom: 4px;
        }

        .ai-metric-label {
          display: block;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.46);
          line-height: 1.35;
        }

        .ai-panel {
          margin-top: 28px;
          padding: 22px;
          border-radius: 30px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(14, 14, 18, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 28px 80px rgba(0, 0, 0, 0.45),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(28px) saturate(175%);
          -webkit-backdrop-filter: blur(28px) saturate(175%);
        }

        .ai-panel-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 16px;
          padding: 4px 4px 20px;
          flex-wrap: wrap;
        }

        .ai-panel-label {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(255, 255, 255, 0.34);
          margin-bottom: 8px;
        }

        .ai-panel-title {
          font-size: 20px;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.94);
        }

        .ai-panel-note {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.46);
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }

        .ai-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .ai-card {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 320px;
          padding: 26px;
          border-radius: 28px;
          text-decoration: none;
          background:
            radial-gradient(circle at 0% 0%, rgba(var(--accent-rgb), 0.18), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.03)),
            rgba(16, 16, 20, 0.84);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 18px 42px rgba(0, 0, 0, 0.26),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(22px) saturate(170%);
          -webkit-backdrop-filter: blur(22px) saturate(170%);
          transform: translateY(10px);
          opacity: 0;
          animation: cardIn 560ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms ease,
            border-color 220ms ease,
            filter 220ms ease;
          will-change: transform, opacity;
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .ai-card:hover {
          transform: translateY(-4px) scale(1.008);
          border-color: rgba(255, 255, 255, 0.12);
          box-shadow:
            0 24px 56px rgba(0, 0, 0, 0.34),
            0 1px 0 rgba(255, 255, 255, 0.07) inset;
        }

        .ai-card:active {
          transform: translateY(-1px) scale(0.996);
          transition-duration: 90ms;
        }

        .ai-card:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px rgba(255, 255, 255, 0.08),
            0 0 0 4px rgba(var(--accent-rgb), 0.25),
            0 24px 56px rgba(0, 0, 0, 0.34);
        }

        .ai-card-sheen {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(
              120deg,
              transparent 30%,
              rgba(255, 255, 255, 0.08) 48%,
              transparent 65%
            );
          transform: translateX(-120%);
          opacity: 0;
          transition:
            transform 700ms ease,
            opacity 220ms ease;
        }

        .ai-card:hover .ai-card-sheen {
          transform: translateX(120%);
          opacity: 1;
        }

        .ai-card-glow {
          position: absolute;
          inset: auto -20% -20% auto;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(var(--accent-rgb), 0.14), transparent 62%);
          filter: blur(20px);
          opacity: 0.9;
          pointer-events: none;
        }

        .ai-card-top {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 24px;
        }

        .ai-card-icon-wrap {
          width: 54px;
          height: 54px;
          border-radius: 18px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.26), rgba(255, 255, 255, 0.04));
          box-shadow:
            0 12px 26px rgba(0, 0, 0, 0.2),
            0 0 0 1px rgba(255, 255, 255, 0.06) inset;
          flex-shrink: 0;
        }

        .ai-card-icon {
          width: 100%;
          height: 100%;
          border-radius: 17px;
          display: grid;
          place-items: center;
          color: rgba(var(--accent-rgb), 1);
          background:
            radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.08), transparent 35%),
            rgba(255, 255, 255, 0.05);
          transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .ai-card:hover .ai-card-icon {
          transform: scale(1.04);
        }

        .ai-card-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
          color: rgba(var(--accent-rgb), 1);
          background: rgba(var(--accent-rgb), 0.1);
          border: 1px solid rgba(var(--accent-rgb), 0.16);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
        }

        .ai-card-body {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .ai-card-title {
          margin: 0;
          font-size: 24px;
          line-height: 1.08;
          letter-spacing: -0.04em;
          font-weight: 770;
          color: rgba(255, 255, 255, 0.97);
        }

        .ai-card-desc {
          margin: 14px 0 0;
          font-size: 14.5px;
          line-height: 1.72;
          color: rgba(255, 255, 255, 0.55);
          max-width: 42ch;
        }

        .ai-card-footer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding-top: 18px;
          margin-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        .ai-card-action {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.78);
          letter-spacing: -0.01em;
        }

        .ai-card-action-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(var(--accent-rgb), 1);
          box-shadow: 0 0 18px rgba(var(--accent-rgb), 0.55);
        }

        .ai-card-arrow-wrap {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.55);
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            background 220ms ease,
            color 220ms ease,
            border-color 220ms ease;
        }

        .ai-card:hover .ai-card-arrow-wrap {
          transform: translateX(3px);
          background: rgba(var(--accent-rgb), 0.11);
          border-color: rgba(var(--accent-rgb), 0.18);
          color: rgba(255, 255, 255, 0.9);
        }

        .ai-card-arrow {
          transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .ai-card:hover .ai-card-arrow {
          transform: translateX(1px);
        }

        @media (max-width: 980px) {
          .ai-hero-metrics {
            grid-template-columns: 1fr;
            max-width: 100%;
          }

          .ai-grid {
            grid-template-columns: 1fr;
          }

          .ai-card {
            min-height: 0;
          }
        }

        @media (max-width: 640px) {
          .ai-shell {
            padding: 28px 16px 88px;
          }

          .ai-panel {
            padding: 16px;
            border-radius: 24px;
          }

          .ai-card {
            padding: 20px;
            border-radius: 24px;
          }

          .ai-title {
            font-size: clamp(36px, 12vw, 52px);
          }

          .ai-panel-title {
            font-size: 17px;
          }

          .ai-card-title {
            font-size: 21px;
          }

          .ai-card-desc {
            font-size: 14px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ai-hero,
          .ai-card,
          .ai-card-sheen,
          .ai-card-icon,
          .ai-card-arrow-wrap,
          .ai-card-arrow {
            animation: none !important;
            transition: none !important;
          }

          .ai-card {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}