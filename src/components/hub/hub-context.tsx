"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { computeHub, type HubMetrics, type HubRecords, type View } from "../../lib/hub/metrics";
import type { SheetSpec } from "./sheet";

/**
 * Personal hub data for one browser: loaded once for every tab, every write
 * scoped by the server to the signed-in person. Identical in both repos — the
 * site passes where its API lives and how to lock.
 */

type Hub = {
  records: HubRecords | null;
  m: HubMetrics | null;
  error: string | null;
  saving: boolean;
  view: View;
  setView: (v: View) => void;
  load: () => Promise<void>;
  act: (body: Record<string, unknown>) => Promise<string | null>;
  base: string;
  site: "upsc" | "neet";
  lock: () => Promise<void>;
  /** One glass dialog for every edit / add-money / rename. */
  sheet: SheetSpec | null;
  openSheet: (spec: SheetSpec | null) => void;
};

const Ctx = createContext<Hub | null>(null);
const VIEW_KEY = "saath-view";

export function HubProvider({ base, site, api, lockUrl, children }: { base: string; site: "upsc" | "neet"; api: string; lockUrl: string; children: React.ReactNode }) {
  const [records, setRecords] = useState<HubRecords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setViewState] = useState<View>("all");
  const [sheet, openSheet] = useState<SheetSpec | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "all" || v === "adarsh" || v === "misti") setViewState(v);
    } catch {}
  }, []);
  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(api, { cache: "no-store", signal: ctrl.signal });
      if (res.status === 401) {
        window.location.replace(`${base}/unlock`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load the dashboard.");
      if (alive.current) {
        setRecords(data as HubRecords);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).name === "AbortError" ? "The server took too long — retry usually works." : (e as Error).message);
    } finally {
      clearTimeout(t);
    }
  }, [api, base]);

  useEffect(() => {
    alive.current = true;
    void load();
    const onFocus = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.status === 401) {
          window.location.replace(`${base}/unlock`);
          return "Locked";
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return (data.error as string) ?? "Could not save.";
        await load();
        return null;
      } catch {
        return "Network error — nothing was saved.";
      } finally {
        if (alive.current) setSaving(false);
      }
    },
    [api, base, load],
  );

  const lock = useCallback(async () => {
    await fetch(lockUrl, { method: "POST" }).catch(() => null);
    window.location.replace(site === "upsc" ? "/dashboard" : "/exam");
  }, [lockUrl, site]);

  const m = useMemo(() => (records ? computeHub(records, view) : null), [records, view]);
  const value = useMemo<Hub>(() => ({ records, m, error, saving, view, setView, load, act, base, site, lock, sheet, openSheet }), [records, m, error, saving, view, setView, load, act, base, site, lock, sheet]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHub must be used inside HubProvider");
  return v;
}
