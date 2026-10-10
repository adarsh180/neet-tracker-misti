"use client";

import { useEffect } from "react";

import { shiftPalette } from "@/components/theme-shift";
import { daypartFor, paletteForNow } from "@/lib/daycycle";

/**
 * Applies the day-cycle palette (lib/daycycle.ts): dawn, noon, dusk and night
 * colours, one of three per part of the day rotating every minute, in lockstep
 * with the wall clock so every tab shows the same one. Colours cross-fade via
 * registered colour properties (pulse.css) and live in daycycle.css.
 * Subject colours never rotate.
 */
export function PulseCycler() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const apply = () => {
      const now = Date.now();
      const part = daypartFor(new Date(now));
      const palette = paletteForNow(now);
      if (root.dataset.pulse !== palette || root.dataset.daypart !== part) {
        // A soft cross-fade of the whole page, played once by the GPU.
        shiftPalette(() => {
          root.dataset.daypart = part;
          root.dataset.pulse = palette;
        });
      }
      timer = window.setTimeout(apply, 60000 - (Date.now() % 60000) + 40);
    };
    apply();
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
