"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";

import { irisGo } from "@/components/iris";

export type OrbitItem = { key: string; label: string; sub?: string; logo: string; current?: boolean; locked?: boolean; onPick: () => void | Promise<void> };

const COIN = 64;
const SPRING = "cubic-bezier(0.25, 1.3, 0.4, 1)";

/**
 * The dashboard switch, on every screen size: a liquid-glass coin showing the
 * dashboard you are in. Tap it and the other dashboards' logos travel out
 * along a real circular arc from the coin — transforms only, so the motion
 * stays on the GPU and never stutters — and settle on a glass quarter-ring.
 * Opens toward the inside of the screen from whichever corner it sits in.
 * Identical in both repos.
 */
export function DashOrbit({ items, label = "Switch dashboard" }: { items: OrbitItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [geo, setGeo] = useState<{ x: number; y: number; sx: number; sy: number; r: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const coins = useRef<Array<HTMLButtonElement | null>>([]);
  const current = items.find((i) => i.current) ?? items[0];
  useEffect(() => setMounted(true), []);

  const n = items.length;
  // Angles across a quarter turn pointing into the screen; positions are fixed pixels, motion is transform-only.
  const spots = useCallback(
    (g: { sx: number; sy: number; r: number }) =>
      items.map((_, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const a = ((6 + 78 * t) * Math.PI) / 180;
        return { dx: g.sx * Math.cos(a) * g.r, dy: g.sy * Math.sin(a) * g.r, a };
      }),
    [items, n],
  );

  const arcFrames = useCallback(
    (g: { sx: number; sy: number; r: number }, p: { dx: number; dy: number; a: number }) => {
      const frames: Keyframe[] = [];
      const steps = 10;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const e = 1 - Math.pow(1 - f, 3); // ease-out along the path itself
        const ang = p.a * e - (1 - e) * 1.1; // sweeps round from behind the coin
        const rad = g.r * (0.1 + 0.9 * e);
        frames.push({
          transform: `translate(${(g.sx * Math.cos(ang) * rad - p.dx).toFixed(1)}px, ${(g.sy * Math.sin(ang) * rad - p.dy).toFixed(1)}px) scale(${(0.35 + 0.65 * e).toFixed(3)}) rotate(${((1 - e) * -40 * g.sx).toFixed(1)}deg)`,
          opacity: Math.min(1, f * 2.4),
          offset: f,
        });
      }
      return frames;
    },
    [],
  );

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const room = Math.min(window.innerWidth, window.innerHeight);
    setGeo({ x, y, sx: x > window.innerWidth / 2 ? -1 : 1, sy: y > window.innerHeight / 2 ? -1 : 1, r: Math.min(n > 3 ? 236 : 168, room * 0.56) });
    setClosing(false);
    setOpen(true);
  };

  const hide = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = geo ? spots(geo) : [];
    const anims = coins.current.slice(0, n).map((el, i) =>
      el && geo && pts[i] && !reduce
        ? el.animate([...arcFrames(geo, pts[i])].reverse().map((k, j, all) => ({ ...k, offset: j / (all.length - 1) })), { duration: 340, delay: (n - 1 - i) * 30, easing: "cubic-bezier(0.55, 0, 0.8, 0.3)", fill: "forwards" })
        : el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, fill: "forwards" }),
    );
    Promise.all(anims.map((a) => a?.finished.catch(() => null))).then(() => {
      setOpen(false);
      setClosing(false);
    });
  }, [open, closing, n, geo, spots, arcFrames]);

  // Fly each coin out along the arc: sampled points on the circle, so the path is truly circular.
  useLayoutEffect(() => {
    if (!open || !geo || closing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    spots(geo).forEach((p, i) => {
      const el = coins.current[i];
      if (!el) return;
      el.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : arcFrames(geo, p), { duration: reduce ? 120 : 620, delay: i * 60, easing: SPRING, fill: "backwards" });
      el.style.setProperty("--land", `${reduce ? 0 : 420 + i * 60}ms`);
    });
  }, [open, geo, closing, spots, arcFrames]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", hide);
    };
  }, [open, hide]);

  const pts = geo ? spots(geo) : [];

  return (
    <>
      <button ref={btn} type="button" className={`do-trigger ${open && !closing ? "is-open" : ""}`} aria-label={`${label} — now in ${current?.label ?? ""}`} aria-expanded={open} onClick={() => (open ? hide() : show())}>
        <span className="do-trigger-glass" aria-hidden="true" />
        <img className="do-trigger-logo" src={current?.logo} alt="" draggable={false} />
        <span className="do-trigger-x" aria-hidden="true"><X size={16} strokeWidth={2.4} /></span>
      </button>
      {mounted && open && geo
        ? createPortal(
            <div className={`do-layer ${closing ? "is-closing" : ""}`} onPointerDown={(e) => e.target === e.currentTarget && hide()}>
              <div className="do-dial" style={{ left: geo.x, top: geo.y, "--dr": `${geo.r + 62}px` } as CSSProperties} aria-hidden="true" />
              <svg className="do-track" aria-hidden="true">
                <circle cx={geo.x} cy={geo.y} r={geo.r} />
              </svg>
              <nav aria-label={label} onPointerDown={(e) => e.target === e.currentTarget && hide()}>
                {items.map((it, i) => (
                  <button
                    key={it.key}
                    ref={(el) => {
                      coins.current[i] = el;
                    }}
                    type="button"
                    className={`do-coin ${it.current ? "is-current" : ""}`}
                    style={{ left: geo.x + pts[i].dx - COIN / 2, top: geo.y + pts[i].dy - COIN / 2 } as CSSProperties}
                    disabled={busy !== null}
                    aria-current={it.current ? "page" : undefined}
                    onPointerMove={(e) => {
                      if (e.pointerType !== "mouse") return;
                      const r = e.currentTarget.getBoundingClientRect();
                      e.currentTarget.style.setProperty("--tx", `${((e.clientX - (r.left + r.width / 2)) * 0.18).toFixed(1)}px`);
                      e.currentTarget.style.setProperty("--ty", `${((e.clientY - (r.top + 32)) * 0.18).toFixed(1)}px`);
                    }}
                    onPointerLeave={(e) => {
                      e.currentTarget.style.setProperty("--tx", "0px");
                      e.currentTarget.style.setProperty("--ty", "0px");
                    }}
                    onClick={(e) => {
                      if (it.current) return hide();
                      // The switch plays the circular iris from the chosen logo into the other dashboard.
                      const r = e.currentTarget.querySelector(".do-coin-face")?.getBoundingClientRect();
                      setBusy(it.key);
                      irisGo(
                        async () => {
                          try {
                            await it.onPick();
                          } finally {
                            setBusy(null);
                          }
                        },
                        r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined,
                        it.label,
                      );
                      window.setTimeout(hide, 480);
                    }}
                  >
                    <span className="do-coin-face">
                      <img src={it.logo} alt="" draggable={false} />
                      {busy === it.key ? <span className="do-coin-spin" /> : null}
                    </span>
                    <span className="do-coin-label">
                      <b>{it.label}</b>
                      <small>{it.current ? "You are here" : it.locked ? <><Lock size={10} /> password</> : it.sub ?? "Open"}</small>
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
