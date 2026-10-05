"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, BarChart2, Brain, HeartPulse, Moon, Shield, Target } from "lucide-react";

import { NeetLogoMark } from "@/components/brand/neet-logo-mark";
import SmoothLink from "@/components/layout/smooth-link";
import { HologramWidget } from "@/components/hologram/hologram-widget";
import { getStoredAuth } from "@/lib/auth";

const EXAM_DATE = new Date("2027-05-02T09:00:00+05:30");
function daysUntil() {
  return Math.max(0, Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000));
}

const TYPEWRITER_LINES = [
  "Hey Misti, you are stronger than you think.",
  "AIIMS Delhi. Your name. Our dream.",
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

const RX = [
  { icon: Target, label: "Daily goals", desc: "Hours, MCQs and discipline for all four subjects, every day." },
  { icon: BarChart2, label: "Test analytics", desc: "Every mock against the AIIMS cut-offs, subject by subject." },
  { icon: Brain, label: "NEET-GURU", desc: "A strict AI mentor that reads all of your study data." },
  { icon: Activity, label: "Seat odds", desc: "Projected score, AIR and the chance of each seat — live." },
  { icon: HeartPulse, label: "Mood tracker", desc: "Energy, focus and stress, logged in twenty seconds." },
  { icon: Moon, label: "Cycle planner", desc: "Study plans that adapt to the phase you're in." },
];

export default function LandingPage() {
  const router = useRouter();
  const typed = useTypewriter(TYPEWRITER_LINES, 42, 3200);
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    if (getStoredAuth()) router.replace("/dashboard");
    setDays(daysUntil());
  }, [router]);

  return (
    <main className="lp">
      <section className="lp-hero">
        <div className="lp-copy">
          <span className="lp-badge pl-glass">
            <NeetLogoMark size={18} />
            <span className="pl-live">NEET UG 2027 · private workspace</span>
          </span>
          <h1 className="lp-title">
            <span className="pl-line"><span style={{ "--l": 0 } as React.CSSProperties}>Built with love,</span></span>
            <span className="pl-line"><span style={{ "--l": 1 } as React.CSSProperties}>for <em>Misti.</em></span></span>
          </h1>
          <p className="lp-desc">
            Syllabus, daily goals, mocks, mood and an honest read of your seat odds — one quiet room for the attempt that
            matters.
          </p>
          <div className="lp-cta">
            <SmoothLink href="/signin" id="landing-cta" className="pl-btn pl-btn-rx lp-big" direction="forward">
              Begin the sacred journey <ArrowRight size={18} />
            </SmoothLink>
            <span className="lp-private">
              <Shield size={13} /> Private &amp; secure · only for Misti Tiwari
            </span>
          </div>
        </div>

        <div className="lp-holo">
          <HologramWidget />
          <div className="lp-note pl-glass">
            <div className="lp-days">
              <b>{days ?? "—"}</b>
              <span>days to NEET · 2 May 2027</span>
            </div>
            <p className="lp-message" aria-live="polite">
              {typed}
              <span className="lp-cursor" aria-hidden="true" />
            </p>
          </div>
        </div>
      </section>

      <section className="lp-rx">
        <div className="lp-pad">
          <div className="lp-pad-head">
            <span className="lp-rx-mark" aria-hidden="true">R<i>x</i></span>
            <div>
              <strong>For future Dr. Misti Tiwari</strong>
              <span>Six tools, taken daily until 2 May 2027</span>
            </div>
          </div>
          <ol>
            {RX.map((item, i) => (
              <li key={item.label} className="pl-reveal" style={{ "--i": i } as React.CSSProperties}>
                <span className="lp-rx-icon"><item.icon size={18} /></span>
                <b>{item.label}</b>
                <span>{item.desc}</span>
              </li>
            ))}
          </ol>
          <div className="lp-pad-foot">
            <span className="devanagari">विद्या विनयेन शोभते</span>
            <em>Knowledge shines through discipline</em>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <p className="devanagari">सरस्वति नमस्तुभ्यं वरदे कामरूपिणि</p>
        <p>Made with love by Adarsh · for Misti&apos;s dream of AIIMS Delhi MBBS</p>
      </footer>
    </main>
  );
}
