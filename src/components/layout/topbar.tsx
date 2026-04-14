"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Target, BarChart2, Sparkles,
  SmilePlus, Leaf, Zap, Microscope, Atom,
  LogOut, Menu, X, ChevronDown, ListTodo
} from "lucide-react";
import { clearAuth } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "Dashboard" },
  { href: "/todo",        icon: ListTodo,        label: "Todo" },
  { href: "/daily-goals", icon: Target,           label: "Goals" },
  { href: "/tests",       icon: BarChart2,        label: "Tests" },
  { href: "/mood",        icon: SmilePlus,        label: "Mood" },
  { href: "/ai-insights", icon: Sparkles,         label: "AI Insights" },
];

const SUBJECT_LINKS = [
  { href: "/subjects/botany",    icon: Leaf,       label: "Botany",    color: "var(--botany)" },
  { href: "/subjects/zoology",   icon: Microscope, label: "Zoology",   color: "var(--zoology)" },
  { href: "/subjects/physics",   icon: Zap,        label: "Physics",   color: "var(--physics)" },
  { href: "/subjects/chemistry", icon: Atom,       label: "Chemistry", color: "var(--chemistry)" },
];

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);

  const handleSignOut = () => { clearAuth(); router.push("/signin"); };

  const isSubjectActive = SUBJECT_LINKS.some((s) => pathname.startsWith(s.href));

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          {/* Logo */}
          <Link href="/dashboard" className="topbar-logo">
            <div className="topbar-logo-mark">
              <span className="devanagari" style={{ fontSize: 14, color: "var(--gold-bright)" }}>ॐ</span>
            </div>
            <div className="topbar-logo-text">
              <span className="topbar-brand">Sacred Path</span>
              <span className="topbar-sub">NEET 2027</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="topbar-nav">
            {NAV_LINKS.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href) && !pathname.startsWith("/subjects"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`topbar-link ${active ? "topbar-link--active" : ""}`}
                >
                  <item.icon size={14} strokeWidth={active ? 2.3 : 1.9} />
                  {item.label}
                </Link>
              );
            })}

            {/* Subjects dropdown */}
            <div className="topbar-dropdown" onMouseEnter={() => setSubjectsOpen(true)} onMouseLeave={() => setSubjectsOpen(false)}>
              <button className={`topbar-link topbar-link-subjects ${isSubjectActive ? "topbar-link--active" : ""}`}>
                <Leaf size={14} strokeWidth={1.9} />
                Subjects
                <ChevronDown size={12} style={{ opacity: 0.6, transition: "transform 0.2s", transform: subjectsOpen ? "rotate(180deg)" : "none" }} />
              </button>
              {subjectsOpen && (
                <div className="topbar-dropdown-menu">
                  {SUBJECT_LINKS.map((s) => (
                    <Link key={s.href} href={s.href} className="topbar-dropdown-item" onClick={() => setSubjectsOpen(false)}>
                      <s.icon size={14} style={{ color: s.color, flexShrink: 0 }} />
                      <span style={{ color: s.color }}>{s.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Right */}
          <div className="topbar-right">
            <div className="topbar-avatar">D</div>
            <button className="topbar-signout" onClick={handleSignOut} title="Sign out">
              <LogOut size={15} strokeWidth={2} />
            </button>
            {/* Mobile hamburger */}
            <button className="topbar-hamburger" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="topbar-mobile-menu">
            {NAV_LINKS.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`topbar-mobile-link ${active ? "active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            <div className="topbar-mobile-section">Subjects</div>
            {SUBJECT_LINKS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="topbar-mobile-link"
                onClick={() => setMobileOpen(false)}
              >
                <s.icon size={16} style={{ color: s.color }} />
                <span style={{ color: s.color }}>{s.label}</span>
              </Link>
            ))}
            <div className="topbar-mobile-divider" />
            <button className="topbar-mobile-link" onClick={handleSignOut} style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </header>

      <style jsx>{`
        .topbar {
          position: fixed; top: 0; left: 0; right: 0;
          z-index: 200;
          background: rgba(9,9,15,0.88);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          box-shadow: 0 1px 24px rgba(0,0,0,0.4);
        }
        .topbar-inner {
          display: flex; align-items: center; gap: 0;
          height: 56px; max-width: 1600px; margin: 0 auto;
          padding: 0 24px; gap: 20px;
        }

        /* ── Logo ── */
        .topbar-logo {
          display: flex; align-items: center; gap: 9px;
          text-decoration: none; flex-shrink: 0; margin-right: 8px;
        }
        .topbar-logo-mark {
          width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
          background: linear-gradient(135deg, hsla(38,72%,58%,0.16), hsla(285,38%,54%,0.10));
          border: 1px solid hsla(38,72%,58%,0.24);
          display: flex; align-items: center; justify-content: center;
        }
        .topbar-logo-text { display: flex; flex-direction: column; line-height: 1.1; }
        .topbar-brand { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; color: hsl(38,22%,88%); white-space: nowrap; }
        .topbar-sub { font-size: 9.5px; font-weight: 700; color: hsla(38,72%,60%,0.65); letter-spacing: 0.09em; text-transform: uppercase; }

        /* ── Nav ── */
        .topbar-nav {
          display: flex; align-items: center; gap: 2px; flex: 1;
        }
        .topbar-link {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px;
          font-size: 13px; font-weight: 500; text-decoration: none;
          color: hsla(38,10%,76%,0.55);
          transition: color 0.15s, background 0.15s;
          white-space: nowrap; background: none; border: none; cursor: pointer;
        }
        .topbar-link:hover { color: hsl(38,20%,88%); background: rgba(255,255,255,0.05); }
        .topbar-link--active { color: hsl(38,60%,76%); background: hsla(38,72%,58%,0.09); font-weight: 600; }

        /* ── Subjects dropdown ── */
        .topbar-dropdown { position: relative; }
        .topbar-link-subjects { cursor: pointer; }
        .topbar-dropdown-menu {
          position: absolute; top: calc(100% + 6px); left: 0;
          background: hsl(240,18%,7%);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 14px; padding: 6px;
          min-width: 160px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
          animation: scaleIn 0.18s var(--ease-spring) both;
        }
        .topbar-dropdown-item {
          display: flex; align-items: center; gap: 9px;
          padding: 9px 12px; border-radius: 9px;
          font-size: 13.5px; font-weight: 500; text-decoration: none;
          color: hsl(38,15%,82%);
          transition: background 0.12s;
        }
        .topbar-dropdown-item:hover { background: rgba(255,255,255,0.06); }

        /* ── Right ── */
        .topbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .topbar-avatar {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--gold), var(--rose));
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 12px; color: hsl(20,30%,12%);
        }
        .topbar-signout {
          background: none; border: none; cursor: pointer; color: hsla(38,10%,70%,0.4);
          padding: 6px; border-radius: 8px; transition: var(--t-fast);
          display: flex; align-items: center; justify-content: center;
        }
        .topbar-signout:hover { color: var(--danger); background: rgba(255,255,255,0.04); }
        .topbar-hamburger {
          display: none; background: none; border: none; cursor: pointer;
          color: var(--text-secondary); padding: 4px;
        }

        /* ── Mobile menu ── */
        .topbar-mobile-menu {
          display: flex; flex-direction: column;
          padding: 8px 12px 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(9,9,15,0.97);
          gap: 2px;
          animation: fadeInUp 0.2s ease both;
        }
        .topbar-mobile-link {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 12px; border-radius: 10px;
          font-size: 14px; font-weight: 500; text-decoration: none; color: var(--text-secondary);
          transition: background 0.12s, color 0.12s;
        }
        .topbar-mobile-link:hover, .topbar-mobile-link.active { background: rgba(255,255,255,0.06); color: var(--text-primary); }
        .topbar-mobile-section { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.10em; color: var(--text-muted); padding: 10px 12px 4px; }
        .topbar-mobile-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 6px 0; }

        @media (max-width: 860px) {
          .topbar-nav { display: none; }
          .topbar-hamburger { display: flex; }
          .topbar-signout { display: none; }
        }
        @media (min-width: 861px) {
          .topbar-mobile-menu { display: none; }
        }
      `}</style>
    </>
  );
}
