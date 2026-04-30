// Cinematic graph engine — chapter-based zoom, progressive drawing, pulse rings
// Deterministic. No AI-generated values.

export type CinematicView = { xMin: number; xMax: number; yMin: number; yMax: number };

export type CinematicChapter = {
  name: string;
  start: number; // 0-1
  end: number;   // 0-1
  view: CinematicView;
};

export type IntersectionMark = { x: number; y: number; label: string };

// ── Easing ───────────────────────────────────────────────────────────────────
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── View interpolation ────────────────────────────────────────────────────────
export function interpolateView(chapters: CinematicChapter[], progress: number): CinematicView {
  const idx = chapters.findIndex(c => progress <= c.end);
  const i = idx === -1 ? chapters.length - 1 : idx;
  const cur = chapters[i];
  const prev = chapters[Math.max(0, i - 1)];
  const local = clamp((progress - cur.start) / Math.max(cur.end - cur.start, 0.001), 0, 1);
  const t = easeInOutCubic(clamp(local / 0.45, 0, 1));
  const from = i === 0 ? cur.view : prev.view;
  return {
    xMin: lerp(from.xMin, cur.view.xMin, t),
    xMax: lerp(from.xMax, cur.view.xMax, t),
    yMin: lerp(from.yMin, cur.view.yMin, t),
    yMax: lerp(from.yMax, cur.view.yMax, t),
  };
}

export function getCurrentChapter(chapters: CinematicChapter[], progress: number): CinematicChapter {
  return chapters.find(c => progress >= c.start && progress <= c.end) ?? chapters[chapters.length - 1];
}

// ── Projector ─────────────────────────────────────────────────────────────────
export type Projector = { x(v: number): number; y(v: number): number };
export type GraphRect = { left: number; top: number; right: number; bottom: number; w: number; h: number };

export function makeProjector(view: CinematicView, rect: GraphRect): Projector {
  const xRange = Math.max(view.xMax - view.xMin, 1e-9);
  const yRange = Math.max(view.yMax - view.yMin, 1e-9);
  return {
    x: (v: number) => rect.left + ((v - view.xMin) / xRange) * rect.w,
    y: (v: number) => rect.bottom - ((v - view.yMin) / yRange) * rect.h,
  };
}

export function graphRect(w: number, h: number): GraphRect {
  const l = 62, t = 42, r = 28, b = 42;
  return { left: l, top: t, right: w - r, bottom: h - b, w: w - l - r, h: h - t - b };
}

// ── Grid ──────────────────────────────────────────────────────────────────────
function niceStep(range: number, ticks: number): number {
  const rough = range / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
  const n = rough / pow;
  if (n < 1.5) return pow;
  if (n < 3) return 2 * pow;
  if (n < 7) return 5 * pow;
  return 10 * pow;
}
function fmtTick(v: number): string {
  if (Math.abs(v) >= 1000) return Math.round(v).toString();
  if (Math.abs(v) >= 10) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function drawGrid(ctx: CanvasRenderingContext2D, view: CinematicView, rect: GraphRect, P: Projector) {
  ctx.save();
  const xs = niceStep(view.xMax - view.xMin, 7);
  const ys = niceStep(view.yMax - view.yMin, 6);
  ctx.font = "11px Inter,sans-serif";
  ctx.textBaseline = "middle";

  // Clip to rect
  ctx.beginPath();
  ctx.rect(rect.left - 2, rect.top - 2, rect.w + 4, rect.h + 4);
  ctx.clip();

  // Grid lines
  ctx.strokeStyle = "rgba(120,235,255,0.11)";
  ctx.lineWidth = 1;
  for (let x = Math.ceil(view.xMin / xs) * xs; x <= view.xMax + 1e-9; x += xs) {
    const sx = P.x(x);
    ctx.beginPath(); ctx.moveTo(sx, rect.top); ctx.lineTo(sx, rect.bottom); ctx.stroke();
  }
  for (let y = Math.ceil(view.yMin / ys) * ys; y <= view.yMax + 1e-9; y += ys) {
    const sy = P.y(y);
    ctx.beginPath(); ctx.moveTo(rect.left, sy); ctx.lineTo(rect.right, sy); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = "rgba(255,255,255,0.52)";
  ctx.lineWidth = 1.4;
  if (view.yMin <= 0 && view.yMax >= 0) { const y0 = P.y(0); ctx.beginPath(); ctx.moveTo(rect.left, y0); ctx.lineTo(rect.right, y0); ctx.stroke(); }
  if (view.xMin <= 0 && view.xMax >= 0) { const x0 = P.x(0); ctx.beginPath(); ctx.moveTo(x0, rect.top); ctx.lineTo(x0, rect.bottom); ctx.stroke(); }
  ctx.restore();

  // Labels (outside clip)
  ctx.save();
  ctx.font = "11px Inter,sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textBaseline = "top";
  for (let x = Math.ceil(view.xMin / xs) * xs; x <= view.xMax + 1e-9; x += xs) {
    ctx.fillText(fmtTick(x), P.x(x) - 10, rect.bottom + 5);
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let y = Math.ceil(view.yMin / ys) * ys; y <= view.yMax + 1e-9; y += ys) {
    ctx.fillText(fmtTick(y), rect.left - 5, P.y(y));
  }
  ctx.textAlign = "start";
  ctx.restore();
}

// ── Curve drawing ─────────────────────────────────────────────────────────────
export function drawCurveProgressive(
  ctx: CanvasRenderingContext2D,
  P: Projector,
  rect: GraphRect,
  fn: (x: number) => number,
  xStart: number,
  xEnd: number,
  drawX: number,      // how far the curve has drawn itself
  color: string,
  lineWidth = 2.8
) {
  const end = Math.min(drawX, xEnd);
  if (end <= xStart) return;
  const samples = Math.max(320, Math.floor(rect.w * 1.4));
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.w, rect.h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth + 5;
  ctx.globalAlpha = 0.12;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  let moved = false;
  for (let i = 0; i <= samples; i++) {
    const x = xStart + (i / samples) * (end - xStart);
    const y = fn(x);
    if (!Number.isFinite(y) || Math.abs(y) > 1e6) { moved = false; continue; }
    const sx = P.x(x), sy = P.y(y);
    if (!moved) { ctx.moveTo(sx, sy); moved = true; } else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  moved = false;
  for (let i = 0; i <= samples; i++) {
    const x = xStart + (i / samples) * (end - xStart);
    const y = fn(x);
    if (!Number.isFinite(y) || Math.abs(y) > 1e6) { moved = false; continue; }
    const sx = P.x(x), sy = P.y(y);
    if (!moved) { ctx.moveTo(sx, sy); moved = true; } else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Moving tracking dot ───────────────────────────────────────────────────────
export function drawTrackingDot(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  color: string,
  label: string,
  offsetY: number,
  canvasW: number,
  canvasH: number
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = "700 11px Inter,sans-serif";
  const tw = ctx.measureText(label).width;
  const tx = clamp(sx + 14, 8, canvasW - tw - 20);
  const ty = clamp(sy + offsetY, 14, canvasH - 20);
  // Badge bg
  ctx.fillStyle = "rgba(4,4,14,0.72)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const bx = tx - 8, by = ty - 13, bw = tw + 16, bh = 23, br = 10;
  ctx.moveTo(bx + br, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, br);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, br); ctx.arcTo(bx, by + bh, bx, by, br);
  ctx.arcTo(bx, by, bx + bw, by, br); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(label, tx, ty + 4);
  ctx.restore();
}

// ── Pulse ring ─────────────────────────────────────────────────────────────────
export function drawPulseRing(ctx: CanvasRenderingContext2D, sx: number, sy: number, age: number) {
  const t = clamp(age / 950, 0, 1);
  const r = 8 + t * 38;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${(1 - t).toFixed(3)})`;
  ctx.lineWidth = 1.8;
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Intersection dot ──────────────────────────────────────────────────────────
export function drawIntersectionDot(ctx: CanvasRenderingContext2D, sx: number, sy: number, label: string, canvasW: number) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = "700 11px Inter,sans-serif";
  const tw = ctx.measureText(label).width;
  const tx = clamp(sx + 12, 8, canvasW - tw - 16);
  const ty = sy - 20;
  ctx.fillStyle = "rgba(4,4,14,0.7)";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const bx = tx - 7, by = ty - 13, bw = tw + 14, bh = 22, br = 9;
  ctx.moveTo(bx + br, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, br);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, br); ctx.arcTo(bx, by + bh, bx, by, br);
  ctx.arcTo(bx, by, bx + bw, by, br); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(label, tx, ty);
  ctx.restore();
}

// ── Canvas frame box ──────────────────────────────────────────────────────────
export function drawFrameBox(ctx: CanvasRenderingContext2D, rect: GraphRect) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.018)";
  const r = 16;
  const x = rect.left - 14, y = rect.top - 14, w = rect.w + 28, h = rect.h + 28;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ── Equation label overlay ────────────────────────────────────────────────────
export function drawEquationLabels(ctx: CanvasRenderingContext2D, rect: GraphRect, labels: Array<{ text: string; color: string }>) {
  const padX = rect.right - 14;
  const startY = rect.top + 22;
  ctx.save();
  ctx.font = "700 13px Inter,sans-serif";
  labels.forEach((lbl, i) => {
    const tw = ctx.measureText(lbl.text).width;
    const x = padX - tw - 16;
    const y = startY + i * 26;
    ctx.fillStyle = "rgba(4,4,14,0.55)";
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 14, tw + 24, 22, 10);
    ctx.fill(); ctx.stroke();
    ctx.shadowColor = lbl.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = lbl.color;
    ctx.fillText(lbl.text, x, y + 1);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

// ── Format helper ─────────────────────────────────────────────────────────────
export function fmtCoord(v: number): string {
  if (!Number.isFinite(v)) return "∞";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
}
