"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarHeart, Goal, LayoutGrid, Lock, PiggyBank, Sparkles, Wallet } from "lucide-react";

import { useHub } from "./hub-context";
import { PEOPLE, type View } from "../../lib/hub/metrics";

const TABS = [
  { path: "", label: "Overview", icon: LayoutGrid },
  { path: "/money", label: "Money", icon: Wallet },
  { path: "/goals", label: "Goals", icon: Goal },
  { path: "/funds", label: "Funds", icon: PiggyBank },
  { path: "/plans", label: "Plans", icon: CalendarHeart },
  { path: "/insights", label: "Insights", icon: Sparkles },
];

/** Two interlaced orbits — the Saath mark. */
export function SaathMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="sth-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <ellipse cx="16" cy="16" rx="12" ry="6.5" transform="rotate(-30 16 16)" className="o1" />
      <ellipse cx="16" cy="16" rx="12" ry="6.5" transform="rotate(30 16 16)" className="o2" />
      <circle cx="16" cy="16" r="2.6" className="core" />
    </svg>
  );
}

export function HubShell({ children, switcher }: { children: ReactNode; switcher?: ReactNode }) {
  const hub = useHub();
  const pathname = usePathname();
  const href = (p: string) => `${hub.base}${p}`;
  const active = (p: string) => (p ? pathname.startsWith(href(p)) : pathname === hub.base);
  const me = hub.records?.actor;
  const views: Array<{ v: View; label: string }> = [
    { v: "all", label: "Both" },
    { v: "adarsh", label: PEOPLE.adarsh.name },
    { v: "misti", label: PEOPLE.misti.name },
  ];

  return (
    <div className="sth" data-site={hub.site}>
      <header className="sth-top">
        <Link href={hub.base} className="sth-brand" aria-label="Saath — personal dashboard home">
          <SaathMark />
          <span><b>Saath</b><small>साथ · our dashboard</small></span>
        </Link>
        <nav className="sth-tabs" aria-label="Personal dashboard">
          {TABS.map((t) => (
            <Link key={t.path} href={href(t.path)} aria-current={active(t.path) ? "page" : undefined}>
              <t.icon size={15} /> {t.label}
            </Link>
          ))}
        </nav>
        <div className="sth-top-end">
          <div className="sth-views" role="group" aria-label="Whose numbers">
            {views.map((x) => (
              <button key={x.v} type="button" aria-pressed={hub.view === x.v} className={`v-${x.v}`} onClick={() => hub.setView(x.v)}>
                {x.label}
              </button>
            ))}
          </div>
          {me ? <span className={`sth-me o-${me}`} title={`Signed in as ${PEOPLE[me].name}`}>{PEOPLE[me].short}</span> : null}
          <button type="button" className="sth-iconbtn" onClick={() => void hub.lock()} aria-label="Lock the personal dashboard">
            <Lock size={15} /> <span>Lock</span>
          </button>
          {switcher}
        </div>
      </header>
      {children}
      <nav className="sth-dock" aria-label="Personal dashboard">
        {TABS.map((t) => (
          <Link key={t.path} href={href(t.path)} aria-current={active(t.path) ? "page" : undefined}>
            <t.icon size={18} />
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
