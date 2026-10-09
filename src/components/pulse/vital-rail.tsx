"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Atom,
  BarChart2,
  BookOpenCheck,
  Brain,
  GitBranch,
  HeartPulse,
  NotebookPen,
  LayoutDashboard,
  Leaf,
  Microscope,
  SmilePlus,
  Swords,
  Target,
  Zap,
} from "lucide-react";

import { NeetLogoMark } from "@/components/brand/neet-logo-mark";
import SmoothLink from "@/components/layout/smooth-link";

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/daily-goals", label: "Daily goals", icon: Target },
  { href: "/tests", label: "Tests", icon: BarChart2 },
  { href: "/practice", label: "Practice arena", icon: Swords },
  { href: "/ai-insights/neet-guru", label: "NEET-GURU", icon: Brain },
  { href: "/mood", label: "Mood", icon: SmilePlus },
];

// Subject colours are identity, not palette — they never rotate.
const SUBJECTS = [
  { href: "/subjects/botany", label: "Botany", icon: Leaf, color: "var(--botany)" },
  { href: "/subjects/zoology", label: "Zoology", icon: Microscope, color: "var(--zoology)" },
  { href: "/subjects/physics", label: "Physics", icon: Zap, color: "var(--physics)" },
  { href: "/subjects/chemistry", label: "Chemistry", icon: Atom, color: "var(--chemistry)" },
];

// PG and SS are separate workspaces with their own destinations; mood and the
// cycle planner are the only pages all three exams share.
const WORKSPACE = (base: "pg" | "ss") => [
  { href: `/${base}`, label: base === "pg" ? "PG dashboard" : "SS dashboard", icon: LayoutDashboard },
  { href: `/${base}/syllabus`, label: "Syllabus", icon: BookOpenCheck },
  { href: `/${base}/tests`, label: "Tests", icon: BarChart2 },
  { href: `/${base}/log`, label: "Log & errors", icon: NotebookPen },
  { href: `/${base}/what-if`, label: "What-if", icon: GitBranch },
];
const SHARED = [
  { href: "/mood", label: "Mood (shared)", icon: SmilePlus },
  { href: "/ai-insights/cycle-planner", label: "Cycle (shared)", icon: HeartPulse },
];

function openedExam(pathname: string) {
  if (pathname === "/pg" || pathname.startsWith("/pg/")) return "pg";
  if (pathname === "/ss" || pathname.startsWith("/ss/")) return "ss";
  if (typeof document === "undefined") return "ug";
  const m = document.cookie.match(/(?:^|; )neet-exam=(ug|pg|ss)/);
  return m?.[1] ?? "ug";
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isActive(pathname: string, href: string) {
  // Workspace homes match exactly, so /pg does not light up on /pg/syllabus.
  if (href === "/pg" || href === "/ss") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Vital rail: a slim glass column on the left edge (desktop). A beating drop
 * sits under the active destination and glides to the next one.
 */
export function VitalRail() {
  const pathname = usePathname();
  const [exam, setExam] = useState<string>(() => (pathname.startsWith("/pg") ? "pg" : pathname.startsWith("/ss") ? "ss" : "ug"));
  useEffect(() => setExam(openedExam(pathname)), [pathname]);
  const ref = useRef<HTMLElement | null>(null);

  const place = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    const active = host.querySelector<HTMLElement>("[data-active='true']");
    if (!active) {
      host.style.setProperty("--drop-o", "0");
      return;
    }
    host.style.setProperty("--drop-y", `${active.offsetTop}px`);
    host.style.setProperty("--drop-o", "1");
  }, []);

  useIsoLayoutEffect(() => {
    place();
  }, [pathname, place, exam]);

  useEffect(() => {
    const host = ref.current;
    const raf = window.requestAnimationFrame(() => host?.classList.add("is-ready"));
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [place]);

  const item = (href: string, label: string, Icon: typeof Target, color?: string) => {
    const active = isActive(pathname, href);
    return (
      <SmoothLink
        key={href}
        href={href}
        className={`pl-rail-item${active ? " active" : ""}`}
        data-active={active}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
      >
        <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
        {color ? <i className="pl-dot" aria-hidden="true" /> : null}
        <span className="pl-tip">{label}</span>
      </SmoothLink>
    );
  };

  return (
    <nav className="pl-rail pl-glass" aria-label="Primary" ref={ref as React.RefObject<HTMLElement>}>
      <span className="pl-rail-drop" aria-hidden="true" />
      <SmoothLink href={exam === "ug" ? "/dashboard" : `/${exam}`} className="pl-rail-logo" aria-label="Home of the open exam">
        {exam === "ug" ? <NeetLogoMark size={30} /> : <img src={exam === "pg" ? "/brand/neet-pg-160.webp" : "/brand/neet-ss-160.webp"} alt="" width={32} height={32} />}
      </SmoothLink>
      {exam === "ug" ? (
        <>
          {MAIN.map((m) => item(m.href, m.label, m.icon))}
          <span className="pl-rail-sep" aria-hidden="true" />
          {SUBJECTS.map((s) => item(s.href, s.label, s.icon, s.color))}
        </>
      ) : (
        <>
          {WORKSPACE(exam as "pg" | "ss").map((m) => item(m.href, m.label, m.icon))}
          <span className="pl-rail-sep" aria-hidden="true" />
          {SHARED.map((m) => item(m.href, m.label, m.icon))}
        </>
      )}
      <span className="pl-rail-sep" aria-hidden="true" />
      {item("/exam", `Switch exam (open: ${exam.toUpperCase()})`, ArrowLeftRight)}
    </nav>
  );
}
