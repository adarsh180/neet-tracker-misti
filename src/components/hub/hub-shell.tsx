"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { CalendarHeart, Goal, LayoutGrid, Lock, PiggyBank, Sparkles, Wallet } from "lucide-react";

import { useHub } from "./hub-context";
import { SheetHost } from "./sheet";
import { PEOPLE, type View } from "../../lib/hub/metrics";

const TABS = [
  { path: "", label: "Overview", icon: LayoutGrid },
  { path: "/money", label: "Money", icon: Wallet },
  { path: "/goals", label: "Goals", icon: Goal },
  { path: "/funds", label: "Funds", icon: PiggyBank },
  { path: "/plans", label: "Plans", icon: CalendarHeart },
  { path: "/insights", label: "Insights", icon: Sparkles },
];

/** The Saath logo (two people, one road) on a soft glass halo. */
export function SaathMark({ size = 34 }: { size?: number }) {
  return (
    <span className="sth-mark" style={{ width: size, height: size }} aria-hidden="true">
      <img src="/brand/saath-160.webp" alt="" width={size} height={size} draggable={false} />
    </span>
  );
}

/** Ambient light by the hour (IST): dawn gold, day sky, dusk rose, night indigo — blended, never a jump. */
function ambientFor(date: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(date)) + date.getMinutes() / 60;
  const stops = [
    { h: 0, a: 236, b: 280 },
    { h: 5.5, a: 32, b: 340 },
    { h: 9, a: 200, b: 175 },
    { h: 16, a: 205, b: 160 },
    { h: 18.5, a: 345, b: 25 },
    { h: 20.5, a: 250, b: 300 },
    { h: 24, a: 236, b: 280 },
  ];
  const i = stops.findIndex((x) => x.h > h);
  const p = stops[i - 1];
  const n = stops[i];
  const t = (h - p.h) / (n.h - p.h);
  const mix = (x: number, y: number) => {
    const d = ((y - x + 540) % 360) - 180;
    return Math.round((x + d * t + 360) % 360);
  };
  return { a: mix(p.a, n.a), b: mix(p.b, n.b) };
}

export function HubShell({ children, switcher }: { children: ReactNode; switcher?: ReactNode }) {
  const hub = useHub();
  const root = useRef<HTMLDivElement>(null);

  // Dynamic lighting: the ambient hue follows the clock; a soft spotlight follows the pointer over cards.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const paint = () => {
      const { a, b } = ambientFor(new Date());
      el.style.setProperty("--amb-a", String(a));
      el.style.setProperty("--amb-b", String(b));
    };
    paint();
    const clock = window.setInterval(paint, 60_000);
    let frame = 0;
    let last: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = (e.target as HTMLElement).closest<HTMLElement>(".sth-card, .sth-fig, .sth-fund");
        if (last && last !== card) last.classList.remove("is-lit");
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
        card.classList.add("is-lit");
        last = card;
      });
    };
    const leave = () => last?.classList.remove("is-lit");
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      window.clearInterval(clock);
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

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
    <div className="sth" data-site={hub.site} ref={root}>
      <div className="sth-ambient" aria-hidden="true"><i className="a" /><i className="b" /></div>
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
      <SheetHost />
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
