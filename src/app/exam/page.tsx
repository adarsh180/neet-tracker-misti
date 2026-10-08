"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, GraduationCap, HeartPulse, Stethoscope } from "lucide-react";

const EXAMS = [
  {
    key: "ug",
    title: "NEET UG",
    icon: GraduationCap,
    line: "The MBBS entrance — syllabus, mocks, practice arena and seat odds for AIIMS.",
    facts: ["180 Qs · 720 marks", "Physics · Chemistry · Biology", "Your current workspace"],
  },
  {
    key: "pg",
    title: "NEET PG",
    icon: Stethoscope,
    line: "MD/MS entrance — 19 subjects weighted by the paper, grand tests and MD/MS seat odds.",
    facts: ["180 Qs · 720 marks", "19 subjects", "NBEMS"],
  },
  {
    key: "ss",
    title: "NEET SS",
    icon: HeartPulse,
    line: "DM/MCh entrance — pick your group and super-specialties; every metric follows that choice.",
    facts: ["150 Qs · 600 marks", "13 groups · 50+ courses", "40% feeder · 60% specialty"],
  },
];

function Picker() {
  const router = useRouter();
  const params = useSearchParams();
  const want = params.get("want");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )neet-exam=(ug|pg|ss)/);
    setOpen(m?.[1] ?? null);
  }, []);

  const choose = async (exam: string) => {
    setBusy(exam);
    setError(null);
    try {
      const res = await fetch("/api/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exam }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not open that exam.");
      router.replace(data.home);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <main className="xp">
      <header className="xp-head">
        <span className="pl-kicker"><span className="pl-live">Signed in</span><span className="pl-deva">कौन सी परीक्षा?</span></span>
        <h1>Which exam are you opening?</h1>
        <p>Three separate workspaces. Study data never crosses between them — only mood and the cycle planner are shared.</p>
      </header>
      <div className="xp-grid">
        {EXAMS.map((e, i) => (
          <button
            key={e.key}
            type="button"
            data-exam={e.key}
            className={`xp-card ${open === e.key ? "is-open" : ""}`}
            style={{ "--i": i } as CSSProperties}
            onClick={() => void choose(e.key)}
            disabled={busy !== null}
            autoFocus={want === e.key}
          >
            <span className="xp-icon"><e.icon size={28} /></span>
            <h2>{e.title}</h2>
            <p>{e.line}</p>
            <div className="xp-facts">{e.facts.map((f) => <span key={f}>{f}</span>)}</div>
            <span className="xp-go">{busy === e.key ? "Opening…" : open === e.key ? "Continue" : "Open"} <ArrowRight size={15} /></span>
          </button>
        ))}
      </div>
      {error ? <p className="xw-error" role="alert">{error}</p> : null}
      <p className="xp-foot">You can switch any time from the ⇄ button in the rail.</p>
    </main>
  );
}

export default function ExamPickerPage() {
  return (
    <Suspense fallback={null}>
      <Picker />
    </Suspense>
  );
}
