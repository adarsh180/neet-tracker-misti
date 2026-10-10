"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { originOf, shiftTheme } from "@/components/theme-shift";

type ThemeMode = "dark" | "light";

const STORAGE_KEY = "neet-theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  metaTheme?.setAttribute("content", theme === "light" ? "#f4effd" : "#050508");
}

function readTheme(): ThemeMode {
  const documentTheme = document.documentElement.dataset.theme;
  if (documentTheme === "light" || documentTheme === "dark") return documentTheme;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Light/dark switch: the same coin as the UPSC desk — sun and moon swap on a
 * turn, and the new theme is revealed in a circle from the coin
 * (components/theme-shift.ts). The theme is applied once, inside the
 * transition, so the reveal always has an old view to open from.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = readTheme();
    setTheme(initial);
    setMounted(true);
    applyTheme(initial);
  }, []);

  const light = mounted && theme === "light";
  return (
    <button
      type="button"
      className={`theme-coin nt-theme ${light ? "is-light" : ""}`}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      onClick={(e) => {
        const next: ThemeMode = light ? "dark" : "light";
        setTheme(next);
        shiftTheme(() => applyTheme(next), originOf(e.currentTarget));
      }}
      suppressHydrationWarning
    >
      <span className="theme-coin-icon"><Sun size={17} className="sun" /><Moon size={17} className="moon" /></span>
    </button>
  );
}
