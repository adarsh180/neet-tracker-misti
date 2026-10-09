"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

import { irisGo } from "@/components/iris";

export type DialIcon = ComponentType<{ size?: number; strokeWidth?: number }>;
export type DialItem = {
  href: string;
  label: string;
  /** Short name printed in the finger hole; the readout shows the full label. */
  short?: string;
  icon: DialIcon;
  group?: string;
  /** Kept for older callers; the rotary dial is a single rim. */
  ring?: 0 | 1;
};
export type DialAction = { label: string; icon?: DialIcon; onClick: () => void };

type Geo = { cx: number; cy: number; R: number; hole: number; step: number; focus: number; bi: number; bo: number; sx: number; sy: number; ro: { left: number; top: number; inside: boolean } };

const RAD = Math.PI / 180;
const polar = (r: number, a: number) => ({ x: Math.cos(a * RAD) * r, y: Math.sin(a * RAD) * r });
const wrap = (d: number) => ((d % 360) + 540) % 360 - 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function isHere(pathname: string, href: string, all: DialItem[]) {
  const path = href.split("?")[0];
  if (pathname === path) return true;
  if (!pathname.startsWith(`${path}/`)) return false;
  // Deepest match wins (/ai-insight/guru over /ai-insight).
  return !all.some((o) => {
    const p = o.href.split("?")[0];
    return o.href !== href && p.startsWith(`${path}/`) && (pathname === p || pathname.startsWith(`${p}/`));
  });
}

function DialGlyph() {
  return (
    <svg className="pd-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      {Array.from({ length: 7 }, (_, i) => {
        const p = polar(5.6, -200 + i * 32);
        return <circle key={i} cx={(12 + p.x).toFixed(2)} cy={(12 + p.y).toFixed(2)} r={1.3} fill="currentColor" opacity={i === 0 ? 1 : 0.7} />;
      })}
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

/**
 * The page menu as a rotary dialer. A liquid-glass dial pivots on a corner of
 * the screen; every page sits in a finger hole round its rim. Drag it, scroll
 * it or use the arrow keys and it turns with momentum, clicking into detents;
 * the page at the finger stop is read out inside the dial. Tap a hole and the
 * dial spins it to the stop — like dialling a number — then the circular iris
 * opens the page. Identical in both repos (styles in dial.css).
 */
export function PageDial({
  items,
  title = "Pages",
  label = "Open page menu",
  actions,
  variant,
  anchor = variant === "dock" ? "top-right" : "trigger",
}: {
  items: DialItem[];
  title?: string;
  label?: string;
  actions?: DialAction[];
  variant?: "dock";
  anchor?: "trigger" | "top-right";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [focus, setFocus] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const dial = useRef<HTMLDivElement>(null);
  const stop = useRef<HTMLSpanElement>(null);
  const links = useRef<Array<HTMLAnchorElement | null>>([]);
  const geoRef = useRef<Geo | null>(null);
  const focusRef = useRef(0);
  const sim = useRef({ rot: 0, vel: 0, target: null as number | null, raf: 0, last: 0, user: false });
  const drag = useRef<{ id: number; x0: number; y0: number; a: number; t: number; moved: number; hole: number | null; ring: boolean } | null>(null);
  const wheelAcc = useRef(0);
  useEffect(() => setMounted(true), []);

  const n = items.length;
  const here = items.findIndex((it) => isHere(pathname, it.href, items));
  const reduce = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── simulation: one number (the dial's turn) driven by a spring ── */
  const paint = useCallback(() => {
    const g = geoRef.current;
    const el = dial.current;
    if (!g || !el) return;
    const s = sim.current;
    el.style.setProperty("--rot", `${s.rot.toFixed(3)}deg`);
    const f = -s.rot / g.step;
    el.style.setProperty("--f", f.toFixed(3));
    const fi = clamp(Math.round(f), 0, n - 1);
    if (fi !== focusRef.current) {
      focusRef.current = fi;
      setFocus(fi);
      // A detent: a tick of the finger stop, and a tiny buzz on phones.
      stop.current?.animate([{ scale: "1.6" }, { scale: "1" }], { duration: 200, easing: "ease-out" });
      if (s.user) navigator.vibrate?.(4);
    }
  }, [n]);

  const frame = useCallback(
    (t: number) => {
      const s = sim.current;
      const dt = Math.min(0.034, Math.max(0.001, (t - s.last) / 1000));
      s.last = t;
      if (!drag.current && s.target !== null) {
        // Slightly under-damped: a dial settles with the smallest overshoot.
        const a = 210 * (s.target - s.rot) - 25 * s.vel;
        s.vel += a * dt;
        s.rot += s.vel * dt;
        if (Math.abs(s.target - s.rot) < 0.02 && Math.abs(s.vel) < 0.4) {
          s.rot = s.target;
          s.vel = 0;
          s.target = null;
        }
      }
      paint();
      s.raf = drag.current || s.target !== null ? requestAnimationFrame(frame) : 0;
    },
    [paint],
  );

  const kick = useCallback(() => {
    const s = sim.current;
    if (reduce() && s.target !== null) {
      s.rot = s.target;
      s.target = null;
      paint();
      return;
    }
    if (!s.raf) {
      s.last = performance.now();
      s.raf = requestAnimationFrame(frame);
    }
  }, [frame, paint]);

  const turnTo = useCallback(
    (i: number, user = true) => {
      const g = geoRef.current;
      if (!g) return;
      sim.current.user = user;
      sim.current.target = -clamp(i, 0, n - 1) * g.step;
      kick();
    },
    [kick, n],
  );

  /* ── open / close ── */
  const show = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = btn.current?.getBoundingClientRect();
    // The dial always pivots on a screen corner: the top-right one, or the corner nearest its button.
    const tx = anchor === "top-right" || !r ? vw : r.left + r.width / 2;
    const ty = anchor === "top-right" || !r ? 0 : r.top + r.height / 2;
    const sx = tx > vw / 2 ? -1 : 1;
    const sy = ty > vh / 2 ? -1 : 1;
    const cx = sx < 0 ? vw - 34 : 34;
    const cy = sy > 0 ? 36 : vh - 38;
    const focusA = Math.atan2(sy, sx) / RAD;
    const small = Math.min(vw, vh) < 560;
    const R = Math.round(clamp(Math.min(vw, vh) * (small ? 0.56 : 0.5), 190, 380));
    const hole = small ? 46 : 64;
    const step = Math.min(n > 1 ? 300 / (n - 1) : 30, Math.max((hole + 16) / R / RAD, 12));
    const bi = R - hole / 2 - (small ? 22 : 34);
    const bo = R + hole / 2 + 18;
    // Readout: inside the dial when there is room, otherwise just beyond the rim.
    const inside = bi > 230;
    const W = Math.min(260, vw - 24);
    // Compact (phones): a card clear of the rim, below the dial (or above it from a bottom corner).
    const p = polar(bi * 0.5, focusA);
    const ro = inside
      ? { left: clamp(cx + p.x - W / 2, 12, vw - W - 12), top: clamp(cy + p.y - 60, 12, vh - 170), inside }
      : { left: (vw - W) / 2, top: clamp(sy > 0 ? cy + bo + 18 : cy - bo - 190, 12, vh - 190), inside };
    const g = { cx, cy, R, hole, step, focus: focusA, bi, bo, sx, sy, ro };
    geoRef.current = g;
    setGeo(g);
    const f0 = here >= 0 ? here : 0;
    focusRef.current = f0;
    setFocus(f0);
    // Spin in from a turn away, settling on the page you are on.
    sim.current.rot = -f0 * step + 70 * (sx * sy > 0 ? -1 : 1);
    sim.current.vel = 0;
    sim.current.target = -f0 * step;
    sim.current.user = false;
    setClosing(false);
    setOpen(true);
  };

  const hide = useCallback(
    (focusBack = true) => {
      if (!open || closing) return;
      setClosing(true);
      const g = geoRef.current;
      if (g) {
        sim.current.user = false;
        sim.current.target = sim.current.rot + 50 * (g.sx * g.sy > 0 ? -1 : 1);
        kick();
      }
      window.setTimeout(() => {
        cancelAnimationFrame(sim.current.raf);
        sim.current.raf = 0;
        setOpen(false);
        setClosing(false);
        if (focusBack) btn.current?.focus({ preventScroll: true });
      }, reduce() ? 0 : 320);
    },
    [open, closing, kick],
  );

  useLayoutEffect(() => {
    if (!open || closing || !geo) return;
    paint();
    kick();
    links.current[focusRef.current]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, geo]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [open, hide]);

  useEffect(() => {
    setOpen(false);
    setClosing(false);
  }, [pathname]);

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), []);

  const go = (i: number) => {
    const it = items[i];
    const g = geoRef.current;
    if (!it || !g) return;
    if (i === here) return hide();
    const travel = Math.abs(-i * g.step - sim.current.rot);
    turnTo(i);
    window.setTimeout(
      () => {
        const p = polar(g.R, g.focus);
        irisGo(() => router.push(it.href), { x: g.cx + p.x, y: g.cy + p.y }, it.label);
        window.setTimeout(() => {
          setOpen(false);
          setClosing(false);
        }, 480);
      },
      reduce() || travel < 1 ? 60 : Math.min(520, 200 + travel * 4),
    );
  };

  /* ── input: drag the rim, wheel, keys ── */
  const angleAt = (x: number, y: number) => {
    const g = geoRef.current!;
    return Math.atan2(y - g.cy, x - g.cx) / RAD;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = geoRef.current;
    if (!g || closing || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".pd-hub, .pd-readout")) return;
    const d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
    const holeEl = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, a: angleAt(e.clientX, e.clientY), t: performance.now(), moved: 0, hole: holeEl ? Number(holeEl.dataset.i) : null, ring: d > g.bi - 40 && d < g.bo + 40 };
    if (drag.current.ring) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      sim.current.target = null;
      sim.current.vel = 0;
      sim.current.user = true;
      kick();
    }
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    const g = geoRef.current;
    if (!dr || !g || dr.id !== e.pointerId) return;
    dr.moved = Math.max(dr.moved, Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0));
    if (!dr.ring) return;
    const a = angleAt(e.clientX, e.clientY);
    const now = performance.now();
    let delta = wrap(a - dr.a);
    dr.a = a;
    const s = sim.current;
    const min = -(n - 1) * g.step;
    if (s.rot > 0 || s.rot < min) delta *= 0.32; // rubber band past the stops
    s.rot += delta;
    const dt = Math.max(1, now - dr.t) / 1000;
    s.vel = s.vel * 0.6 + (delta / dt) * 0.4;
    dr.t = now;
    paint();
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    const g = geoRef.current;
    if (!dr || !g || dr.id !== e.pointerId) return;
    drag.current = null;
    const tap = dr.moved < 7;
    if (tap) {
      sim.current.vel = 0;
      if (dr.hole !== null && !(e.ctrlKey || e.metaKey || e.shiftKey)) return go(dr.hole);
      if (dr.hole === null && !dr.ring) return hide();
      turnTo(focusRef.current);
      return;
    }
    // Fling: project the momentum, then settle on the nearest detent.
    const s = sim.current;
    const projected = s.rot + clamp(s.vel, -900, 900) * 0.22;
    turnTo(Math.round(-projected / g.step));
  };

  const onWheel = (e: React.WheelEvent) => {
    wheelAcc.current += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const steps = Math.trunc(wheelAcc.current / 55);
    if (!steps) return;
    wheelAcc.current -= steps * 55;
    const g = geoRef.current;
    if (!g) return;
    const base = sim.current.target ?? sim.current.rot;
    turnTo(Math.round(-base / g.step) + steps);
  };

  const onKey = (e: React.KeyboardEvent) => {
    let next: number | null = null;
    const f = focusRef.current;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = f + 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = f - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    next = clamp(next, 0, n - 1);
    turnTo(next);
    links.current[next]?.focus({ preventScroll: true });
  };

  const cur = items[focus];
  const CurIcon = cur?.icon;
  const groupStarts = items.map((it, i) => (it.group && (i === 0 || items[i - 1].group !== it.group) ? i : -1)).filter((i) => i >= 0);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`pd-trigger ${variant === "dock" ? "is-dock" : ""} ${open && !closing ? "is-open" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? hide() : show())}
      >
        <span className="pd-trigger-glass" aria-hidden="true" />
        <DialGlyph />
        {variant === "dock" ? <span className="pd-trigger-text">Menu</span> : null}
      </button>
      {mounted && open && geo
        ? createPortal(
            <div
              className={`pd-layer ${closing ? "is-closing" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              style={{ "--cx": `${geo.cx}px`, "--cy": `${geo.cy}px`, "--bo": `${geo.bo}px` } as CSSProperties}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                drag.current = null;
                turnTo(focusRef.current);
              }}
              onWheel={onWheel}
              onKeyDown={onKey}
            >
              <div
                ref={dial}
                className={`pd-dial ${geo.ro.inside ? "" : "is-compact"}`}
                style={{ left: geo.cx, top: geo.cy, "--R": `${geo.R}px`, "--hole": `${geo.hole}px`, "--bi": `${geo.bi}px`, "--bo": `${geo.bo}px`, "--focus": `${geo.focus}deg`, "--step": `${geo.step}deg` } as CSSProperties}
              >
                <div className="pd-core" aria-hidden="true" />
                <div className="pd-band" aria-hidden="true" />
                <div className="pd-plate" aria-hidden="true">
                  <svg viewBox={`${-geo.bo} ${-geo.bo} ${geo.bo * 2} ${geo.bo * 2}`} width={geo.bo * 2} height={geo.bo * 2}>
                    {Array.from({ length: (n - 1) * 4 + 9 }, (_, k) => {
                      const j = k - 4;
                      const a = geo.focus + (j * geo.step) / 4;
                      const major = j % 4 === 0 && j >= 0 && j <= (n - 1) * 4;
                      const p0 = polar(geo.bo - (major ? 15 : 9), a);
                      const p1 = polar(geo.bo - 4, a);
                      return <line key={k} className={major ? "major" : undefined} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} />;
                    })}
                    {[-1, n].map((j) => {
                      const p = polar(geo.bo - 10, geo.focus + j * geo.step);
                      return <circle key={j} className="pd-endstop" cx={p.x} cy={p.y} r={2.4} />;
                    })}
                  </svg>
                </div>
                <span className="pd-spot" aria-hidden="true" />
                {groupStarts.map((i) => (
                  <span key={`g${i}`} className="pd-group" style={{ "--i": i - 0.5 } as CSSProperties} aria-hidden="true">
                    <i>{items[i].group}</i>
                  </span>
                ))}
                <nav aria-label={title}>
                  {items.map((it, i) => {
                    const Icon = it.icon;
                    return (
                      <a
                        key={it.href}
                        ref={(el) => {
                          links.current[i] = el;
                        }}
                        href={it.href}
                        data-i={i}
                        className={`pd-hole ${i === focus ? "is-focus" : ""} ${i === here ? "is-here" : ""}`}
                        style={{ "--i": i } as CSSProperties}
                        aria-current={i === here ? "page" : undefined}
                        aria-label={it.group ? `${it.label} — ${it.group}` : it.label}
                        onFocus={() => i !== focusRef.current && turnTo(i, false)}
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                          e.preventDefault();
                          // Pointer taps are handled on pointer-up; this is Enter / Space from the keyboard.
                          if (e.detail === 0) go(i);
                        }}
                      >
                        <span className="pd-hole-in">
                          <Icon size={geo.hole > 50 ? 19 : 17} strokeWidth={i === here ? 2.4 : 1.9} />
                          <small>{it.short ?? it.label}</small>
                        </span>
                      </a>
                    );
                  })}
                </nav>
                <span className="pd-stop-arm" aria-hidden="true">
                  <span ref={stop} className="pd-stop" />
                </span>
              </div>
              <button type="button" className="pd-hub" style={{ left: geo.cx, top: geo.cy }} onClick={() => hide()} aria-label="Close menu">
                <X size={18} strokeWidth={2.2} />
              </button>
              <div className={`pd-readout ${geo.ro.inside ? "" : "is-out"}`} style={{ left: geo.ro.left, top: geo.ro.top }} aria-live="polite">
                <span className="pd-ro-meta">
                  {cur?.group ?? title}
                  <span className="pd-ro-idx">
                    {String(focus + 1).padStart(2, "0")}
                    <i>/{String(n).padStart(2, "0")}</i>
                  </span>
                </span>
                {cur && CurIcon ? (
                  <b key={cur.href} className="pd-ro-name">
                    <CurIcon size={20} strokeWidth={2} />
                    {cur.label}
                  </b>
                ) : null}
                <span className="pd-ro-hint">{focus === here ? "You are here" : "Tap the hole or press Enter"}</span>
                <span className="pd-ro-nav">
                  <button type="button" disabled={focus === 0} onClick={() => turnTo(focus - 1)} aria-label="Previous page">
                    ‹ {items[focus - 1]?.short ?? items[focus - 1]?.label ?? ""}
                  </button>
                  <button type="button" disabled={focus === n - 1} onClick={() => turnTo(focus + 1)} aria-label="Next page">
                    {items[focus + 1]?.short ?? items[focus + 1]?.label ?? ""} ›
                  </button>
                </span>
                {actions?.length ? (
                  <span className="pd-ro-actions">
                    {actions.map((a) => {
                      const Icon = a.icon;
                      return (
                        <button key={a.label} type="button" className="pd-action" onClick={a.onClick}>
                          {Icon ? <Icon size={13} strokeWidth={2.2} /> : null}
                          {a.label}
                        </button>
                      );
                    })}
                  </span>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
