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
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";

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
        {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
      </span>
      <span>{theme === "light" ? "Light" : "Dark"}</span>

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
          padding: 0 16px 0 12px;
          border: 1px solid var(--glass-border-mid);
          border-radius: 999px;
          color: var(--text-primary);
          background:
            linear-gradient(145deg, var(--glass-thick), var(--glass-thin)),
            var(--bg-surface);
          box-shadow: var(--shadow-md), 0 0 24px rgba(212, 168, 83, 0.08);
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          cursor: pointer;
          font-size: 13px;
          font-weight: 800;
          transition: var(--t-smooth);
        }

        .theme-toggle:hover {
          transform: translateY(-2px);
          border-color: var(--glass-border-hot);
          box-shadow: var(--shadow-lg), 0 0 26px var(--gold-glow);
        }

        .theme-toggle:active {
          transform: translateY(0) scale(0.98);
        }

        .theme-toggle-icon {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: var(--gold-bright);
          background: var(--gold-dim);
          border: 1px solid hsla(38, 72%, 58%, 0.24);
        }

        @media (max-width: 600px) {
          .theme-toggle {
            left: 16px;
            bottom: 16px;
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
