"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";

import type { ExamKey } from "@/lib/exams/syllabus";

/** AI mentor for one workspace — runs only on click, cancellable, never blocks the page. */
export function ExamAIPanel({ exam }: { exam: ExamKey }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/exams/${exam}/analyze`, { signal: c.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => d.items?.[0] && setText(d.items[0].text))
      .catch(() => {});
    return () => c.abort();
  }, [exam]);

  const run = async () => {
    setBusy(true);
    setError(null);
    ctrl.current = new AbortController();
    try {
      const res = await fetch(`/api/exams/${exam}/analyze`, { method: "POST", signal: ctrl.current.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setText(data.text);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="xw-card">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <h2>AI mentor</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {busy ? <button type="button" className="xw-btn is-sm" onClick={() => ctrl.current?.abort()}>Cancel</button> : null}
          <button type="button" className="xw-btn is-primary is-sm" onClick={run} disabled={busy}>
            <Sparkles size={14} /> {busy ? "Reading your data…" : "Analyse my prep"}
          </button>
        </div>
      </div>
      <p className="xw-sub">Runs only when you press the button, and reads this exam&apos;s data only.</p>
      {error ? <p className="xw-error" role="alert">{error}</p> : null}
      <div className="xw-ai" aria-live="polite">
        {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : busy ? null : <p>No analysis yet — press “Analyse my prep” for a verdict, risks and a 7-day plan.</p>}
        {busy ? <span className="xw-caret" /> : null}
      </div>
    </div>
  );
}
