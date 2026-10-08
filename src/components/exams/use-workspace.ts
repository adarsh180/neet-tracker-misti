"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Records } from "@/lib/exams/metrics";
import { buildTree, type ExamKey, type ExamPrefs } from "@/lib/exams/syllabus";

type State = { prefs: ExamPrefs; records: Records };

/**
 * One workspace's data: preferences + its own records. Every read and write is
 * scoped to the exam; a failing request never blocks the page (it shows an
 * error and keeps the last good data), and each request has a timeout.
 */
export function useWorkspace(exam: ExamKey) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`/api/exams/${exam}`, { cache: "no-store", signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        window.location.replace(`/exam?want=${exam}`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not load your workspace.");
      if (alive.current) {
        setState({ prefs: data.prefs ?? {}, records: data.records });
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).name === "AbortError" ? "The server took too long — retrying will usually work." : (e as Error).message);
    } finally {
      clearTimeout(t);
    }
  }, [exam]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>, opts: { reload?: boolean } = { reload: true }) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/exams/${exam}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not save.");
        if (opts.reload !== false) await load();
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      } finally {
        if (alive.current) setSaving(false);
      }
    },
    [exam, load],
  );

  const tree = useMemo(() => buildTree(exam, state?.prefs ?? {}), [exam, state?.prefs]);
  return { state, tree, error, saving, load, act, setState };
}
