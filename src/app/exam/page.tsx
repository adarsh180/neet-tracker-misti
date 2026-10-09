"use client";

import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";

const EXAMS = [
  {
    key: "ug",
    title: "NEET UG",
    logo: "/brand/neet-doctor-logo-mark.png",
    line: "The MBBS entrance — syllabus, mocks, practice arena and seat odds for AIIMS.",
    facts: ["180 Qs · 720 marks", "Physics · Chemistry · Biology", "Your current workspace"],
  },
  {
    key: "pg",
    title: "NEET PG",
    logo: "/brand/neet-pg-512.webp",
    line: "MD/MS entrance — 19 subjects weighted by the paper, grand tests and MD/MS seat odds.",
    facts: ["180 Qs · 720 marks", "19 subjects", "Password"],
  },
  {
    key: "ss",
    title: "NEET SS",
    logo: "/brand/neet-ss-512.webp",
    line: "DM/MCh entrance — pick your group and super-specialties; every metric follows that choice.",
    facts: ["150 Qs · 600 marks", "13 groups · 50+ courses", "Password"],
  },
  {
    key: "hub",
    title: "Saath",
    logo: "/brand/saath-512.webp",
    line: "Your shared dashboard with Adarsh — money, funds, goals, plans and the marriage plan.",
    facts: ["Shared with UPSC desk", "Money · Funds · Goals", "Password"],
  },
];
const GATED = new Set(["pg", "ss", "hub"]);

function Picker() {
  const router = useRouter();
  const params = useSearchParams();
  const want = params.get("want");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateFor, setGateFor] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const pw = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )neet-exam=(ug|pg|ss|hub)/);
    setOpen(m?.[1] ?? null);
  }, []);
  // Coming back from a gated page (?want=pg|ss|hub): try it straight away — it opens, or the password step appears.
  useEffect(() => {
    if (want && GATED.has(want)) void choose(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
  useEffect(() => {
    if (gateFor) setTimeout(() => pw.current?.focus(), 50);
  }, [gateFor]);

  const choose = async (exam: string, password?: string) => {
    setBusy(exam);
    setError(null);
    try {
      const res = await fetch("/api/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exam, password }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/signin");
        return;
      }
      if (data.needGate) {
        setGateFor(exam);
        setLocked(Boolean(data.lockedMinutes));
        if (password !== undefined) setError(`${data.error ?? "Wrong password."}${data.lockedMinutes ? ` Try again in ${data.lockedMinutes} min.` : ""}`);
        setBusy(null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not open that dashboard.");
      router.replace(data.home);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const gated = EXAMS.find((e) => e.key === gateFor);

  return (
    <main className="xp">
      <header className="xp-head">
        <span className="pl-kicker"><span className="pl-live">Signed in</span><span className="pl-deva">कौन सा डैशबोर्ड?</span></span>
        <h1>Which dashboard are you opening?</h1>
        <p>Four separate dashboards. Study data never crosses between them — only mood and the cycle planner are shared. PG, SS and Saath ask for the dashboard-switch password, then stay open for 24 hours.</p>
      </header>
      <div className="xp-grid is-four">
        {EXAMS.map((e, i) => (
          <button
            key={e.key}
            type="button"
            data-exam={e.key}
            className={`xp-card ${open === e.key ? "is-open" : ""} ${gateFor === e.key ? "is-gating" : ""}`}
            style={{ "--i": i } as CSSProperties}
            onClick={() => void choose(e.key)}
            disabled={busy !== null}
            autoFocus={want === e.key && !GATED.has(e.key)}
          >
            <span className="xp-logo"><img src={e.logo} alt="" width={72} height={72} /></span>
            <h2>{e.title}</h2>
            <p>{e.line}</p>
            <div className="xp-facts">{e.facts.map((f) => <span key={f}>{f === "Password" ? <><Lock size={11} /> {f}</> : f}</span>)}</div>
            <span className="xp-go">{busy === e.key ? "Opening…" : open === e.key ? "Continue" : "Open"} <ArrowRight size={15} /></span>
          </button>
        ))}
      </div>
      {gated ? (
        <form
          className="xp-gate"
          onSubmit={(ev) => {
            ev.preventDefault();
            void choose(gated.key, pw.current?.value ?? "");
          }}
        >
          <span className="xp-gate-icon"><Lock size={18} /></span>
          <label>
            <b>Password for {gated.title}</b>
            <small>The dashboard-switch password, not your sign-in. Opens PG, SS and Saath for 24 hours on this device.</small>
            <input ref={pw} type="password" name="password" autoComplete="off" required disabled={busy !== null || locked} />
          </label>
          <button type="submit" className="xw-btn is-primary" disabled={busy !== null || locked}>{busy ? "Checking…" : "Unlock"}</button>
          <button type="button" className="xw-btn" onClick={() => { setGateFor(null); setError(null); }}>Cancel</button>
        </form>
      ) : null}
      {error ? <p className="xw-error" role="alert">{error}</p> : null}
      <p className="xp-foot">Switch any time from the round button in the corner, or the dashboard switch at the top.</p>
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

