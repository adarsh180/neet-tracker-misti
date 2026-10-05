"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  Atom,
  BarChart2,
  Brain,
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

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Vital rail: a slim glass column on the left edge (desktop). A beating drop
 * sits under the active destination and glides to the next one.
 */
export function VitalRail() {
  const pathname = usePathname();
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
  }, [pathname, place]);

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
      <SmoothLink href="/dashboard" className="pl-rail-logo" aria-label="NEET DOCTOR — dashboard">
        <NeetLogoMark size={30} />
      </SmoothLink>
      {MAIN.map((m) => item(m.href, m.label, m.icon))}
      <span className="pl-rail-sep" aria-hidden="true" />
      {SUBJECTS.map((s) => item(s.href, s.label, s.icon, s.color))}
    </nav>
  );
}
