"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { computeWorkspace, type ProgressRow, type Records, type WorkspaceMetrics } from "@/lib/exams/metrics";
import { buildTree, focusOf, type ExamKey, type ExamPrefs, type ExamTree, type TreeSubject } from "@/lib/exams/syllabus";

type State = { prefs: ExamPrefs; records: Records };

type Workspace = {
  exam: ExamKey;
  state: State | null;
  tree: ExamTree;
  error: string | null;
  saving: boolean;
  load: () => Promise<void>;
  act: (body: Record<string, unknown>, opts?: { reload?: boolean }) => Promise<{ ok: true; data: Record<string, unknown> & { row?: unknown } } | { ok: false; error: string }>;
  setState: React.Dispatch<React.SetStateAction<State | null>>;
  /** The one subject in view (menu toggle) — null = whole exam. Every page and metric follows it. */
  focus: string | null;
  subject: TreeSubject | null;
  setFocus: (key: string | null) => void;
  /** Metrics for the subject in focus. */
  m: WorkspaceMetrics | null;
  /** Optimistic status change for one topic; rolls back if the save fails. */
  setStatus: (itemKey: string, status: string) => Promise<string | null>;
};

const Ctx = createContext<Workspace | null>(null);

/**
 * One workspace's data, loaded once for every tab: preferences + its own
 * records. Every read and write is scoped to the exam; a failing request never
 * blocks the page (it shows an error and keeps the last good data), and each
 * request has a timeout.
 */
export function WorkspaceProvider({ exam, children }: { exam: ExamKey; children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const stateRef = useRef<State | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

  const act = useCallback<Workspace["act"]>(
    async (body, opts = { reload: true }) => {
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

  const tree = useMemo(() => buildTree(exam, state?.prefs ?? {}, state?.records.custom), [exam, state?.prefs, state?.records.custom]);
  const focus = state ? focusOf(tree, state.prefs) : null;
  const subject = tree.subjects.find((s) => s.key === focus) ?? null;

  const setFocus = useCallback(
    (key: string | null) => {
      setState((s) => (s ? { ...s, prefs: { ...s.prefs, focus: key } } : s));
      void act({ action: "prefs", focus: key }, { reload: false });
    },
    [act],
  );

  const setStatus = useCallback(
    async (itemKey: string, status: string) => {
      const prev = stateRef.current?.records.progress.find((r) => r.itemKey === itemKey);
      const put = (row: ProgressRow | undefined) =>
        setState((s) => (s ? { ...s, records: { ...s.records, progress: [...s.records.progress.filter((r) => r.itemKey !== itemKey), ...(row ? [row] : [])] } } : s));
      put({ itemKey, revisions: 0, lastRevisedAt: null, questions: 0, ...prev, status });
      const res = await act({ action: "progress", itemKey, status }, { reload: false });
      if (!res.ok) {
        put(prev);
        return res.error;
      }
      if (res.data.row) put(res.data.row as ProgressRow);
      return null;
    },
    [act],
  );

  const m = useMemo(
    () => (state ? computeWorkspace({ tree, records: state.records, focus, targetDate: state.prefs.targetDate, hoursTarget: state.prefs.hoursTarget }) : null),
    [state, tree, focus],
  );

  const value = useMemo<Workspace>(() => ({ exam, state, tree, error, saving, load, act, setState, focus, subject, setFocus, m, setStatus }), [exam, state, tree, error, saving, load, act, focus, subject, setFocus, m, setStatus]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}
