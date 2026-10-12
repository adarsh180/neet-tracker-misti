"use client";

import { useEffect, useState, type ReactNode } from "react";

import { HologramWidget } from "@/components/hologram/hologram-widget";
import { StudyBloom } from "@/components/pulse/dashboard/study-bloom";
import type { PulseInsights } from "@/lib/pulse-insights";

/**
 * The dashboard's hero companion: the WebGL hologram in dark mode, the clay
 * Study Bloom in light mode (the hologram's glow vanished into the lavender
 * page). Follows the theme live; the hologram is only mounted when shown.
 */
export function DashboardCore({ subjects, today, aside }: { subjects: PulseInsights["subjects"]; today: PulseInsights["today"]; aside?: ReactNode }) {
  const [light, setLight] = useState<boolean | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLight(root.dataset.theme === "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  if (light === null) return <div className="sb-placeholder" aria-hidden="true" />;
  return light ? <StudyBloom subjects={subjects} today={today} aside={aside} /> : <HologramWidget aside={aside} />;
}
