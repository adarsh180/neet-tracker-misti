"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  LayoutDashboard,
  Target,
  BarChart2,
  Sparkles,
  SmilePlus,
  Leaf,
  Zap,
  Microscope,
  Atom,
  LogOut,
  X,
  Menu,
  Brain,
  Heart,
  TrendingUp,
  ListTodo,
} from "lucide-react";
import { clearAuth } from "@/lib/auth";
import SmoothLink from "@/components/layout/smooth-link";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  accent: string;
};

const EXECUTION_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", accent: "#d4a853" },
  { href: "/todo", icon: ListTodo, label: "Todo Deck", accent: "#f59e0b" },
  { href: "/daily-goals", icon: Target, label: "Daily Goals", accent: "#e8728a" },
  { href: "/tests", icon: BarChart2, label: "Tests", accent: "#5b9cf5" },
  { href: "/mood", icon: SmilePlus, label: "Mood Tracker", accent: "#b680d9" },
] ;

const AI_ITEMS: NavItem[] = [
  { href: "/ai-insights", icon: Sparkles, label: "AI Insights", accent: "#d4a853" },
  { href: "/todo?focus=mission", icon: Target, label: "Mission Planner", accent: "#e8728a" },
  { href: "/todo?focus=copilot", icon: Brain, label: "Task Copilot", accent: "#f59e0b" },
  { href: "/ai-insights/neet-guru", icon: Brain, label: "NEET-GURU", accent: "#d4a853" },
  { href: "/ai-insights/rank-predictor", icon: TrendingUp, label: "Rank Predictor", accent: "#5b9cf5" },
  { href: "/ai-insights/cycle-planner", icon: Heart, label: "Cycle Planner", accent: "#e8728a" },
] ;

const SUBJECT_ITEMS: NavItem[] = [
  { href: "/subjects/botany", icon: Leaf, label: "Botany", accent: "#5cc87d" },
  { href: "/subjects/zoology", icon: Microscope, label: "Zoology", accent: "#d4a853" },
  { href: "/subjects/physics", icon: Zap, label: "Physics", accent: "#5b9cf5" },
  { href: "/subjects/chemistry", icon: Atom, label: "Chemistry", accent: "#b680d9" },
] ;

const GROUPS = [
  { label: "Execution", items: EXECUTION_ITEMS },
  { label: "AI Tools", items: AI_ITEMS },
  { label: "Subjects", items: SUBJECT_ITEMS },
];

export default function QuickNav() {
  const [open, setOpen] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Prevent scrolling on the body when the menu is open
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  const handleSignOut = () => {
    clearAuth();
    router.push("/signin");
  };

  const flatItems = useMemo(() => GROUPS.flatMap((group) => group.items), []);

  return (
    <>
      {/* Heavy Blur Backdrop */}
      <div
        className={`nav-backdrop ${open ? "visible" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Main Rectangular Panel */}
      <section className={`nav-shell ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="nav-panel">
          <div className="nav-glow-ambient" />

          <header className="nav-header">
            <div className="nav-brand">
              <div className="nav-brand-icon">ॐ</div>
              <div className="nav-brand-text">
                <h2 className="nav-title">Sacred Path</h2>
                <p className="nav-subtitle">NEET 2027 Workspace</p>
              </div>
            </div>
            <button
              className="action-button close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </header>

          <div className="nav-scroll-area">
            {GROUPS.map((group) => (
              <div key={group.label} className="nav-section">
                <h3 className="section-title">{group.label}</h3>
                <div className="section-grid">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    const index = flatItems.findIndex((x) => x.href === item.href);

                    return (
                      <SmoothLink
                        key={item.href}
                        href={item.href}
                        className={`item-container ${isActive ? "active" : ""}`}
                        style={
                          {
                            "--accent": item.accent,
                            "--delay": `${index * 35}ms`,
                          } as CSSProperties
                        }
                        onClick={() => setOpen(false)}
                      >
                        <div className="item-icon-wrapper">
                          <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                        </div>
                        <span className="item-label">{item.label}</span>
                      </SmoothLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <footer className="nav-footer">
            <div className="user-profile">
              <div className="avatar">M</div>
              <div className="user-info">
                <span className="user-name">Misti Tiwari</span>
                <span className="user-status">Online & Ready</span>
              </div>
            </div>
            <button className="action-button logout-btn" onClick={handleSignOut}>
              <LogOut size={16} />
              <span>Exit</span>
            </button>
          </footer>
        </div>
      </section>

      {/* Floating Action Pill */}
      <button
        className={`fab-toggle ${open ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle Navigation"
      >
        <div className="fab-icon-container">
          {open ? <X size={20} strokeWidth={2.5} /> : <Menu size={20} strokeWidth={2.5} />}
        </div>
        <span className="fab-text">{open ? "Close" : "Menu"}</span>
      </button>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }

        .nav-backdrop {
          position: fixed;
          inset: 0;
          z-index: 900;
          background:
            radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 28%),
            radial-gradient(circle at 80% 80%, rgba(212, 168, 83, 0.06), transparent 24%),
            rgba(4, 4, 8, 0.28);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1);
        }

        .nav-backdrop.visible {
          opacity: 1;
          pointer-events: auto;
        }

        .nav-shell {
          position: fixed;
          right: 24px;
          bottom: 90px;
          width: 440px;
          max-height: calc(100vh - 120px);
          height: 720px;
          z-index: 1000;
          pointer-events: none;
          opacity: 0;
          transform: translateY(30px) scale(0.92);
          transform-origin: bottom right;
          transition:
            opacity 0.4s cubic-bezier(0.32, 0.72, 0, 1),
            transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
        }

        .nav-shell.open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        .nav-panel {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(145deg, rgba(22, 22, 28, 0.68), rgba(12, 12, 18, 0.58)),
            rgba(20, 20, 24, 0.6);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow:
            0 40px 80px rgba(0, 0, 0, 0.6),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }

        .nav-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.10), transparent 28%),
            radial-gradient(circle at top left, rgba(212,168,83,0.10), transparent 35%),
            radial-gradient(circle at bottom right, rgba(91,156,245,0.08), transparent 30%);
          pointer-events: none;
          z-index: 0;
        }

        .nav-glow-ambient {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background:
            radial-gradient(circle at 50% 0%, rgba(212, 168, 83, 0.1), transparent 40%),
            radial-gradient(circle at 100% 100%, rgba(91, 156, 245, 0.05), transparent 40%);
          pointer-events: none;
          z-index: 0;
        }

        .nav-header {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .nav-brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .nav-brand-icon {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(212, 168, 83, 0.2), rgba(212, 168, 83, 0.05));
          border: 1px solid rgba(212, 168, 83, 0.3);
          border-radius: 14px;
          color: #d4a853;
          font-size: 20px;
          box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }

        .nav-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.02em;
        }

        .nav-subtitle {
          margin: 2px 0 0;
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .nav-scroll-area {
          position: relative;
          z-index: 1;
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .nav-scroll-area::-webkit-scrollbar { display: none; }
        .nav-scroll-area { scrollbar-width: none; }

        .section-title {
          margin: 0 0 12px 8px;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .section-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .item-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.7);
          transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
          cursor: pointer;
          opacity: 0;
          transform: translateY(10px);
        }

        .nav-shell.open .item-container {
          animation: slideUpFade 0.5s cubic-bezier(0.32, 0.72, 0, 1) forwards;
          animation-delay: var(--delay);
        }

        @keyframes slideUpFade {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .item-container:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: #fff;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .item-container:active {
          transform: scale(0.96) !important;
          background: rgba(255, 255, 255, 0.05);
        }

        .item-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: rgba(0,0,0,0.2);
          color: rgba(255,255,255,0.6);
          transition: all 0.2s ease;
        }

        .item-container:hover .item-icon-wrapper {
          background: var(--accent);
          color: #fff;
          box-shadow: 0 0 12px var(--accent);
        }

        .item-label {
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-container.active {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--accent);
          color: #fff;
        }

        .item-container.active .item-icon-wrapper {
          background: var(--accent);
          color: #fff;
        }

        .nav-footer {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e8728a, #b680d9);
          display: grid;
          place-items: center;
          font-weight: bold;
          color: #fff;
          border: 2px solid rgba(255,255,255,0.2);
        }

        .user-info {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
        }

        .user-status {
          font-size: 11px;
          color: #5cc87d;
          font-weight: 500;
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .action-button:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        .action-button:active {
          transform: scale(0.92);
        }

        .logout-btn {
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
        }

        .logout-btn:hover {
          background: rgba(232, 114, 138, 0.2);
          border-color: rgba(232, 114, 138, 0.5);
          color: #e8728a;
        }

        .fab-toggle {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 1001;
          display: flex;
          align-items: center;
          gap: 10px;
          height: 54px;
          padding: 0 20px 0 16px;
          border-radius: 27px;
          background: rgba(20, 20, 24, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #fff;
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        }

        .fab-toggle:hover {
          transform: translateY(-4px);
          background: rgba(40, 40, 45, 0.9);
          box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .fab-toggle:active {
          transform: scale(0.94);
        }

        .fab-icon-container {
          display: grid;
          place-items: center;
        }

        .fab-text {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .fab-toggle.active {
          background: #d4a853;
          color: #000;
          border-color: #d4a853;
        }

        @media (max-width: 600px) {
          .nav-shell {
            width: calc(100vw - 32px);
            right: 16px;
            bottom: 84px;
          }

          .section-grid {
            grid-template-columns: 1fr;
          }

          .fab-toggle {
            right: 16px;
            bottom: 16px;
          }
        }
      `}</style>
    </>
  );
}
