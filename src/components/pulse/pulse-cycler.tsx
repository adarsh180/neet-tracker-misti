"use client";

import { useEffect } from "react";

/**
 * Rotates the accent palette once a minute, in lockstep with the wall clock,
 * so every tab shows the same one. Palettes are named for the lab and the
 * body — iodine, aorta, saline, chloro, plasma, lotus — and cross-fade via
 * registered colour properties in pulse.css. Subject colours never rotate.
 */
export const PULSE_PALETTES = ["iodine", "aorta", "saline", "chloro", "plasma", "lotus"] as const;

export function PulseCycler() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const apply = () => {
      root.dataset.pulse = PULSE_PALETTES[Math.floor(Date.now() / 60000) % PULSE_PALETTES.length];
      timer = window.setTimeout(apply, 60000 - (Date.now() % 60000) + 40);
    };
    apply();
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
