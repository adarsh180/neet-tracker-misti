/**
 * Circular page transition, used by the page dial, the dashboard switch and
 * the rails. A glass disc grows from the point you tapped and covers the
 * page, the navigation runs underneath, then the disc lifts away. Plain DOM +
 * Web Animations on transform and opacity only, so the GPU moves it and it
 * never repaints the page or blocks the router.
 * Identical in both repos (styles in dial.css).
 */

let busy = false;

function hrefNow() {
  return `${location.pathname}${location.search}`;
}

/** Waits until the URL changes (the router committed) or `ms` passes. */
function arrival(before: string, ms: number) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (hrefNow() !== before || performance.now() - start > ms) {
        // Two frames so the new page has painted under the disc.
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return;
      }
      setTimeout(tick, 32);
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
  const disc = document.createElement("i");
  disc.className = "iris-disc";
  disc.style.cssText = `left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px`;
  el.appendChild(disc);
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

  const cover = disc.animate([{ transform: "scale(0.001)" }, { transform: "scale(1)" }], {
    duration: 440,
    easing: "cubic-bezier(0.7, 0, 0.25, 1)",
    fill: "forwards",
  });

  cover.finished
    .then(async () => {
      const before = hrefNow();
      await Promise.resolve(go()).catch(() => null);
      // Same URL after `go` settles (nothing navigated yet) → wait for the router, at most 3 s.
      await arrival(before, hrefNow() === before ? 3000 : 0);
      el.classList.add("is-revealing");
      const lift = disc.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.06)", opacity: 0 }], { duration: 480, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
      await lift.finished.catch(() => null);
    })
    .catch(() => null)
    .finally(done);
}
