"use client";

import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";

const UG_EXAM = "2027-05-02";

const EXAMS = [
  { key: "ug", title: "NEET UG", logo: "/brand/neet-ug-160.webp", sub: "MBBS entrance · Physics, Chemistry, Biology" },
  { key: "pg", title: "NEET PG", logo: "/brand/neet-pg-160.webp", sub: "MD / MS · 19 subjects, weighted by the paper" },
  { key: "ss", title: "NEET SS", logo: "/brand/neet-ss-160.webp", sub: "DM / MCh · 15 groups, 49 courses" },
  { key: "hub", title: "Saath", logo: "/brand/saath-160.webp", sub: "With Adarsh · money, goals, plans" },
];
const GATED = new Set(["pg", "ss", "hub"]);

function istNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function Picker() {
  const router = useRouter();
  const params = useSearchParams();
  const want = params.get("want");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateFor, setGateFor] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [now, setNow] = useState<{ date: string; hour: number } | null>(null);
  const pw = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )neet-exam=(ug|pg|ss|hub)/);
    setOpen(m?.[1] ?? null);
    setNow(istNow());
  }, []);
  // Coming back from a gated page (?want=pg|ss|hub): try it straight away — it opens, or the password step appears.
  useEffect(() => {
    if (want && GATED.has(want)) void choose(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
  useEffect(() => {
    if (gateFor) setTimeout(() => pw.current?.focus(), 80);
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

  const ugDays = now ? Math.round((new Date(`${UG_EXAM}T00:00:00`).getTime() - new Date(`${now.date}T00:00:00`).getTime()) / 864e5) : null;
  const hello = !now ? "Hello" : now.hour < 5 ? "Still up" : now.hour < 12 ? "Good morning" : now.hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="xd">
      <header className="xd-head">
        <p className="xd-kicker">NEET Doctor</p>
        <h1>{hello}, Misti.</h1>
        <p className="xd-q">Which desk today?</p>
      </header>

      <ol className="xd-list">
        {EXAMS.map((e, i) => {
          const gating = gateFor === e.key;
          const meta =
            e.key === "ug" && ugDays !== null && ugDays >= 0 ? <><b>{ugDays}</b> days to 2 May</> :
            GATED.has(e.key) ? <><Lock size={13} /> Password</> : null;
          return (
            <li key={e.key} className={`xd-item ${gating ? "is-gating" : ""}`} data-exam={e.key} style={{ "--i": i } as CSSProperties}>
              <button type="button" className="xd-row" onClick={() => (gating ? pw.current?.focus() : void choose(e.key))} disabled={busy !== null && busy !== e.key} aria-expanded={GATED.has(e.key) ? gating : undefined} autoFocus={want === e.key && !GATED.has(e.key)}>
                <span className="xd-num">{String(i + 1).padStart(2, "0")}</span>
                <img className="xd-logo" src={e.logo} alt="" width={52} height={52} />
                <span className="xd-name">
                  <strong>{e.title}{open === e.key ? <em>last opened</em> : null}</strong>
                  <small>{e.sub}</small>
                </span>
                <span className="xd-meta">{busy === e.key ? "Opening…" : meta}</span>
                <ArrowRight className="xd-arrow" size={20} />
              </button>
              <div className="xd-gate-wrap">
                <form
                  className="xd-gate"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void choose(e.key, pw.current?.value ?? "");
                  }}
                  aria-hidden={!gating}
                >
                  {gating ? (
                    <>
                      <label>
                        <span>Dashboard password</span>
                        <input ref={pw} type="password" name="password" autoComplete="off" required disabled={busy !== null || locked} placeholder="Not your sign-in password" />
                      </label>
                      <button type="submit" className="xd-unlock" disabled={busy !== null || locked}>{busy ? "Checking…" : "Unlock"}</button>
                      <button type="button" className="xd-cancel" onClick={() => { setGateFor(null); setError(null); }}>Cancel</button>
                      {error ? <p className="xd-error" role="alert">{error}</p> : <p className="xd-hint">Opens PG, SS and Saath on this device for 24 hours.</p>}
                    </>
                  ) : null}
                </form>
              </div>
            </li>
          );
        })}
      </ol>
      {error && !gateFor ? <p className="xd-error is-page" role="alert">{error}</p> : null}

      <p className="xd-foot">Study data stays inside each desk. Mood and the cycle planner are shared.</p>
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
