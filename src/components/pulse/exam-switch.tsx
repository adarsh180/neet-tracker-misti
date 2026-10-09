"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

const EXAMS = [
  { key: "ug", label: "UG", name: "NEET UG", logo: "/brand/neet-ug-160.webp" },
  { key: "pg", label: "PG", name: "NEET PG", logo: "/brand/neet-pg-160.webp" },
  { key: "ss", label: "SS", name: "NEET SS", logo: "/brand/neet-ss-160.webp" },
  { key: "hub", label: "Saath", name: "Saath, the personal dashboard", logo: "/brand/saath-160.webp" },
] as const;

/**
 * The dashboard switch on NEET UG pages (desktop; phones use the round switch
 * in the top-left corner). PG, SS and Saath ask for the dashboard-switch
 * password in the picker when the gate is closed.
 */
export function ExamSwitch() {
  const router = useRouter();
  const [current, setCurrent] = useState<string>("ug");
  useEffect(() => setCurrent(document.cookie.match(/(?:^|; )neet-exam=(ug|pg|ss|hub)/)?.[1] ?? "ug"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const index = EXAMS.findIndex((e) => e.key === (busy ?? current));

  const open = async (exam: string) => {
    if (exam === current || busy) return;
    setBusy(exam);
    setError(false);
    try {
      const res = await fetch("/api/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exam }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return router.replace("/signin");
      if (res.status === 403 || res.status === 429) return router.push(`/exam?want=${exam}`);
      if (!res.ok) throw new Error();
      router.push(data.home);
    } catch {
      setError(true);
      setBusy(null);
    }
  };

  return (
    <div className={`xs${error ? " is-error" : ""}`} role="group" aria-label="Which dashboard is open" style={{ "--x": index } as CSSProperties}>
      <span className="xs-label">Dashboard</span>
      <span className="xs-track">
        <i className="xs-thumb" aria-hidden="true" />
        {EXAMS.map((e) => (
          <button key={e.key} type="button" aria-pressed={e.key === current} title={e.key === current ? `${e.name} is open` : `Open ${e.name}`} onClick={() => void open(e.key)} disabled={busy !== null && busy !== e.key}>
            <img src={e.logo} alt="" width={18} height={18} />
            {e.label}
          </button>
        ))}
      </span>
    </div>
  );
}
