"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

const STORAGE_KEY = "neet-theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  metaTheme?.setAttribute("content", theme === "light" ? "#f8f1e7" : "#050508");
}

function readTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    const documentTheme = document.documentElement.dataset.theme;
    if (documentTheme === "light" || documentTheme === "dark") return documentTheme;
  }

  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initialTheme = readTheme();
    setTheme(initialTheme);
    setMounted(true);
    applyTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (mounted) applyTheme(theme);
  }, [mounted, theme]);

  const renderedTheme = mounted ? theme : "dark";
  const nextTheme = renderedTheme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => {
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
      aria-label={`Switch to ${nextTheme} mode`}
      data-tip={`Switch to ${nextTheme}`}
      suppressHydrationWarning
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {renderedTheme === "light" ? <Sun size={18} /> : <Moon size={18} />}
      </span>
      <span>{renderedTheme === "light" ? "Light" : "Dark"}</span>

      <style jsx>{`
        .theme-toggle {
          position: fixed;
          left: 24px;
          bottom: 24px;
          z-index: 1002;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          height: 46px;
          padding: 0 16px 0 7px;
          border: 0;
          border-radius: 999px;
          color: var(--pl-ink);
          background: var(--pl-glass);
          box-shadow: var(--pl-glass-shadow);
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          cursor: pointer;
          font: 650 13px/1 var(--font-sans), system-ui, sans-serif;
          transition: transform 0.35s var(--pl-spring), box-shadow 0.25s;
        }

        .theme-toggle:hover {
          transform: translateY(-2px);
        }

        .theme-toggle:active {
          transform: translateY(0) scale(0.97);
        }

        .theme-toggle-icon {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: var(--pl-ink);
          background: var(--pl-well-2);
          box-shadow: inset 0 0 0 1px var(--pl-line-2);
        }

        @media (max-width: 600px) {
          .theme-toggle {
            left: 16px;
            bottom: calc(16px + env(safe-area-inset-bottom));
            width: 46px;
            padding: 0;
            justify-content: center;
          }

          .theme-toggle > span:last-child {
            display: none;
          }
        }
      `}</style>
    </button>
  );
}
