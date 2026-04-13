"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Shield, Sparkles } from "lucide-react";
import { getStoredAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

const EXAM_DATE = new Date("2027-05-02T09:00:00+05:30");
function daysUntil() { return Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000)); }

const TYPEWRITER_LINES = [
  "Hey Misti, you are stronger than you think.",
  "384 days. AIIMS Delhi. Your name. Our dream.",
  "Every page you read is a step closer.",
  "I believe in you — now prove it to yourself.",
  "This is your 4th attempt. Make it the last one.",
  "No shortcuts. No excuses. Only discipline.",
  "Saraswati resides in your dedication.",
  "Future Dr. Misti Tiwari. AIIMS Delhi, MBBS.",
];

function useTypewriter(lines: string[], typingSpeed = 40, pauseTime = 2800) {
  const [display, setDisplay] = useState("");
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const line = lines[lineIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && charIdx <= line.length) {
      if (charIdx === line.length) {
        timeout = setTimeout(() => setIsDeleting(true), pauseTime);
      } else {
        timeout = setTimeout(() => {
          setDisplay(line.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        }, typingSpeed);
      }
    } else if (isDeleting && charIdx >= 0) {
      if (charIdx === 0) {
        setIsDeleting(false);
        setLineIdx((i) => (i + 1) % lines.length);
      } else {
        timeout = setTimeout(() => {
          setDisplay(line.slice(0, charIdx - 1));
          setCharIdx((c) => c - 1);
        }, typingSpeed / 2.5);
      }
    }

    return () => clearTimeout(timeout);
  }, [charIdx, isDeleting, lineIdx, lines, typingSpeed, pauseTime]);

  return display;
}

export default function LandingPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typed = useTypewriter(TYPEWRITER_LINES, 42, 3200);

  useEffect(() => { if (getStoredAuth()) router.replace("/dashboard"); }, [router]);

  // Particle canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; color: string; }
    const COLORS = ["hsla(38,80%,60%,", "hsla(352,60%,58%,", "hsla(285,50%,58%,"];
    const particles: P[] = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.5 + 0.4, a: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.a += 0.006;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        const alpha = (Math.sin(p.a) * 0.35 + 0.55) * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${alpha})`; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  const features = [
    { emoji: "📚", label: "Smart Syllabus",    desc: "200+ NEET topics tracked across 4 subjects" },
    { emoji: "📊", label: "Test Analytics",     desc: "Line + scatter charts vs AIIMS cutoffs" },
    { emoji: "🧠", label: "NEET‑GURU AI",       desc: "Strict AI mentor — reads all your study data" },
    { emoji: "😊", label: "Mood Tracker",       desc: "Daily energy, focus & stress logging" },
    { emoji: "🌙", label: "Cycle Planner",      desc: "Phase-aware study schedule adjustments" },
    { emoji: "🎯", label: "Rank Predictor",     desc: "AI rank prediction vs AIIMS Delhi cutoff" },
  ];

  return (
    <main className="ld">
      <canvas ref={canvasRef} aria-hidden="true" className="ld-canvas" />
      <div className="ld-orb ld-orb-1" />
      <div className="ld-orb ld-orb-2" />

      {/* Hero */}
      <section className="ld-hero">
        <div className="ld-badge animate-fade-in">
          <span className="devanagari" style={{ color: "var(--gold-bright)", fontSize: 14 }}>ॐ</span>
          <div className="dot-online" />
          <span>Sacred Study Platform · NEET 2027</span>
        </div>

        <h1 className="ld-title animate-fade-in" style={{ animationDelay: "80ms" }}>
          Built with love,<br />
          for <span className="ld-name">Misti</span>
        </h1>

        {/* Typewriter */}
        <div className="ld-typewriter animate-fade-in" style={{ animationDelay: "160ms" }}>
          <div className="ld-terminal">
            <div className="ld-terminal-dots"><span /><span /><span /></div>
            <div className="ld-terminal-text">
              {typed}<span className="ld-cursor">▌</span>
            </div>
          </div>
        </div>

        <p className="ld-desc animate-fade-in" style={{ animationDelay: "220ms" }}>
          A premium NEET UG 2027 preparation platform with AI mentorship,<br />
          real-time progress tracking, and daily wellness logging.
        </p>

        <div className="ld-shloka animate-fade-in" style={{ animationDelay: "280ms" }}>
          <span className="devanagari" style={{ fontSize: 18, color: "var(--gold)" }}>विद्या विनयेन शोभते</span>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" }}>Knowledge shines through discipline</span>
        </div>

        {/* Countdown */}
        <div className="ld-countdown animate-fade-in" style={{ animationDelay: "340ms" }}>
          <div className="ld-days-num">{daysUntil()}</div>
          <div className="ld-days-meta">
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>days remaining</span>
            <span style={{ fontSize: 12.5, color: "var(--gold)" }}>NEET UG 2027 · 2nd May</span>
          </div>
        </div>

        <div className="ld-cta animate-fade-in" style={{ animationDelay: "400ms" }}>
          <Link href="/signin" id="landing-cta" className="btn btn-primary btn-xl">
            Begin Sacred Journey <ArrowRight size={20} />
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10, display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
            <Shield size={11} /> Private & secure · exclusively for Misti Tiwari
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="ld-features animate-fade-in" style={{ animationDelay: "480ms" }}>
        <div className="ld-features-label"><Sparkles size={13} color="var(--gold)" /> Everything you need</div>
        <h2 className="ld-features-title">Six tools. One sacred mission.</h2>
        <div className="ld-grid stagger">
          {features.map((f) => (
            <div key={f.label} className="ld-feat glass-card" style={{ padding: "24px 22px" }}>
              <span style={{ fontSize: 30, display: "block", marginBottom: 10 }}>{f.emoji}</span>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{f.label}</h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="ld-footer">
        <p className="devanagari" style={{ color: "var(--gold)", fontSize: 14 }}>सरस्वति नमस्तुभ्यं वरदे कामरूपिणि</p>
        <p style={{ color: "var(--text-muted)", fontSize: 11.5, marginTop: 5 }}>Made with love by Adarsh · For Misti&apos;s dream of AIIMS Delhi MBBS ❤️</p>
      </footer>

      <style jsx>{`
        .ld { min-height: 100vh; display: flex; flex-direction: column; align-items: center; position: relative; overflow: hidden; background: var(--bg-void); }
        .ld-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
        .ld-orb { position: fixed; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; }
        .ld-orb-1 { width: 500px; height: 500px; top: -140px; left: -120px; background: radial-gradient(circle, hsla(285,50%,38%,0.16) 0%, transparent 65%); animation: float 9s ease-in-out infinite; }
        .ld-orb-2 { width: 420px; height: 420px; bottom: -80px; right: -60px; background: radial-gradient(circle, hsla(38,70%,46%,0.11) 0%, transparent 65%); animation: float 7s ease-in-out infinite 2s; }
        .ld-hero {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; align-items: center;
          text-align: center; padding: clamp(70px, 10vh, 130px) 24px 56px;
          max-width: 800px; width: 100%; gap: 24px;
        }
        .ld-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 16px; background: var(--glass-thin); backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border-mid); border-radius: var(--r-pill);
          font-size: 11.5px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.04em;
        }
        .ld-title { font-size: clamp(42px, 7.5vw, 76px); font-weight: 800; line-height: 1.07; color: var(--text-primary); letter-spacing: -0.03em; }
        .ld-name {
          background: linear-gradient(135deg, var(--gold-bright), var(--rose-bright), var(--lotus-bright));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        /* ── Typewriter terminal ── */
        .ld-typewriter { width: 100%; max-width: 560px; }
        .ld-terminal {
          background: linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
          border: 1px solid var(--glass-border-mid);
          border-radius: 14px; padding: 18px 22px;
          backdrop-filter: blur(16px);
          position: relative;
          min-height: 64px;
        }
        .ld-terminal-dots {
          display: flex; gap: 6px; margin-bottom: 12px;
        }
        .ld-terminal-dots span {
          width: 8px; height: 8px; border-radius: 50%;
        }
        .ld-terminal-dots span:nth-child(1) { background: hsl(0,70%,56%); }
        .ld-terminal-dots span:nth-child(2) { background: hsl(42,90%,56%); }
        .ld-terminal-dots span:nth-child(3) { background: hsl(142,50%,48%); }
        .ld-terminal-text {
          font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
          font-size: clamp(14px, 2vw, 17px);
          color: var(--gold-bright);
          line-height: 1.5;
          min-height: 28px;
        }
        .ld-cursor {
          display: inline-block;
          animation: ld-blink 0.65s ease-in-out infinite;
          color: var(--gold);
          margin-left: 1px;
        }
        @keyframes ld-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

        .ld-desc { font-size: clamp(14px, 1.8vw, 17px); color: var(--text-secondary); line-height: 1.7; max-width: 540px; }
        .ld-shloka { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 22px; background: var(--gold-dim); border: 1px solid hsla(38,72%,58%,0.16); border-radius: var(--r-xl); }
        .ld-countdown {
          display: flex; align-items: center; gap: 18px; padding: 18px 30px;
          background: var(--glass-thin); backdrop-filter: blur(16px); border: 1px solid var(--glass-border-mid);
          border-radius: var(--r-xl); box-shadow: var(--shadow-md);
        }
        .ld-days-num {
          font-size: 56px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, var(--gold-bright), var(--rose-bright));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .ld-days-meta { display: flex; flex-direction: column; gap: 2px; text-align: left; }
        .ld-cta { display: flex; flex-direction: column; align-items: center; }
        .ld-features {
          position: relative; z-index: 1; width: 100%; max-width: 1100px; padding: 0 24px 80px;
        }
        .ld-features-label {
          display: flex; align-items: center; gap: 6px; justify-content: center;
          font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.10em; color: var(--gold); margin-bottom: 12px;
        }
        .ld-features-title { font-size: clamp(24px, 3.5vw, 36px); font-weight: 800; text-align: center; color: var(--text-primary); margin-bottom: 32px; }
        .ld-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 860px) { .ld-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px) { .ld-grid { grid-template-columns: 1fr; } }
        .ld-feat { cursor: default; }
        .ld-feat:hover { transform: translateY(-4px); }
        .ld-footer {
          position: relative; z-index: 1; text-align: center; padding: 28px 24px;
          border-top: 1px solid var(--glass-border); width: 100%;
        }
      `}</style>
    </main>
  );
}
