"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { GraduationCap, HeartPulse, Stethoscope } from "lucide-react";

const EXAMS = [
  { key: "ug", label: "UG", name: "NEET UG", icon: GraduationCap },
  { key: "pg", label: "PG", name: "NEET PG", icon: Stethoscope },
  { key: "ss", label: "SS", name: "NEET SS", icon: HeartPulse },
] as const;

/**
 * The exam switch, always in view at the top of NEET UG pages: one tap opens
 * PG or SS (each a separate workspace), without hunting for the rail icon.
 */
export function ExamSwitch() {
  const router = useRouter();
  const [current, setCurrent] = useState<string>("ug");
  useEffect(() => setCurrent(document.cookie.match(/(?:^|; )neet-exam=(ug|pg|ss)/)?.[1] ?? "ug"), []);
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
      if (!res.ok) throw new Error();
      router.push(data.home);
    } catch {
      setError(true);
      setBusy(null);
    }
  };

  return (
    <div className={`xs${error ? " is-error" : ""}`} role="group" aria-label="Which exam is open" style={{ "--x": index } as CSSProperties}>
      <span className="xs-label">Exam</span>
      <span className="xs-track">
        <i className="xs-thumb" aria-hidden="true" />
        {EXAMS.map((e) => (
          <button key={e.key} type="button" aria-pressed={e.key === current} title={e.key === current ? `${e.name} is open` : `Open ${e.name}`} onClick={() => void open(e.key)} disabled={busy !== null && busy !== e.key}>
            <e.icon size={14} />
            {e.label}
          </button>
        ))}
      </span>
    </div>
  );
}
