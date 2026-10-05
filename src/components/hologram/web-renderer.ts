import { createHologramMorphGL } from "../../../shared/hologram/morph-renderer";
import { HologramMotion } from "../../../shared/hologram/motion";
import { type HologramInputs } from "../../../shared/hologram/geometry";
import { FORM_PARTICLES } from "../../../shared/hologram/forms";
import { createCanvasFallback } from "./canvas-fallback";
export type RenderStats = {
  kind: "webgl" | "canvas";
  count: number;
  lost: boolean;
};
export function mountHologram(
  stage: HTMLElement,
  motion: HologramMotion,
  getInput: () => HologramInputs,
  onStats: (stats: RenderStats) => void,
  forceCanvas = false,
) {
  let canvas = document.createElement("canvas"),
    renderer:
      | ReturnType<typeof createHologramMorphGL>
      | ReturnType<typeof createCanvasFallback>,
    width = 1,
    height = 1,
    dpr = 1,
    frame = 0,
    last = 0,
    visible = true,
    disposed = false,
    lost = false,
    slow = 0,
    count = FORM_PARTICLES,
    lastCount = 0;
  canvas.setAttribute("aria-hidden", "true");
  stage.prepend(canvas);
  const publish = () => onStats({ kind: renderer.kind, count, lost });
  const makeRenderer = () => {
    try {
      if (forceCanvas) throw new Error();
      const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      });
      if (!gl) throw new Error();
      renderer = createHologramMorphGL(gl);
    } catch {
      const replacement = document.createElement("canvas");
      replacement.setAttribute("aria-hidden", "true");
      canvas.replaceWith(replacement);
      canvas = replacement;
      renderer = createCanvasFallback(canvas);
    }
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
  };
  const resize = () => {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    dpr = Math.min(devicePixelRatio || 1, width < 700 ? 1.5 : 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    renderer.resize(canvas.width, canvas.height);
  };
  const quality = () => {
    const q = getInput().quality;
    return renderer.kind === "canvas"
      ? 1600
      : q === "low"
        ? 4500
        : q === "medium"
          ? 8500
          : q === "high"
            ? FORM_PARTICLES
            : Math.min(count, FORM_PARTICLES);
  };
  function tick(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (lost || !visible || document.hidden) {
      last = now;
      return;
    }
    const input = getInput();
    if (now - last < 32) return;
    const elapsed = last ? now - last : 33;
    last = now;
    if (input.quality === undefined || input.quality === "auto") {
      slow = elapsed > 48 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 90 && count > 4500) {
        count = count > 8500 ? 8500 : 4500;
        slow = 0;
      }
    }
    count = quality();
    if (count !== lastCount) {
      lastCount = count;
      publish();
    }
    motion.step(elapsed / 1000, input);
    renderer.draw(motion, input, width, height, dpr, count);
  }
  function contextLost(e: Event) {
    e.preventDefault();
    lost = true;
    publish();
  }
  function contextRestored() {
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    renderer.dispose();
    makeRenderer();
    lost = false;
    resize();
    publish();
  }
  makeRenderer();
  count = quality();
  resize();
  publish();
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  visibility.observe(stage);
  let drag: {
      x: number;
      y: number;
      dx: number;
      dy: number;
      id: number;
      touch: boolean;
    } | null = null,
    moved = false;
  const down = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag = {
      x: e.clientX,
      y: e.clientY,
      dx: motion.dragTarget[0],
      dy: motion.dragTarget[1],
      id: e.pointerId,
      touch: e.pointerType !== "mouse",
    };
    moved = false;
    if (!drag.touch) stage.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    motion.pointerTarget = [
      ((e.clientX - r.left) / r.width) * 2 - 1,
      ((e.clientY - r.top) / r.height) * 2 - 1,
    ];
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (drag.touch && Math.abs(dy) > Math.abs(dx)) return;
    motion.dragTarget = [
      drag.dx + dx * 0.006,
      Math.max(-1.3, Math.min(1.3, drag.dy + dy * 0.004)),
    ];
  };
  const up = () => {
    if (drag && !moved) motion.pulse(getInput().reducedMotion);
    drag = null;
  };
  const cancel = () => {
    drag = null;
  };
  const leave = () => {
    motion.pointerTarget = [0, 0];
  };
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointermove", move, { passive: true });
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", cancel);
  stage.addEventListener("pointerleave", leave);
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    visibility.disconnect();
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    stage.removeEventListener("pointerdown", down);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerup", up);
    stage.removeEventListener("pointercancel", cancel);
    stage.removeEventListener("pointerleave", leave);
    renderer.dispose();
    canvas.remove();
  };
}
