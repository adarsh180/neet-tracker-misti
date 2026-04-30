"use client";

import type { VisualConcept } from "@/lib/visual-lab/types";
import type { VariableValues } from "@/lib/visual-lab/types";
import { circularMotionState, springMassState, workEnergyState, clamp } from "@/lib/visual-lab/simulations";

type Hotspot = {
  x: number;
  y: number;
  r: number;
  object: {
    id: string;
    label: string;
    kind: string;
    description: string;
    formulaConnection: string;
    neetTakeaway: string;
    commonMistake: string;
    x?: number;
    y?: number;
  };
};

function glowLine(ctx: CanvasRenderingContext2D, color: string, width: number, path: () => void) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width + 6;
  ctx.globalAlpha = 0.13;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.lineWidth = width;
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label?: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (label) {
    ctx.fillStyle = "rgba(246,240,230,0.82)";
    ctx.font = "11px Inter,sans-serif";
    ctx.fillText(label, x + 9, y - 6);
  }
  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 9 * Math.cos(angle - 0.5), y2 - 9 * Math.sin(angle - 0.5));
  ctx.lineTo(x2 - 9 * Math.cos(angle + 0.5), y2 - 9 * Math.sin(angle + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function getObj(concept: VisualConcept, id: string) {
  const found = concept.visualObjects.find((o) => o.id === id) ?? concept.visualObjects[0];
  return found ?? { id, label: id, kind: "object", description: "", formulaConnection: "", neetTakeaway: "", commonMistake: "" };
}

export function drawCircularMotion(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  time: number,
  hotspots: Hotspot[]
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const s = circularMotionState(values, time);
  const scale = Math.min(w, h) / 400;
  const r = s.r * scale;
  const bx = cx + s.px * scale;
  const by = cy + s.py * scale;

  // Orbit ring
  glowLine(ctx, "rgba(77,214,255,0.28)", 1.2, () => {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  });
  // Centre point
  dot(ctx, cx, cy, "#ffffff");

  // Body
  ctx.save();
  ctx.fillStyle = "#ffcf70";
  ctx.shadowColor = "#ffcf70";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(bx, by, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Velocity (tangential)
  const vScale = 28;
  const mag = Math.hypot(s.ux, s.uy) || 1;
  arrow(ctx, bx, by, bx + (s.ux / mag) * vScale, by + (s.uy / mag) * vScale, "#66f0a3");

  // Centripetal force (toward centre)
  const aScale = 32;
  const amag = Math.hypot(s.ax, s.ay) || 1;
  arrow(ctx, bx, by, bx + (s.ax / amag) * aScale, by + (s.ay / amag) * aScale, "#ff7979");

  // Labels
  ctx.save();
  ctx.fillStyle = "rgba(246,240,230,0.62)";
  ctx.font = "11px Inter,sans-serif";
  ctx.fillText(`Fc = ${s.Fc.toFixed(1)} N`, cx + r + 8, cy - 12);
  ctx.fillText(`T = ${s.period.toFixed(2)} s`, cx + r + 8, cy + 8);
  ctx.restore();

  hotspots.push({ x: bx, y: by, r: 26, object: { ...getObj(concept, "centripetal-force"), x: bx, y: by } });
  hotspots.push({ x: cx, y: cy, r: 18, object: { ...getObj(concept, "velocity-vector"), x: cx, y: cy } });
}

export function drawSpringMass(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  time: number,
  hotspots: Hotspot[]
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cy = h / 2;
  const wallX = Math.max(54, w * 0.09);
  const s = springMassState(values, time);
  const equilibriumX = w * 0.48;
  const massX = equilibriumX + s.x;
  const massSize = clamp(Math.min(w, h) * 0.09, 40, 62);
  const railY = cy + massSize * 0.78;

  ctx.save();
  ctx.fillStyle = "rgba(246,240,230,0.13)";
  ctx.fillRect(wallX - 18, cy - 78, 18, 156);
  ctx.strokeStyle = "rgba(246,240,230,0.22)";
  for (let y = cy - 72; y < cy + 78; y += 15) {
    ctx.beginPath();
    ctx.moveTo(wallX - 18, y + 12);
    ctx.lineTo(wallX, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(36, railY);
  ctx.lineTo(w - 44, railY);
  ctx.stroke();
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = "rgba(185,255,106,0.38)";
  ctx.beginPath();
  ctx.moveTo(equilibriumX, cy - 78);
  ctx.lineTo(equilibriumX, railY + 20);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(185,255,106,0.72)";
  ctx.font = "11px Inter,sans-serif";
  ctx.fillText("mean", equilibriumX + 8, railY + 17);
  ctx.restore();

  const anchorX = wallX;
  const blockLeft = massX - massSize / 2;
  const springEnd = blockLeft - 10;
  glowLine(ctx, "#4dd6ff", 2.4, () => {
    const coils = 13;
    const lead = 20;
    const usable = Math.max(40, springEnd - anchorX - lead * 2);
    ctx.moveTo(anchorX, cy);
    ctx.lineTo(anchorX + lead, cy);
    for (let i = 0; i <= coils * 24; i += 1) {
      const t = i / (coils * 24);
      const x = anchorX + lead + t * usable;
      const y = cy + Math.sin(t * Math.PI * coils * 2) * 15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(springEnd, cy);
    ctx.lineTo(blockLeft, cy);
  });

  ctx.save();
  const grad = ctx.createLinearGradient(blockLeft, cy - massSize / 2, blockLeft + massSize, cy + massSize / 2);
  grad.addColorStop(0, "rgba(255,207,112,0.95)");
  grad.addColorStop(1, "rgba(255,121,198,0.88)");
  ctx.fillStyle = grad;
  ctx.shadowColor = "#ffcf70";
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.roundRect(blockLeft, cy - massSize / 2, massSize, massSize, 10);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.stroke();
  ctx.fillStyle = "rgba(2,3,8,0.72)";
  ctx.font = "800 13px Inter,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("m", massX, cy);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.restore();

  if (Math.abs(s.F) > 1) {
    const forceEnd = massX + Math.sign(s.F) * clamp(Math.abs(s.F) * 0.18, 28, 72);
    arrow(ctx, massX, cy - massSize / 2 - 16, forceEnd, cy - massSize / 2 - 16, "#ff79c6");
    ctx.save();
    ctx.fillStyle = "rgba(255,121,198,0.72)";
    ctx.font = "11px Inter,sans-serif";
    ctx.fillText(`F = -kx = ${s.F.toFixed(1)} N`, Math.min(forceEnd, massX) - 12, cy - massSize / 2 - 26);
    ctx.restore();
  }

  const barW = 28;
  const barMaxH = h * 0.28;
  const barX = w - Math.max(118, w * 0.16);
  const barY = h - 62;
  const keH = s.E > 0 ? (s.KE / s.E) * barMaxH : 0;
  const peH = s.E > 0 ? (s.PE / s.E) * barMaxH : 0;
  ctx.save();
  ctx.fillStyle = "rgba(4,4,14,0.48)";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.roundRect(barX - 16, barY - barMaxH - 34, 104, barMaxH + 62, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(102,240,163,0.26)";
  ctx.fillRect(barX, barY - keH, barW, keH);
  ctx.strokeStyle = "#66f0a3";
  ctx.strokeRect(barX, barY - keH, barW, keH);
  ctx.fillStyle = "#66f0a3";
  ctx.font = "800 10px Inter,sans-serif";
  ctx.fillText("KE", barX + 5, barY + 15);
  ctx.fillStyle = "rgba(77,214,255,0.26)";
  ctx.fillRect(barX + barW + 8, barY - peH, barW, peH);
  ctx.strokeStyle = "#4dd6ff";
  ctx.strokeRect(barX + barW + 8, barY - peH, barW, peH);
  ctx.fillStyle = "#4dd6ff";
  ctx.fillText("PE", barX + barW + 13, barY + 15);
  ctx.fillStyle = "rgba(255,207,112,0.70)";
  ctx.font = "11px Inter,sans-serif";
  ctx.fillText(`T=${s.period.toFixed(2)}s`, barX - 2, barY - barMaxH - 12);
  ctx.restore();

  hotspots.push({ x: massX, y: cy, r: 28, object: { ...getObj(concept, "spring-force"), x: massX, y: cy } });
}

export function drawWorkEnergy(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  time: number,
  hotspots: Hotspot[]
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const phase = (time * 0.12 * (values.speed ?? 1)) % 1;
  const s = workEnergyState(values, phase);
  const groundY = h - 60;
  const topY = 60;
  const ballX = w * 0.38;
  const ballY = topY + (groundY - topY) * phase;

  // Ground
  ctx.save();
  ctx.strokeStyle = "rgba(246,240,230,0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, groundY);
  ctx.lineTo(w - 40, groundY);
  ctx.stroke();
  ctx.restore();

  // Height line
  glowLine(ctx, "rgba(77,214,255,0.24)", 1, () => {
    ctx.setLineDash([5, 5]);
    ctx.moveTo(ballX + 18, ballY);
    ctx.lineTo(ballX + 18, groundY);
    ctx.setLineDash([]);
  });

  // Ball
  ctx.save();
  ctx.fillStyle = "#ffcf70";
  ctx.shadowColor = "#ffcf70";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(ballX, ballY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(246,240,230,0.72)";
  ctx.font = "11px Inter,sans-serif";
  ctx.fillText(`v=${s.v.toFixed(1)} m/s`, ballX + 20, ballY + 4);
  ctx.restore();

  // Energy bars
  const barMaxH = (groundY - topY) * 0.75;
  const barW = 32;
  const barX = w * 0.62;
  const barBaseY = groundY - 20;

  const keH = s.totalE > 0 ? (s.KE / s.totalE) * barMaxH : 0;
  const peH = s.totalE > 0 ? (s.PE / s.totalE) * barMaxH : 0;

  ctx.save();
  ctx.fillStyle = "rgba(102,240,163,0.18)";
  ctx.fillRect(barX, barBaseY - keH, barW, keH);
  ctx.strokeStyle = "#66f0a3";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(barX, barBaseY - keH, barW, keH);
  ctx.fillStyle = "#66f0a3";
  ctx.font = "bold 11px Inter,sans-serif";
  ctx.fillText("KE", barX + 6, barBaseY + 14);

  ctx.fillStyle = "rgba(77,214,255,0.18)";
  ctx.fillRect(barX + barW + 14, barBaseY - peH, barW, peH);
  ctx.strokeStyle = "#4dd6ff";
  ctx.strokeRect(barX + barW + 14, barBaseY - peH, barW, peH);
  ctx.fillStyle = "#4dd6ff";
  ctx.fillText("PE", barX + barW + 20, barBaseY + 14);

  ctx.fillStyle = "rgba(255,207,112,0.55)";
  ctx.font = "11px Inter,sans-serif";
  ctx.fillText(`E=${s.totalE.toFixed(0)} J`, barX, barBaseY - barMaxH - 14);
  ctx.restore();

  hotspots.push({ x: barX + barW / 2, y: barBaseY - keH / 2, r: 26, object: { ...getObj(concept, "ke-bar"), x: barX, y: barBaseY - keH } });
  hotspots.push({ x: barX + barW + 28, y: barBaseY - peH / 2, r: 26, object: { ...getObj(concept, "pe-bar"), x: barX + barW + 14, y: barBaseY - peH } });
}

export function drawEnergyProfile(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  time: number,
  hotspots: Hotspot[]
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const pad = 60;
  const Ea = values.Ea ?? 65;
  const dH = values.deltaH ?? -40;
  const hasCatalyst = (values.catalyst ?? 0) > 0.5;
  const phase = (time * 0.1 * (values.speed ?? 1)) % 1;

  const rE = h * 0.62; // reactant energy y
  const pE = rE + dH * 1.1; // product energy y (below = exothermic)
  const peakE = rE - Ea * 1.05;
  const catPeakE = rE - Ea * 0.55;

  const xR = pad + 40;
  const xPeak = w / 2;
  const xP = w - pad - 40;

  // Main curve
  glowLine(ctx, "#ffcf70", 2.4, () => {
    ctx.moveTo(xR, rE);
    ctx.bezierCurveTo(xR + (xPeak - xR) * 0.4, rE, xPeak - 40, peakE + 10, xPeak, peakE);
    ctx.bezierCurveTo(xPeak + 40, peakE + 10, xP - (xP - xPeak) * 0.4, pE, xP, pE);
  });

  // Catalyst curve
  if (hasCatalyst) {
    glowLine(ctx, "#66f0a3", 1.8, () => {
      ctx.moveTo(xR, rE);
      ctx.bezierCurveTo(xR + (xPeak - xR) * 0.4, rE, xPeak - 40, catPeakE + 8, xPeak, catPeakE);
      ctx.bezierCurveTo(xPeak + 40, catPeakE + 8, xP - (xP - xPeak) * 0.4, pE, xP, pE);
    });
  }

  // Reactant / product level lines
  ctx.save();
  ctx.strokeStyle = "rgba(246,240,230,0.22)";
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xR - 20, rE);
  ctx.lineTo(xPeak - 20, rE);
  ctx.moveTo(xPeak + 20, pE);
  ctx.lineTo(xP + 20, pE);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Ea brace
  const bx = xPeak + 18;
  ctx.save();
  ctx.strokeStyle = "rgba(255,207,112,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, rE);
  ctx.lineTo(bx, peakE);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,207,112,0.82)";
  ctx.font = "11px Inter,sans-serif";
  ctx.fillText(`Ea=${Ea}`, bx + 5, (rE + peakE) / 2 + 4);
  ctx.restore();

  // Animated cursor on main path
  const cursorX = xR + phase * (xP - xR);
  const t = clamp((cursorX - xR) / (xP - xR), 0, 1);
  const cursorY = t < 0.5
    ? rE + (3 * (1 - 2 * t) * (1 - 2 * t) * (rE - peakE) * -1)
    : pE + (3 * (2 * t - 1) * (2 * t - 1) * (peakE - pE) * -1);
  dot(ctx, cursorX, clamp(cursorY, peakE - 10, rE + 20), "#ffffff");

  // Labels
  ctx.save();
  ctx.fillStyle = "rgba(246,240,230,0.72)";
  ctx.font = "12px Inter,sans-serif";
  ctx.fillText("Reactants", xR - 28, rE + 20);
  ctx.fillText("Products", xP - 30, pE + 20);
  ctx.fillText("‡ TS", xPeak - 10, peakE - 12);
  if (hasCatalyst) {
    ctx.fillStyle = "#66f0a3";
    ctx.fillText("‡ Cat. TS", xPeak - 10, catPeakE - 12);
  }
  ctx.restore();

  hotspots.push({ x: xPeak, y: peakE, r: 28, object: { ...getObj(concept, "transition-state-peak"), x: xPeak, y: peakE } });
  if (hasCatalyst) hotspots.push({ x: xPeak, y: catPeakE, r: 24, object: { ...getObj(concept, "catalyst-path"), x: xPeak, y: catPeakE } });
}

export function drawRadiationPenetration(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  time: number,
  hotspots: Hotspot[]
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const srcX = 56;
  const endX = w - 40;
  const rows = [
    { y: h * 0.27, color: "#ff9966", id: "alpha-beam", label: "α Alpha", stopAt: 0.22 },
    { y: h * 0.50, color: "#4dd6ff", id: "beta-beam",  label: "β Beta",  stopAt: 0.52 },
    { y: h * 0.73, color: "#b680d9", id: "gamma-beam", label: "γ Gamma", stopAt: 0.92 },
  ];

  // Barriers
  const barriers = [
    { x: srcX + (endX - srcX) * 0.24, w: 12, label: "Paper",  color: "rgba(246,240,230,0.20)" },
    { x: srcX + (endX - srcX) * 0.54, w: 18, label: "Al 3mm", color: "rgba(77,214,255,0.22)" },
    { x: srcX + (endX - srcX) * 0.80, w: 28, label: "Lead",   color: "rgba(182,128,217,0.22)" },
  ];
  barriers.forEach((b) => {
    ctx.save();
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, h * 0.14, b.w, h * 0.72);
    ctx.fillStyle = "rgba(246,240,230,0.55)";
    ctx.font = "11px Inter,sans-serif";
    ctx.fillText(b.label, b.x - 4, h * 0.10);
    ctx.restore();
  });

  // Beams
  const pulse = (time * 0.8) % 1;
  rows.forEach((row) => {
    const stopPx = srcX + (endX - srcX) * row.stopAt;
    glowLine(ctx, row.color, 2.4, () => {
      ctx.moveTo(srcX + 16, row.y);
      ctx.lineTo(stopPx, row.y);
    });
    // Animated pulse dot
    const px = srcX + 16 + pulse * (stopPx - srcX - 16);
    if (px <= stopPx) dot(ctx, px, row.y, "#ffffff");
    // Label
    ctx.save();
    ctx.fillStyle = row.color;
    ctx.font = "bold 12px Inter,sans-serif";
    ctx.fillText(row.label, srcX - 2, row.y - 10);
    ctx.restore();

    hotspots.push({ x: (srcX + stopPx) / 2, y: row.y, r: 20, object: { ...getObj(concept, row.id), x: srcX, y: row.y } });
  });

  // Source
  ctx.save();
  ctx.fillStyle = "#ffcf70";
  ctx.shadowColor = "#ffcf70";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(srcX, h / 2, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#020308";
  ctx.font = "bold 11px Inter,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("☢", srcX, h / 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}
