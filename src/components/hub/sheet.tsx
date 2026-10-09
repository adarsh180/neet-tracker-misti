"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";

import { useHub } from "./hub-context";

export type SheetField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "money";
  value?: string | number | null;
  options?: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  wide?: boolean;
  placeholder?: string;
};
export type SheetSpec = {
  title: string;
  subtitle?: string;
  fields: SheetField[];
  submit: string;
  /** Returns the server's error message, or null when saved. */
  onSubmit: (values: Record<string, string>) => Promise<string | null>;
  danger?: { label: string; confirm: string; onConfirm: () => Promise<string | null> };
  quick?: number[];
};

/** The single liquid-glass dialog Saath uses for every edit, rename and "add money". Identical in both repos. */
export function SheetHost() {
  const hub = useHub();
  const spec = hub.sheet;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setError(null);
    setClosing(false);
    if (!spec) return;
    const t = setTimeout(() => form.current?.querySelector<HTMLInputElement>("input, select, textarea")?.focus(), 80);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const close = () => {
    setClosing(true);
    setTimeout(() => hub.openSheet(null), 200);
  };

  if (!spec || typeof document === "undefined") return null;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values: Record<string, string> = {};
    new FormData(e.currentTarget).forEach((v, k) => (values[k] = String(v)));
    setBusy(true);
    setError(null);
    const err = await spec.onSubmit(values);
    setBusy(false);
    if (err) setError(err);
    else close();
  };

  return createPortal(
    <div className={`sth-sheet-layer ${closing ? "is-closing" : ""}`} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form ref={form} className="sth-sheet" onSubmit={submit} role="dialog" aria-label={spec.title}>
        <span className="sth-sheet-light" aria-hidden="true" />
        <header>
          <div>
            <h2>{spec.title}</h2>
            {spec.subtitle ? <p>{spec.subtitle}</p> : null}
          </div>
          <button type="button" className="sth-sheet-x" onClick={close} aria-label="Close"><X size={17} /></button>
        </header>
        <div className="sth-sheet-fields">
          {spec.fields.map((f) => (
            <label key={f.name} className={`sth-field ${f.wide || f.type === "textarea" ? "is-wide" : ""}`}>
              {f.label}
              {f.type === "select" ? (
                <select name={f.name} defaultValue={f.value == null ? "" : String(f.value)} required={f.required}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea name={f.name} defaultValue={f.value == null ? "" : String(f.value)} rows={3} placeholder={f.placeholder} />
              ) : (
                <input
                  name={f.name}
                  type={f.type === "money" ? "number" : f.type}
                  inputMode={f.type === "money" || f.type === "number" ? "decimal" : undefined}
                  defaultValue={f.value == null ? "" : String(f.value)}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  step={f.step ?? (f.type === "money" ? "0.01" : undefined)}
                  placeholder={f.placeholder}
                />
              )}
              {f.hint ? <small>{f.hint}</small> : null}
            </label>
          ))}
        </div>
        {spec.quick?.length ? (
          <div className="sth-quick" role="group" aria-label="Quick amounts">
            {spec.quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  const input = form.current?.querySelector<HTMLInputElement>("input[name=amount]");
                  if (input) input.value = String(q);
                }}
              >
                ₹{q.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="sth-error" role="alert">{error}</p> : null}
        <footer>
          {spec.danger ? (
            <button
              type="button"
              className="sth-btn is-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm(spec.danger!.confirm)) return;
                setBusy(true);
                const err = await spec.danger!.onConfirm();
                setBusy(false);
                if (err) setError(err);
                else close();
              }}
            >
              <Trash2 size={14} /> {spec.danger.label}
            </button>
          ) : <span />}
          <span className="sth-sheet-actions">
            <button type="button" className="sth-btn" onClick={close}>Cancel</button>
            <button type="submit" className="sth-btn is-primary" disabled={busy}>{busy ? "Saving…" : spec.submit}</button>
          </span>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
