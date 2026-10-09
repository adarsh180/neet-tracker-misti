"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Orbit, X } from "lucide-react";

export type OrbitItem = { key: string; label: string; sub?: string; icon: ReactNode; current?: boolean; locked?: boolean; onPick: () => void | Promise<void> };

/**
 * The dashboard switch: one round button; tap it and the dashboards fan out
 * along an arc from that corner, sweeping round on a circular path. Opens
 * toward the inside of the screen whichever corner it sits in. Identical in
 * both repos.
 */
export function DashOrbit({ items, label = "Switch dashboard" }: { items: OrbitItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number; right: boolean; bottom: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggle = () => {
    if (open) return setOpen(false);
    const r = btn.current?.getBoundingClientRect();
    if (r) setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.left > window.innerWidth / 2, bottom: r.top > window.innerHeight / 2 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Fan the items across a quarter circle that points into the screen.
  const n = items.length;
  const radius = n > 3 ? 214 : 162;
  const start = origin?.right ? 180 : 0;
  const dir = origin?.right ? -1 : 1;
  const flip = origin?.bottom ? -1 : 1;
  const angle = (i: number) => (start + dir * (2 + (76 / Math.max(1, n - 1)) * i)) * flip;

  return (
    <>
      <button ref={btn} type="button" className={`do-trigger ${open ? "is-open" : ""}`} aria-label={label} aria-expanded={open} onClick={toggle}>
        <span className="do-trigger-ring" aria-hidden="true" />
        {open ? <X size={17} /> : <Orbit size={18} />}
      </button>
      {mounted && open && origin
        ? createPortal(
            <div className="do-layer" onClick={() => setOpen(false)}>
              <div className="do-halo" style={{ left: origin.x, top: origin.y, "--hr": `${radius + 34}px` } as CSSProperties} aria-hidden="true" />
              <nav className="do-ring" style={{ left: origin.x, top: origin.y } as CSSProperties} aria-label={label} onClick={(e) => e.stopPropagation()}>
                {items.map((it, i) => (
                  <button
                    key={it.key}
                    type="button"
                    className={`do-item ${it.current ? "is-current" : ""}`}
                    style={{ "--a": `${angle(i)}deg`, "--r": `${radius}px`, "--i": i } as CSSProperties}
                    disabled={busy !== null}
                    aria-current={it.current ? "page" : undefined}
                    onClick={async () => {
                      if (it.current) return setOpen(false);
                      setBusy(it.key);
                      try {
                        await it.onPick();
                      } finally {
                        setBusy(null);
                        setOpen(false);
                      }
                    }}
                  >
                    <span className="do-dot">{busy === it.key ? <span className="do-spin" /> : it.icon}</span>
                    <span className="do-label">
                      {it.label}
                      {it.locked && !it.current ? <small>password</small> : it.sub ? <small>{it.sub}</small> : null}
                    </span>
                  </button>
                ))}
              </nav>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
