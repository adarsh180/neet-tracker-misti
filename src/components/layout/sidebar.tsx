"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Target, BarChart2, Sparkles, Leaf, Zap,
  Microscope, Atom, LogOut, ChevronLeft, ChevronRight,
  SmilePlus, ListTodo
} from "lucide-react";
import { clearAuth } from "@/lib/auth";

const NAV_MAIN = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "Dashboard" },
  { href: "/todo",        icon: ListTodo,         label: "Todo Deck" },
  { href: "/daily-goals", icon: Target,           label: "Daily Goals" },
  { href: "/tests",       icon: BarChart2,        label: "Tests" },
  { href: "/ai-insights", icon: Sparkles,         label: "AI Insights" },
  { href: "/mood",        icon: SmilePlus,        label: "Mood Tracker" },
];
const NAV_SUBJECTS = [
  { href: "/subjects/botany",    icon: Leaf,       label: "Botany",    color: "var(--botany)" },
  { href: "/subjects/zoology",   icon: Microscope, label: "Zoology",   color: "var(--zoology)" },
  { href: "/subjects/physics",   icon: Zap,        label: "Physics",   color: "var(--physics)" },
  { href: "/subjects/chemistry", icon: Atom,       label: "Chemistry", color: "var(--chemistry)" },
];

interface Props { collapsed: boolean; setCollapsed: (v: boolean) => void; }

export default function Sidebar({ collapsed, setCollapsed }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = () => { clearAuth(); router.push("/signin"); };

  return (
    <>
      <aside className={`sb ${collapsed ? "sb--sm" : ""}`}>
        {/* ── Logo ── */}
        <div className="sb-logo">
          <div className="sb-logo-mark">
            <span className="devanagari" style={{ fontSize: 16, color: "var(--gold-bright)" }}>ॐ</span>
          </div>
          {!collapsed && (
            <div className="sb-logo-text">
              <span className="sb-brand">Sacred Path</span>
              <span className="sb-sub">NEET 2027</span>
            </div>
          )}
        </div>

        {/* ── Collapse toggle ── */}
        <button className="sb-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
        </button>

        {/* ── Navigation ── */}
        <nav className="sb-nav">
          {!collapsed && <div className="sb-section">Main</div>}
          {NAV_MAIN.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`sb-link ${active ? "sb-link--active" : ""}`} data-tip={collapsed ? item.label : undefined}>
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && <span className="sb-link-label">{item.label}</span>}
                {active && !collapsed && <span className="sb-link-dot" />}
              </Link>
            );
          })}

          <div className="sb-line" />

          {!collapsed && <div className="sb-section">Subjects</div>}
          {NAV_SUBJECTS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href} href={item.href}
                className={`sb-link ${active ? "sb-link--active" : ""}`}
                data-tip={collapsed ? item.label : undefined}
                style={{ "--link-accent": item.color } as React.CSSProperties}
              >
                <item.icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && <span className="sb-link-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div className="sb-footer">
          {!collapsed ? (
            <div className="sb-user">
              <div className="sb-avatar">D</div>
              <div className="sb-user-info">
                <span className="sb-user-name">Divyani T.</span>
                <span className="sb-user-status"><span className="sb-dot-online" /> NEET 2027</span>
              </div>
              <button className="sb-signout" onClick={handleSignOut} data-tip="Sign out"><LogOut size={14} strokeWidth={2} /></button>
            </div>
          ) : (
            <button className="sb-signout sb-signout--center" onClick={handleSignOut} data-tip="Sign out"><LogOut size={15} strokeWidth={2} /></button>
          )}
        </div>
      </aside>

      <style jsx>{`
        .sb {
          position: fixed; top: 0; left: 0; bottom: 0;
          width: var(--sidebar-w);
          display: flex; flex-direction: column;
          background: hsl(240,18%,5%);
          border-right: 1px solid rgba(255,255,255,0.055);
          z-index: 100;
          transition: width 0.3s var(--ease-in-out);
          overflow: hidden;
        }
        .sb--sm { width: var(--sidebar-sm); }

        /* ── Logo ── */
        .sb-logo {
          display: flex; align-items: center; gap: 10px;
          padding: 20px 18px 16px;
          min-height: 64px;
        }
        .sb-logo-mark {
          width: 34px; height: 34px; flex-shrink: 0;
          background: linear-gradient(135deg, hsla(38,72%,58%,0.14), hsla(285,38%,54%,0.09));
          border: 1px solid hsla(38,72%,58%,0.22);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .sb-logo-text { display: flex; flex-direction: column; gap: 0px; overflow: hidden; }
        .sb-brand { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; color: hsl(38,28%,88%); white-space: nowrap; }
        .sb-sub { font-size: 10px; font-weight: 700; color: hsla(38,72%,60%,0.70); letter-spacing: 0.08em; text-transform: uppercase; }

        /* ── Toggle ── */
        .sb-toggle {
          position: absolute; right: -11px; top: 34px;
          width: 22px; height: 22px;
          background: hsl(240,18%,12%);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: hsla(38,20%,80%,0.6);
          transition: var(--t-fast);
          z-index: 10;
        }
        .sb-toggle:hover { color: hsl(38,28%,88%); background: hsl(240,18%,16%); border-color: rgba(255,255,255,0.18); }

        /* ── Nav ── */
        .sb-nav {
          flex: 1; overflow-y: auto;
          padding: 8px 10px;
          display: flex; flex-direction: column; gap: 1px;
          scrollbar-width: none;
        }
        .sb-nav::-webkit-scrollbar { display: none; }

        .sb-section {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: hsla(38,10%,60%,0.35);
          padding: 14px 10px 6px;
        }

        .sb-link {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px;
          border-radius: 10px;
          text-decoration: none;
          color: hsla(38,10%,76%,0.55);
          font-size: 13.5px; font-weight: 500;
          transition: all 0.18s ease;
          position: relative;
        }
        .sb-link:hover {
          background: rgba(255,255,255,0.04);
          color: hsl(38,20%,88%);
        }
        .sb-link--active {
          background: hsla(38,72%,58%,0.09);
          color: hsl(38,60%,76%);
          font-weight: 600;
        }
        .sb-link--active::before {
          content: '';
          position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
          background: var(--gold);
          border-radius: 0 3px 3px 0;
        }

        .sb-link-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sb-link-dot {
          width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
          background: var(--gold);
          box-shadow: 0 0 6px var(--gold-glow);
        }

        .sb-line {
          height: 1px; margin: 6px 8px;
          background: rgba(255,255,255,0.045);
        }

        /* ── Footer ── */
        .sb-footer {
          padding: 12px;
          border-top: 1px solid rgba(255,255,255,0.045);
        }
        .sb-user {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 8px;
          border-radius: 10px;
        }
        .sb-avatar {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--gold), var(--rose));
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 13px; color: hsl(20,30%,12%);
        }
        .sb-user-info { flex: 1; min-width: 0; }
        .sb-user-name { font-size: 12.5px; font-weight: 600; color: hsl(38,20%,85%); display: block; }
        .sb-user-status {
          display: flex; align-items: center; gap: 5px;
          font-size: 10.5px; color: hsla(142,60%,56%,0.70); margin-top: 1px;
        }
        .sb-dot-online {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 4px hsla(142,60%,56%,0.6);
        }
        .sb-signout {
          background: none; border: none; cursor: pointer;
          color: hsla(38,10%,70%,0.4); padding: 6px;
          border-radius: 8px; transition: var(--t-fast);
          display: flex; align-items: center; justify-content: center;
        }
        .sb-signout:hover { color: var(--danger); background: rgba(255,255,255,0.04); }
        .sb-signout--center { margin: 0 auto; }

        /* ── Collapsed state ── */
        .sb--sm .sb-link { justify-content: center; padding: 10px 0; }
        .sb--sm .sb-logo { justify-content: center; padding: 20px 0 16px; }
        .sb--sm .sb-footer { display: flex; justify-content: center; }

        @media (max-width: 768px) {
          .sb { width: 0; border: none; }
          .sb--sm { width: 0; }
        }
      `}</style>
    </>
  );
}
