/**
 * Smooth light/dark and palette changes. Animating colour variables on the
 * root restyles and repaints the whole page on every frame, which is what
 * made the switch crawl. Instead the browser snapshots the page once and the
 * change plays as a single GPU animation: a slow circular reveal from the
 * button for light/dark, a soft cross-fade for the minute palette. Browsers
 * without view transitions (or with reduced motion) switch instantly.
 * Identical in both repos (styles in dial.css).
 */

type ViewTransition = { ready: Promise<void>; finished: Promise<void> };
type DocWithVT = Document & { startViewTransition?: (update: () => void) => ViewTransition };

let running = false;

function run(kind: "theme" | "palette", apply: () => void, from?: { x: number; y: number }) {
  const doc = document as DocWithVT;
  const root = document.documentElement;
  if (running || typeof doc.startViewTransition !== "function" || document.visibilityState !== "visible" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }
  running = true;
  root.dataset.shift = kind;
  let t: ViewTransition;
  try {
    t = doc.startViewTransition(apply);
  } catch {
    apply();
    running = false;
    delete root.dataset.shift;
    return;
  }
  if (kind === "theme") {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = from?.x ?? w - 40;
    const y = from?.y ?? 40;
    const r = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
    t.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 950, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }
  t.finished.catch(() => {}).finally(() => {
    running = false;
    delete root.dataset.shift;
  });
}

/** Light/dark: a circular reveal from `from` (the button that was pressed). */
export const shiftTheme = (apply: () => void, from?: { x: number; y: number }) => run("theme", apply, from);
/** The minute palette: a slow cross-fade. */
export const shiftPalette = (apply: () => void) => run("palette", apply);

/** Centre of the element that was clicked, for the reveal's origin. */
export function originOf(el: Element | null) {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
}
