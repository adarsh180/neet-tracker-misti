"use client";

import { useEffect, useState, type ReactNode } from "react";

import { HologramWidget } from "@/components/hologram/hologram-widget";
import { PriorityRadar } from "@/components/pulse/dashboard/priority-radar";
import type { PulseInsights } from "@/lib/pulse-insights";

/**
 * The dashboard's hero companion: the WebGL hologram in dark mode, the clay
 * priority radar in light mode (the hologram's glow vanished into the lavender
 * page). Follows the theme live; the hologram is only mounted when shown.
 */
export function DashboardCore({ subjects, zones, aside }: { subjects: PulseInsights["subjects"]; zones: PulseInsights["zones"]; aside?: ReactNode }) {
  const [light, setLight] = useState<boolean | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLight(root.dataset.theme === "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  if (light === null) return <div className="pr-placeholder" aria-hidden="true" />;
  return light ? <PriorityRadar zones={zones} subjects={subjects} aside={aside} /> : <HologramWidget aside={aside} />;
}
