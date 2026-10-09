/**
 * Circular page transition, used by the page dial and the dashboard switch.
 * A glass iris opens from the point you tapped and covers the page, the
 * navigation runs underneath, then the new page is revealed through a hole
 * that widens from the same point. Plain DOM + Web Animations (no React
 * state), clip-path / mask only, so it never blocks the router.
 * Identical in both repos (styles in dial.css).
 */

let busy = false;

const canAnimateHole = () => typeof CSS !== "undefined" && typeof CSS.registerProperty === "function";

function hrefNow() {
  return `${location.pathname}${location.search}`;
}

/** Waits until the URL changes (the router committed) or `ms` passes. */
function arrival(before: string, ms: number) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (hrefNow() !== before || performance.now() - start > ms) {
        // Two frames so the new page has painted under the iris.
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Runs `go` (a router push or similar) behind a circular cover. Falls back to
 * calling `go` directly when motion is reduced or a transition is running.
 */
export function irisGo(go: () => unknown, from?: { x: number; y: number }, label?: string) {
  if (typeof document === "undefined" || busy || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    void go();
    return;
  }
  busy = true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = from?.x ?? w / 2;
  const y = from?.y ?? h / 2;
  const r = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y))) + 12;

  const el = document.createElement("div");
  el.className = "iris";
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("--ix", `${x}px`);
  el.style.setProperty("--iy", `${y}px`);
  const wave = document.createElement("i");
  wave.className = "iris-wave";
  wave.style.cssText = `left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px`;
  el.appendChild(wave);
  if (label) {
    const b = document.createElement("b");
    b.className = "iris-label";
    b.textContent = label;
    el.appendChild(b);
  }
  document.body.appendChild(el);

  const done = () => {
    el.remove();
    busy = false;
  };

  const cover = el.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)` }], {
    duration: 420,
    easing: "cubic-bezier(0.7, 0, 0.25, 1)",
    fill: "forwards",
  });
  wave.animate([{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1)", opacity: 0.2 }], { duration: 420, easing: "cubic-bezier(0.7, 0, 0.25, 1)", fill: "forwards" });

  cover.finished
    .then(async () => {
      const before = hrefNow();
      await Promise.resolve(go()).catch(() => null);
      // Same URL after `go` settles (nothing navigated) → reveal soon; otherwise wait for the router.
      await arrival(before, hrefNow() === before ? 3000 : 0);
      el.classList.add("is-revealing");
      const reveal = canAnimateHole()
        ? el.animate([{ "--iris-hole": "0px" } as Keyframe, { "--iris-hole": `${r}px` } as Keyframe], { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" })
        : el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" });
      wave.animate([{ transform: "scale(0)", opacity: 0.9 }, { transform: "scale(1)", opacity: 0 }], { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
      await reveal.finished.catch(() => null);
    })
    .catch(() => null)
    .finally(done);
}
