"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Atom,
  Beaker,
  Brain,
  FlaskConical,
  LineChart,
  Pause,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import {
  getConceptById,
  getConceptsBySubject,
  getDefaultVariables,
  SUBJECT_LABELS,
} from "@/lib/visual-lab/concepts";
import { compileExpression } from "@/lib/visual-lab/math-expression";
import {
  arrheniusRelativeProbability,
  clamp,
  doublePendulumState,
  equilibriumProgress,
  halfLifeRemaining,
  nuclearDaughter,
  pendulumState,
  projectileState,
  shmState,
  titrationPh,
} from "@/lib/visual-lab/simulations";
import {
  drawCircularMotion,
  drawSpringMass,
  drawWorkEnergy,
  drawEnergyProfile,
  drawRadiationPenetration,
} from "./visual-lab-renderers";
import {
  interpolateView,
  getCurrentChapter,
  makeProjector,
  graphRect,
  drawGrid,
  drawFrameBox,
  drawCurveProgressive,
  drawTrackingDot,
  drawPulseRing,
  drawIntersectionDot,
  drawEquationLabels,
  fmtCoord,
} from "./visual-lab-cinematic";
import { VisualScene } from "./visual-lab-scene";
import type {
  SelectedVisualObject,
  TutorRequestPayload,
  VariableValues,
  VisualCinematicBeat,
  VisualConcept,
  VisualObject,
  VisualPreset,
  VisualSceneMode,
  VisualSubject,
} from "@/lib/visual-lab/types";

type Hotspot = {
  x: number;
  y: number;
  r: number;
  object: SelectedVisualObject;
};

type LabSnapshot = {
  id: string;
  label: string;
  conceptId: string;
  subject: VisualSubject;
  values: VariableValues;
  equations: string[];
  surfaceExpression: string;
  sceneMode: VisualSceneMode;
  createdAt: number;
};

type MissionStep = {
  id: string;
  label: string;
  detail: string;
  action: "observe" | "predict" | "experiment" | "exam" | "notebook";
};

type PracticeQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

type NotebookEntry = {
  id: string;
  conceptId: string;
  subject: VisualSubject;
  title: string;
  note: string;
  selectedLabel: string;
  sceneMode: VisualSceneMode;
  values: VariableValues;
  createdAt: number;
  pinned: boolean;
};

type ConceptProgress = {
  conceptId: string;
  subject: VisualSubject;
  viewedAt: number;
  practiceAttempts: number;
  practiceCorrect: number;
  missionsCompleted: number;
  snapshotsSaved: number;
  notes: number;
  mastery: number;
};

type LabProgress = Record<string, ConceptProgress>;

const SUBJECTS: Array<{ id: VisualSubject; icon: typeof LineChart; accent: string }> = [
  { id: "maths", icon: LineChart, accent: "#4dd6ff" },
  { id: "physics", icon: Zap, accent: "#5b9cf5" },
  { id: "chemistry", icon: Beaker, accent: "#b680d9" },
  { id: "nuclear", icon: Atom, accent: "#ffcf70" },
];

function getObject(concept: VisualConcept, id: string, fallback?: Partial<VisualObject>): SelectedVisualObject {
  const found = concept.visualObjects.find((item) => item.id === id) ?? concept.visualObjects[0];
  return {
    ...found,
    ...fallback,
    id: found?.id ?? id,
    label: fallback?.label ?? found?.label ?? "Visual object",
    kind: fallback?.kind ?? found?.kind ?? "object",
    description: fallback?.description ?? found?.description ?? "Verified visual object.",
    formulaConnection: fallback?.formulaConnection ?? found?.formulaConnection ?? "Defined by the current concept data.",
    neetTakeaway: fallback?.neetTakeaway ?? found?.neetTakeaway ?? "Use the visual to connect formula and behavior.",
    commonMistake: fallback?.commonMistake ?? found?.commonMistake ?? "Do not infer unsupported details.",
  };
}

function drawGlowLine(ctx: CanvasRenderingContext2D, color: string, width: number, path: () => void) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width + 7;
  ctx.globalAlpha = 0.12;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
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

function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label?: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (label) {
    ctx.fillStyle = "rgba(246,240,230,0.82)";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(label, x + 8, y - 8);
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
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
  ctx.lineTo(x2 - 8 * Math.cos(angle - Math.PI / 6), y2 - 8 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - 8 * Math.cos(angle + Math.PI / 6), y2 - 8 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundedPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill = "rgba(4,4,14,0.62)",
  stroke = "rgba(255,255,255,0.11)"
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function getLoopProgress(time: number, values: VariableValues, rate = 0.08) {
  return (time * rate * (values.speed ?? 1)) % 1;
}

function getCinematicBeats(concept: VisualConcept): VisualCinematicBeat[] {
  return concept.cinematic?.beats ?? concept.steps;
}

function currentStepIndex(beats: VisualCinematicBeat[], progress: number) {
  if (!beats.length) return 0;
  let index = 0;
  beats.forEach((step, stepIndex) => {
    if (progress >= step.t) index = stepIndex;
  });
  return index;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length) {
    const last = lines[lines.length - 1];
    if (ctx.measureText(`${last}...`).width > maxWidth) lines[lines.length - 1] = `${last.slice(0, Math.max(8, last.length - 4))}...`;
  }
  return lines;
}

function getCinematicMetrics(concept: VisualConcept, values: VariableValues, progress: number, time: number) {
  if (concept.id === "math-exp-vs-quad") {
    const xMin = values.xMin ?? -2;
    const xMax = values.xMax ?? 100;
    const x = xMin + progress * (xMax - xMin);
    const r = values.r ?? 1.1;
    return [
      { label: "x", value: x.toFixed(2) },
      { label: "x^2", value: (x * x).toFixed(x > 20 ? 1 : 3) },
      { label: `${r.toFixed(2)}^x`, value: Math.pow(r, x).toFixed(x > 20 ? 1 : 3) },
    ];
  }
  if (concept.id === "physics-ray-optics") {
    const names = ["Convex lens", "Concave lens", "Concave mirror", "Convex mirror"];
    return [
      { label: "Element", value: names[Math.round(values.lensMode ?? 0)] ?? names[0] },
      { label: "Object", value: `${(values.u ?? 32).toFixed(0)} cm` },
      { label: "Focus", value: `${(values.f ?? 18).toFixed(0)} cm` },
    ];
  }
  if (concept.id === "physics-wave-optics") {
    const lambda = values.wavelength ?? 46;
    const d = Math.max(values.slitSeparation ?? 96, 1);
    const D = values.screenDistance ?? 420;
    return [
      { label: "lambda", value: lambda.toFixed(0) },
      { label: "d", value: d.toFixed(0) },
      { label: "beta", value: ((lambda * D) / d).toFixed(1) },
    ];
  }
  if (concept.id === "physics-spring-mass") {
    const k = Math.max(values.k ?? 8, 0.1);
    const mass = Math.max(values.mass ?? 2, 0.1);
    const omega = Math.sqrt(k / mass);
    return [
      { label: "omega", value: `${omega.toFixed(2)} rad/s` },
      { label: "T", value: `${((2 * Math.PI) / omega).toFixed(2)} s` },
      { label: "E", value: `${(0.5 * k * Math.pow(values.amplitude ?? 90, 2)).toFixed(0)}` },
    ];
  }
  if (concept.id === "physics-double-pendulum") {
    const s = doublePendulumState(values, time);
    return [
      { label: "theta1", value: `${((s.theta1 * 180) / Math.PI).toFixed(1)} deg` },
      { label: "theta2", value: `${((s.theta2 * 180) / Math.PI).toFixed(1)} deg` },
      { label: "Coupling", value: Math.abs(s.theta1 - s.theta2) > 1 ? "chaotic" : "mild" },
    ];
  }
  return concept.variables.slice(0, 3).map((item) => ({
    label: item.label,
    value: `${(values[item.key] ?? item.defaultValue).toFixed(item.step < 1 ? 2 : 0)}${item.unit ? ` ${item.unit}` : ""}`,
  }));
}

function drawSceneOverlay(ctx: CanvasRenderingContext2D, concept: VisualConcept, progress: number, values: VariableValues, time: number) {
  const beats = getCinematicBeats(concept);
  if (!beats.length) return;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const index = currentStepIndex(beats, progress);
  const step = beats[index];
  const accent = step.accent ?? concept.cinematic?.accent ?? "#41f4ff";
  const left = Math.min(72, Math.max(18, width * 0.045));
  const top = Math.min(72, Math.max(18, height * 0.055));
  const compact = width < 760;
  const panelW = compact ? Math.min(width - left * 2, 330) : Math.min(390, Math.max(280, width * 0.34));
  const panelH = compact ? 88 : 114;

  roundedPanel(ctx, left, top, panelW, panelH, 18);
  ctx.save();
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.font = "800 10px Inter,sans-serif";
  ctx.fillText(`CINEMATIC V2  ${index + 1}/${beats.length}`, left + 14, top + 19);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = compact ? "800 14px Inter,sans-serif" : "800 18px Inter,sans-serif";
  ctx.fillText(step.label, left + 14, top + 43);
  ctx.fillStyle = "rgba(246,240,230,0.55)";
  ctx.font = "12px Inter,sans-serif";
  wrapText(ctx, step.detail, panelW - 28, compact ? 2 : 3).forEach((line, lineIndex) => {
    ctx.fillText(line, left + 14, top + 63 + lineIndex * 15);
  });
  if (!compact && step.examCue) {
    ctx.fillStyle = "rgba(185,255,106,0.72)";
    ctx.font = "800 10px Inter,sans-serif";
    ctx.fillText(`NEET cue: ${step.examCue}`, left + 14, top + panelH - 13);
  }
  ctx.restore();

  if (!compact) {
    const metrics = getCinematicMetrics(concept, values, progress, time);
    const rightW = Math.min(360, Math.max(280, width * 0.28));
    const rightX = width - left - rightW;
    roundedPanel(ctx, rightX, top, rightW, panelH, 18);
    ctx.save();
    ctx.fillStyle = "rgba(255,207,112,0.82)";
    ctx.font = "800 10px Inter,sans-serif";
    ctx.fillText("LIVE FORMULA", rightX + 14, top + 19);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "800 13px Inter,sans-serif";
    ctx.fillText(step.formula ?? concept.cinematic?.formula ?? concept.formulas[0] ?? "Verified model", rightX + 14, top + 43);
    const metricY = top + 71;
    metrics.forEach((metric, metricIndex) => {
      const x = rightX + 14 + metricIndex * ((rightW - 28) / Math.max(metrics.length, 1));
      ctx.fillStyle = "rgba(246,240,230,0.46)";
      ctx.font = "10px Inter,sans-serif";
      ctx.fillText(metric.label, x, metricY);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = "800 12px Inter,sans-serif";
      ctx.fillText(metric.value, x, metricY + 20);
    });
    ctx.restore();
  }

  const trackW = Math.min(520, width - left * 2);
  const trackX = (width - trackW) / 2;
  const trackY = height - Math.max(78, height * 0.085);
  roundedPanel(ctx, trackX, trackY, trackW, 30, 15, "rgba(4,4,14,0.5)", "rgba(255,255,255,0.09)");
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.roundRect(trackX + 12, trackY + 12, trackW - 24, 6, 999);
  ctx.fill();
  const fill = ctx.createLinearGradient(trackX + 12, 0, trackX + trackW - 12, 0);
  fill.addColorStop(0, "#41f4ff");
  fill.addColorStop(0.55, "#ff4fd8");
  fill.addColorStop(1, "#b9ff6a");
  ctx.fillStyle = fill;
  ctx.shadowColor = "#41f4ff";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.roundRect(trackX + 12, trackY + 12, (trackW - 24) * clamp(progress, 0, 1), 6, 999);
  ctx.fill();
  ctx.shadowBlur = 0;
  beats.forEach((item, stepIndex) => {
    const x = trackX + 12 + (trackW - 24) * clamp(item.t, 0, 1);
    ctx.fillStyle = stepIndex <= index ? "#ffffff" : "rgba(255,255,255,0.32)";
    ctx.beginPath();
    ctx.arc(x, trackY + 15, stepIndex === index ? 4.2 : 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawMeasurementBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  align: "left" | "right" = "left"
) {
  ctx.save();
  ctx.font = "700 11px Inter,sans-serif";
  const tw = ctx.measureText(label).width;
  const bx = align === "right" ? x - tw - 25 : x;
  roundedPanel(ctx, bx, y - 15, tw + 18, 24, 10, "rgba(4,4,14,0.62)", "rgba(255,255,255,0.13)");
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.fillText(label, bx + 9, y + 1);
  ctx.restore();
}

function drawLabGrid(ctx: CanvasRenderingContext2D, width: number, height: number, time = 0) {
  ctx.fillStyle = "#020308";
  ctx.fillRect(0, 0, width, height);

  const grid = 34;
  ctx.save();
  ctx.strokeStyle = "rgba(77,214,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const radial = ctx.createRadialGradient(width * 0.5, height * 0.28, 20, width * 0.5, height * 0.3, Math.max(width, height) * 0.7);
  radial.addColorStop(0, "rgba(77,214,255,0.11)");
  radial.addColorStop(0.42, "rgba(182,128,217,0.05)");
  radial.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  const sweep = ((time * 42) % (height + 180)) - 90;
  const scan = ctx.createLinearGradient(0, sweep - 70, 0, sweep + 70);
  scan.addColorStop(0, "rgba(77,214,255,0)");
  scan.addColorStop(0.5, "rgba(77,214,255,0.055)");
  scan.addColorStop(1, "rgba(77,214,255,0)");
  ctx.fillStyle = scan;
  ctx.fillRect(0, Math.max(0, sweep - 90), width, 180);

  ctx.fillStyle = "rgba(255,255,255,0.34)";
  for (let i = 0; i < 42; i += 1) {
    const seed = i * 97.13;
    const x = (Math.sin(seed) * 0.5 + 0.5) * width;
    const y = (((Math.cos(seed * 1.7) * 0.5 + 0.5) * height) + time * (8 + (i % 5) * 2)) % height;
    const r = 0.7 + (i % 3) * 0.35;
    ctx.globalAlpha = 0.12 + 0.18 * Math.sin(time * 1.7 + i);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  xToPx: (x: number) => number,
  yToPx: (y: number) => number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
) {
  ctx.save();
  ctx.strokeStyle = "rgba(246,240,230,0.20)";
  ctx.lineWidth = 1.2;
  if (xMin <= 0 && xMax >= 0) {
    const x0 = xToPx(0);
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, height);
    ctx.stroke();
  }
  if (yMin <= 0 && yMax >= 0) {
    const y0 = yToPx(0);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(width, y0);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(246,240,230,0.48)";
  ctx.font = "11px Inter, sans-serif";
  ctx.fillText("x", width - 18, yToPx(0) - 8);
  ctx.fillText("y", xToPx(0) + 8, 16);
  ctx.restore();
}

function drawMath2D(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  equations: string[],
  time: number,
  hotspots: Hotspot[]
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  const compiled = equations.map((eq) => {
    try { return compileExpression(eq); } catch { return null; }
  });

  // Build chapters from concept steps
  const xMin = Math.min(values.xMin ?? -10, (values.xMax ?? 10) - 1);
  const xMax = Math.max(values.xMax ?? 10, xMin + 1);
  const drawSpd = values.speed ?? 1;

  // Pre-sample y range for initial view
  let yLoGlobal = Infinity, yHiGlobal = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const x = xMin + (i / 200) * (xMax - xMin);
    compiled.forEach(expr => {
      if (!expr) return;
      const y = expr.evaluate({ ...values, x });
      if (Number.isFinite(y) && Math.abs(y) < 1e5) {
        if (y < yLoGlobal) yLoGlobal = y;
        if (y > yHiGlobal) yHiGlobal = y;
      }
    });
  }
  if (!Number.isFinite(yLoGlobal)) { yLoGlobal = -8; yHiGlobal = 8; }
  const yPad = Math.max(1.2, (yHiGlobal - yLoGlobal) * 0.2);

  // Find intersections (bisection)
  const intersections: Array<{ x: number; y: number; label: string }> = [];
  if (compiled.length >= 2 && compiled[0] && compiled[1]) {
    const steps = 240;
    let px = xMin;
    let pd = compiled[0].evaluate({ ...values, x: px }) - compiled[1].evaluate({ ...values, x: px });
    for (let i = 1; i <= steps; i++) {
      const cx = xMin + (i / steps) * (xMax - xMin);
      const cd = compiled[0].evaluate({ ...values, x: cx }) - compiled[1].evaluate({ ...values, x: cx });
      if (Number.isFinite(cd) && Number.isFinite(pd) && cd * pd <= 0) {
        let lo = px, hi = cx;
        for (let j = 0; j < 20; j++) {
          const mid = (lo + hi) / 2;
          const md = compiled[0].evaluate({ ...values, x: mid }) - compiled[1].evaluate({ ...values, x: mid });
          if (md * pd <= 0) hi = mid; else lo = mid;
        }
        const ix = (lo + hi) / 2;
        const iy = compiled[0].evaluate({ ...values, x: ix });
        if (Number.isFinite(iy) && Math.abs(iy) < 1e5) {
          intersections.push({ x: ix, y: iy, label: `(${ix.toFixed(2)}, ${iy.toFixed(2)})` });
        }
      }
      px = cx; pd = cd;
    }
  }
  // Also find roots of first curve
  if (compiled[0] && intersections.length === 0) {
    let px2 = xMin;
    let py2 = compiled[0].evaluate({ ...values, x: px2 });
    for (let i = 1; i <= 240; i++) {
      const cx = xMin + (i / 240) * (xMax - xMin);
      const cy = compiled[0].evaluate({ ...values, x: cx });
      if (Number.isFinite(cy) && Number.isFinite(py2) && cy * py2 < 0) {
        let lo = px2, hi = cx;
        for (let j = 0; j < 16; j++) {
          const mid = (lo + hi) / 2;
          const mv = compiled[0].evaluate({ ...values, x: mid });
          if (mv * py2 <= 0) hi = mid; else lo = mid;
        }
        const rx = (lo + hi) / 2;
        intersections.push({ x: rx, y: 0, label: `x ~= ${rx.toFixed(2)}` });
      }
      px2 = cx; py2 = cy;
    }
  }

  // Chapter system: overview, each important crossing/root, then the full curve.
  const marks = intersections.slice(0, 4);
  const span = xMax - xMin;
  const fullView = { xMin, xMax, yMin: yLoGlobal - yPad, yMax: yHiGlobal + yPad };
  const chapterCount = marks.length + 2;
  const defaultChapters: import("./visual-lab-cinematic").CinematicChapter[] = [
    { name: "Overview", start: 0, end: 1 / chapterCount, view: fullView },
    ...marks.map((pt, i): import("./visual-lab-cinematic").CinematicChapter => {
      const localX = Math.max(span * 0.06, Math.min(span * 0.18, Math.abs(pt.x) * 0.22 + 1.2));
      const localY = Math.max(1.2, Math.abs(pt.y) * 0.45);
      return {
        name: intersections.length > 1 ? `Meeting ${i + 1}` : `Root ${i + 1}`,
        start: (i + 1) / chapterCount,
        end: (i + 2) / chapterCount,
        view: {
          xMin: pt.x - localX,
          xMax: pt.x + localX,
          yMin: pt.y - localY - 0.5,
          yMax: pt.y + localY + 0.5,
        },
      };
    }),
    { name: "Full curve", start: (chapterCount - 1) / chapterCount, end: 1, view: fullView },
  ];
  const chapters = defaultChapters.length >= 2 ? defaultChapters : [defaultChapters[0]];

  // Progress and drawX
  const progress = clamp((time * 0.032 * drawSpd) % 1.04, 0, 1);
  let drawX = xMin + easeOutCinematic(progress) * (xMax - xMin);
  const activeMark = marks.find((_, i) => progress >= (i + 1) / chapterCount && progress <= (i + 2) / chapterCount);
  if (activeMark) drawX = Math.max(drawX, activeMark.x);
  if (progress >= (chapterCount - 1) / chapterCount) drawX = xMax;

  function easeOutCinematic(p: number) {
    if (p < 0.5) return 2 * p * p;
    return 1 - Math.pow(-2 * p + 2, 2) / 2;
  }

  // Viewport
  const view = interpolateView(chapters, progress);
  const rect = graphRect(W, H);
  const P = makeProjector(view, rect);

  // Draw
  drawFrameBox(ctx, rect);
  drawGrid(ctx, view, rect, P);

  const colors = ["#41f4ff", "#ff4fd8", "#b9ff6a", "#ffcf70"];
  compiled.forEach((expr, idx) => {
    if (!expr) return;
    const fn = (x: number) => expr.evaluate({ ...values, x });
    drawCurveProgressive(ctx, P, rect, fn, xMin, drawX, drawX, colors[idx % colors.length], 2.8);
  });

  // Equation labels
  const eqLabels = equations.map((eq, i) => ({ text: `y = ${eq}`, color: colors[i % colors.length] }));
  if (eqLabels.length) drawEquationLabels(ctx, rect, eqLabels);

  // Intersection dots + pulse
  intersections.forEach((pt) => {
    if (pt.x > drawX) return;
    const sx = P.x(pt.x), sy = P.y(pt.y);
    if (sx < rect.left || sx > rect.right || sy < rect.top || sy > rect.bottom) return;
    // Check if tracking dot just crossed
    const crossAge = Math.abs(drawX - pt.x) < (xMax - xMin) * 0.022 ? (Math.abs(drawX - pt.x) / ((xMax - xMin) * 0.022)) * 950 : 951;
    if (crossAge <= 950) drawPulseRing(ctx, sx, sy, crossAge);
    drawIntersectionDot(ctx, sx, sy, pt.label, W);
    hotspots.push({ x: sx, y: sy, r: 22, object: { id: "intersection", label: "Intersection", kind: "intersection", description: pt.label, formulaConnection: "", neetTakeaway: "", commonMistake: "", x: sx, y: sy } });
  });

  // Vertex for quadratic
  if (concept.id.includes("quadratic") && compiled[0]) {
    const a = values.a ?? 1, b2 = values.b ?? 0;
    if (Math.abs(a) > 1e-6) {
      const vx = -b2 / (2 * a);
      const vy = compiled[0].evaluate({ ...values, x: vx });
      const sx = P.x(vx), sy = P.y(vy);
      if (sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom && vx <= drawX) {
        drawTrackingDot(ctx, sx, sy, "#ff79c6", `vertex (${vx.toFixed(2)}, ${vy.toFixed(2)})`, -28, W, H);
      }
    }
  }

  // Moving tracking dot
  if (compiled[0] && drawX >= xMin && drawX <= xMax) {
    const ty = compiled[0].evaluate({ ...values, x: drawX });
    if (Number.isFinite(ty)) {
      const sx = P.x(drawX), sy = P.y(ty);
      if (sx >= rect.left - 4 && sx <= rect.right + 4 && sy >= rect.top - 4 && sy <= rect.bottom + 4) {
        drawTrackingDot(ctx, sx, sy, colors[0], `(${fmtCoord(drawX)}, ${fmtCoord(ty)})`, -28, W, H);
      }
    }
  }
  if (compiled[1] && drawX >= xMin && drawX <= xMax) {
    const ty = compiled[1].evaluate({ ...values, x: drawX });
    if (Number.isFinite(ty)) {
      const sx = P.x(drawX), sy = P.y(ty);
      if (sx >= rect.left - 4 && sx <= rect.right + 4 && sy >= rect.top - 4 && sy <= rect.bottom + 4) {
        drawTrackingDot(ctx, sx, sy, colors[1], `(${fmtCoord(drawX)}, ${fmtCoord(ty)})`, 28, W, H);
      }
    }
  }

  // Chapter label (top-left of canvas)
  const chapter = getCurrentChapter(chapters, progress);
  ctx.save();
  ctx.font = "600 11px Inter,sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.fillText(chapter.name, rect.left + 8, rect.top + 16);
  ctx.restore();
}

function drawMath3D(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  surfaceExpression: string,
  time: number,
  hotspots: Hotspot[],
  userAngle: { x: number; y: number }
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const range = values.range ?? 4;
  const heightScale = values.height ?? 1;
  const auto = values.rotate ?? 1;
  let expr;
  try {
    expr = compileExpression(surfaceExpression);
  } catch {
    return;
  }

  const angleY = userAngle.y + (auto ? time * 0.18 : 0);
  const angleX = userAngle.x + 0.75;
  const scale = Math.min(width, height) * 0.075;
  const project = (x: number, y: number, z: number) => {
    const cy = Math.cos(angleY);
    const sy = Math.sin(angleY);
    const cx = Math.cos(angleX);
    const sx = Math.sin(angleX);
    const rx = x * cy - y * sy;
    const ry = x * sy + y * cy;
    const rz = z;
    const py = ry * cx - rz * sx;
    const pz = ry * sx + rz * cx;
    const perspective = 1 / (1 + pz * 0.035);
    return {
      x: width / 2 + rx * scale * perspective,
      y: height / 2 + py * scale * perspective,
    };
  };

  const grid = 31;
  const points: Array<Array<{ x: number; y: number }>> = [];
  for (let i = 0; i < grid; i += 1) {
    const row: Array<{ x: number; y: number }> = [];
    for (let j = 0; j < grid; j += 1) {
      const x = -range + (i / (grid - 1)) * range * 2;
      const y = -range + (j / (grid - 1)) * range * 2;
      const z = clamp(expr.evaluate({ ...values, x, y }) * heightScale, -8, 8);
      row.push(project(x, y, z));
    }
    points.push(row);
  }

  ctx.save();
  ctx.strokeStyle = "rgba(77,214,255,0.34)";
  ctx.lineWidth = 1;
  ctx.shadowColor = "#4dd6ff";
  ctx.shadowBlur = 7;
  for (let i = 0; i < grid; i += 2) {
    ctx.beginPath();
    for (let j = 0; j < grid; j += 1) {
      const p = points[i][j];
      if (j === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,207,112,0.28)";
  for (let j = 0; j < grid; j += 2) {
    ctx.beginPath();
    for (let i = 0; i < grid; i += 1) {
      const p = points[i][j];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();

  const object = getObject(concept, "surface");
  hotspots.push({ x: width / 2, y: height / 2, r: Math.min(width, height) * 0.3, object: { ...object, x: width / 2, y: height / 2 } });
}

function drawProjectile(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const spd = values.speed ?? 1;
  const progress = clamp((time * 0.028 * spd) % 1.04, 0, 1);
  const phase = progress;

  const state = projectileState(values, phase);
  const full  = projectileState(values, 1);
  const pad = 52;

  // Chapters
  const chapterName = progress < 0.3 ? "Launch - initial velocity" : progress < 0.65 ? "Ascending to peak" : "Full trajectory";

  // Coordinate mapping - zoom into launch during early phase
  const zoom = progress < 0.35 ? clamp(progress / 0.35, 0, 1) : 1;
  const viewMaxX = Math.max(full.range, 1) * (0.35 + 0.65 * zoom);
  const viewMaxY = Math.max(full.maxHeight * 1.3, 1);
  const toSx = (x: number) => pad + (x / viewMaxX) * (W - pad * 2);
  const toSy = (y: number) => H - pad - (y / viewMaxY) * (H - pad * 2);

  // Ground line
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, H - pad);
  ctx.stroke(); ctx.setLineDash([]);

  // Grid lines (light)
  ctx.strokeStyle = "rgba(120,235,255,0.08)"; ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const sy = H - pad - (i / 4) * (H - pad * 2);
    ctx.beginPath(); ctx.moveTo(pad, sy); ctx.lineTo(W - pad, sy); ctx.stroke();
  }
  ctx.restore();

  // Progressive parabola trail up to current phase
  drawGlowLine(ctx, "#41f4ff", 2.6, () => {
    let first = true;
    const steps = 140;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * phase;
      const s = projectileState(values, t);
      if (s.x < 0) continue;
      const sx = toSx(s.x), sy = toSy(s.y);
      if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
    }
  });

  // Peak dot
  if (progress > 0.35) {
    const peak = projectileState(values, 0.5);
    const psx = toSx(peak.x), psy = toSy(peak.y);
    drawPoint(ctx, psx, psy, "#66f0a3", "peak");
  }

  // Moving ball
  const bx = toSx(state.x), by = toSy(state.y);
  ctx.save();
  ctx.fillStyle = "#ffcf70"; ctx.shadowColor = "#ffcf70"; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.restore();

  // Velocity arrows
  const arrowScale = 0.7;
  drawArrow(ctx, bx, by, bx + state.ux * arrowScale, by - state.uy * arrowScale, "#66f0a3");
  drawArrow(ctx, bx, by, bx, by + Math.min(60, state.uy * 0.6), "#ff79c6");

  // Live coordinate badge
  drawTrackingDot(ctx, bx, by, "#ffcf70", `h=${state.y.toFixed(1)}m  R=${state.x.toFixed(1)}m`, -30, W, H);

  // Range marker at landing
  if (phase > 0.92) {
    const lx = toSx(full.range);
    drawPoint(ctx, lx, H - pad, "#ffffff", `R=${full.range.toFixed(1)}m`);
  }

  // Chapter label
  ctx.save();
  ctx.font = "600 11px Inter,sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.fillText(chapterName, pad + 10, 22);
  ctx.restore();

  hotspots.push({ x: bx, y: by, r: 28, object: { ...getObject(concept, "projectile"), x: bx, y: by } });
  hotspots.push({ x: toSx(full.range / 2), y: toSy(full.maxHeight), r: 28, object: { ...getObject(concept, "peak"), x: toSx(full.range / 2), y: toSy(full.maxHeight) } });
}


function drawShm(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const state = shmState(values, time);
  const massX = centerX + state.x;

  ctx.strokeStyle = "rgba(246,240,230,0.18)";
  ctx.beginPath();
  ctx.moveTo(50, centerY);
  ctx.lineTo(width - 50, centerY);
  ctx.stroke();
  drawPoint(ctx, centerX, centerY, "#66f0a3", "mean");
  drawGlowLine(ctx, "#4dd6ff", 2, () => {
    ctx.moveTo(70, centerY);
    for (let i = 0; i <= 50; i += 1) {
      const x = 70 + (massX - 70) * (i / 50);
      const y = centerY + Math.sin(i * 1.4) * 14;
      ctx.lineTo(x, y);
    }
  });
  ctx.fillStyle = "#ffcf70";
  ctx.shadowColor = "#ffcf70";
  ctx.shadowBlur = 18;
  ctx.fillRect(massX - 22, centerY - 22, 44, 44);
  ctx.shadowBlur = 0;
  drawArrow(ctx, massX, centerY + 44, massX - Math.sign(state.x || 1) * 60, centerY + 44, "#ff79c6");
  hotspots.push({ x: centerX, y: centerY, r: 24, object: { ...getObject(concept, "mean"), x: centerX, y: centerY } });
}

function drawPendulum(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const pivot = { x: width / 2, y: 72 };
  const state = pendulumState(values, time);
  const lengthPx = clamp(state.length * 150, 120, height - 120);
  const bob = {
    x: pivot.x + Math.sin(state.theta) * lengthPx,
    y: pivot.y + Math.cos(state.theta) * lengthPx,
  };

  ctx.strokeStyle = "rgba(246,240,230,0.62)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(bob.x, bob.y);
  ctx.stroke();
  drawPoint(ctx, pivot.x, pivot.y, "#ffffff");
  drawPoint(ctx, bob.x, bob.y, "#ffcf70", "bob");
  ctx.strokeStyle = "rgba(77,214,255,0.25)";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, lengthPx, Math.PI / 2 - 0.55, Math.PI / 2 + 0.55);
  ctx.stroke();
  hotspots.push({ x: bob.x, y: bob.y, r: 28, object: { ...getObject(concept, "bob"), x: bob.x, y: bob.y } });
}

function drawDoublePendulum(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const pivot = { x: width / 2, y: Math.max(72, height * 0.16) };
  const state = doublePendulumState(values, time);
  const scale = clamp(Math.min(width, height) * 0.18, 80, 150);
  const length1 = state.length1 * scale;
  const length2 = state.length2 * scale;
  const joint = {
    x: pivot.x + Math.sin(state.theta1) * length1,
    y: pivot.y + Math.cos(state.theta1) * length1,
  };
  const bob = {
    x: joint.x + Math.sin(state.theta2) * length2,
    y: joint.y + Math.cos(state.theta2) * length2,
  };
  const ghostState = doublePendulumState({ ...values, theta1: (values.theta1 ?? 110) + 1 }, time);
  const ghostJoint = {
    x: pivot.x + Math.sin(ghostState.theta1) * length1,
    y: pivot.y + Math.cos(ghostState.theta1) * length1,
  };
  const ghostBob = {
    x: ghostJoint.x + Math.sin(ghostState.theta2) * length2,
    y: ghostJoint.y + Math.cos(ghostState.theta2) * length2,
  };

  const trailSamples = 64;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = trailSamples; i >= 1; i -= 1) {
    const ghost = doublePendulumState(values, Math.max(0, time - i * 0.045));
    const gJoint = {
      x: pivot.x + Math.sin(ghost.theta1) * length1,
      y: pivot.y + Math.cos(ghost.theta1) * length1,
    };
    const gBob = {
      x: gJoint.x + Math.sin(ghost.theta2) * length2,
      y: gJoint.y + Math.cos(ghost.theta2) * length2,
    };
    ctx.strokeStyle = `rgba(255,79,216,${0.015 + (1 - i / trailSamples) * 0.12})`;
    ctx.lineWidth = 2 + (1 - i / trailSamples) * 2;
    ctx.beginPath();
    ctx.moveTo(gBob.x, gBob.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#b9ff6a";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(ghostJoint.x, ghostJoint.y);
  ctx.lineTo(ghostBob.x, ghostBob.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#b9ff6a";
  ctx.beginPath();
  ctx.arc(ghostBob.x, ghostBob.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(246,240,230,0.18)";
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, length1, Math.PI / 2 - 1.2, Math.PI / 2 + 1.2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  drawGlowLine(ctx, "#41f4ff", 2.4, () => {
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(joint.x, joint.y);
  });
  drawGlowLine(ctx, "#ff4fd8", 2.4, () => {
    ctx.moveTo(joint.x, joint.y);
    ctx.lineTo(bob.x, bob.y);
  });

  drawPoint(ctx, pivot.x, pivot.y, "#ffffff", "pivot");
  drawPoint(ctx, joint.x, joint.y, "#41f4ff", "m1");
  drawPoint(ctx, bob.x, bob.y, "#ffcf70", "m2");

  const energyText = `theta1 ${((state.theta1 * 180) / Math.PI).toFixed(1)} deg  theta2 ${((state.theta2 * 180) / Math.PI).toFixed(1)} deg`;
  drawMeasurementBadge(ctx, 24, height - 112, energyText, "#b9ff6a");
  drawMeasurementBadge(ctx, width - 24, height - 112, `+1 deg ghost shows sensitivity`, "#41f4ff", "right");

  hotspots.push({ x: joint.x, y: joint.y, r: 30, object: { ...getObject(concept, "upper-bob"), x: joint.x, y: joint.y } });
  hotspots.push({ x: bob.x, y: bob.y, r: 34, object: { ...getObject(concept, "lower-bob"), x: bob.x, y: bob.y } });
  hotspots.push({ x: bob.x, y: bob.y, r: 70, object: { ...getObject(concept, "chaotic-trail"), x: bob.x, y: bob.y } });
}

function drawRayOptics(
  ctx: CanvasRenderingContext2D,
  concept: VisualConcept,
  values: VariableValues,
  hotspots: Hotspot[],
  sceneMode: VisualSceneMode,
  time: number
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const scene = new VisualScene(ctx);
  const cy = sceneMode === "compare" ? height * 0.42 : height / 2;
  const opticX = width * 0.5;
  const scale = clamp(width / 170, 3.6, 6.4);
  const u = values.u ?? 32;
  const fAbs = values.f ?? 18;
  const mode = Math.round(values.lensMode ?? 0);
  const drawBench = (benchY: number, opticMode = mode, alpha = 1) => {
    const info = [
      { name: "Convex lens", kind: "lens", f: fAbs, realSide: 1 },
      { name: "Concave lens", kind: "lens", f: -fAbs, realSide: 1 },
      { name: "Concave mirror", kind: "mirror", f: fAbs, realSide: -1 },
      { name: "Convex mirror", kind: "mirror", f: -fAbs, realSide: -1 },
    ][clamp(opticMode, 0, 3)] as { name: string; kind: "lens" | "mirror"; f: number; realSide: 1 | -1 };
    const denominator = 1 / info.f - 1 / u;
    const vRaw = Math.abs(denominator) < 1e-4 ? Number.POSITIVE_INFINITY : 1 / denominator;
    const v = clamp(Number.isFinite(vRaw) ? vRaw : 90, -90, 90);
    const objectX = opticX - u * scale;
    const objectH = clamp(height * 0.15, 48, 86);
    const magnification = -v / u;
    const imageH = clamp(Math.abs(magnification) * objectH, 18, 132) * (magnification < 0 ? -1 : 1);
    const imageX = info.kind === "lens" ? opticX + v * scale : opticX - v * scale;
    const focusLeft = opticX - fAbs * scale;
    const focusRight = opticX + fAbs * scale;
    const objectTip = { x: objectX, y: benchY - objectH };
    const imageTip = { x: imageX, y: benchY + imageH };

    ctx.save();
    ctx.globalAlpha = alpha;
    scene.ray({ from: { x: 30, y: benchY }, to: { x: width - 30, y: benchY }, color: "rgba(246,240,230,0.24)", width: 1.3 });
    scene.ruler({ x: focusLeft, y: benchY - 70 }, { x: focusLeft, y: benchY + 70 }, "F");
    scene.ruler({ x: focusRight, y: benchY - 70 }, { x: focusRight, y: benchY + 70 }, "F");

    if (info.kind === "lens") {
      drawGlowLine(ctx, info.f > 0 ? "#41f4ff" : "#b680d9", 2.4, () => {
        ctx.moveTo(opticX, benchY - 150);
        ctx.quadraticCurveTo(opticX + (info.f > 0 ? 24 : -18), benchY, opticX, benchY + 150);
        ctx.moveTo(opticX, benchY - 150);
        ctx.quadraticCurveTo(opticX - (info.f > 0 ? 24 : -18), benchY, opticX, benchY + 150);
      });
    } else {
      drawGlowLine(ctx, info.f > 0 ? "#41f4ff" : "#b680d9", 2.4, () => {
        const bulge = info.f > 0 ? -34 : 34;
        ctx.moveTo(opticX, benchY - 145);
        ctx.quadraticCurveTo(opticX + bulge, benchY, opticX, benchY + 145);
      });
    }

    scene.arrow({ x: objectX, y: benchY }, objectTip, "#ffcf70", "object");
    if (sceneMode !== "exam" || opticMode !== mode) scene.arrow({ x: imageX, y: benchY }, imageTip, "#66f0a3", "image");
    scene.ray({ from: objectTip, to: { x: opticX, y: objectTip.y }, color: "#ffffff", label: "parallel" });
    scene.ray({ from: { x: opticX, y: objectTip.y }, to: imageTip, color: "#ffffff" });
    scene.ray({ from: objectTip, to: { x: opticX, y: benchY }, color: "#ffcf70", label: "central" });
    scene.ray({ from: { x: opticX, y: benchY }, to: imageTip, color: "#ffcf70" });

    if ((info.f < 0 || v < 0) && info.kind === "lens") {
      scene.ray({ from: { x: opticX, y: objectTip.y }, to: imageTip, color: "#66f0a3", dashed: true, label: "virtual extension" });
    }

    scene.point({ x: imageTip.x, y: imageTip.y }, sceneMode === "exam" && opticMode === mode ? "rgba(102,240,163,0.24)" : "#66f0a3", sceneMode === "exam" && opticMode === mode ? "predict" : "image", 5);
    scene.callout(24, benchY + 82, info.name, `v=${v.toFixed(1)} cm, m=${magnification.toFixed(2)}`, info.f > 0 ? "#41f4ff" : "#b680d9");
    hotspots.push({ x: opticX, y: benchY, r: 42, object: { ...getObject(concept, "optic-element"), x: opticX, y: benchY } });
    hotspots.push({ x: imageTip.x, y: imageTip.y, r: 28, object: { ...getObject(concept, "image"), x: imageTip.x, y: imageTip.y } });
    hotspots.push({ x: opticX + info.realSide * fAbs * scale, y: benchY, r: 26, object: { ...getObject(concept, "principal-focus"), x: opticX + info.realSide * fAbs * scale, y: benchY } });
    ctx.restore();
    return { v, magnification, name: info.name };
  };

  const primary = drawBench(cy);
  if (sceneMode === "compare") {
    const compareMode = mode === 0 ? 1 : 0;
    drawBench(height * 0.74, compareMode, 0.72);
    scene.callout(width - Math.min(330, width * 0.36), height * 0.1, "Compare mode", "Top is selected optic; lower bench contrasts the ray behavior.", "#b9ff6a");
  }
  if (sceneMode === "exam") {
    scene.callout(width - Math.min(320, width * 0.34), height * 0.16, "Exam challenge", "Predict real/virtual, erect/inverted, and magnification before revealing.", "#ffcf70");
  } else {
    drawMeasurementBadge(ctx, width - 24, 54, `u=${u.toFixed(0)}cm  v=${primary.v.toFixed(1)}cm  m=${primary.magnification.toFixed(2)}`, "#ffcf70", "right");
  }
  void time;
}

function drawElectricField(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const sep = values.separation ?? 240;
  const q1 = values.q1 ?? 3;
  const q2 = values.q2 ?? -3;
  const c1 = { x: width / 2 - sep / 2, y: height / 2 };
  const c2 = { x: width / 2 + sep / 2, y: height / 2 };

  for (let x = 80; x < width - 80; x += 70) {
    for (let y = 90; y < height - 70; y += 58) {
      let ex = 0;
      let ey = 0;
      for (const charge of [
        { ...c1, q: q1 },
        { ...c2, q: q2 },
      ]) {
        const dx = x - charge.x;
        const dy = y - charge.y;
        const r2 = Math.max(dx * dx + dy * dy, 900);
        const r = Math.sqrt(r2);
        ex += (charge.q * dx) / (r2 * r);
        ey += (charge.q * dy) / (r2 * r);
      }
      const mag = Math.hypot(ex, ey) || 1;
      drawArrow(ctx, x, y, x + (ex / mag) * 18, y + (ey / mag) * 18, "rgba(77,214,255,0.55)");
    }
  }

  const chargePoint = (point: { x: number; y: number }, q: number) => {
    ctx.fillStyle = q >= 0 ? "#ff7979" : "#4dd6ff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#020308";
    ctx.font = "700 20px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(q >= 0 ? "+" : "-", point.x, point.y);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  };
  chargePoint(c1, q1);
  chargePoint(c2, q2);
  hotspots.push({ x: width / 2, y: height / 2 - 80, r: 80, object: { ...getObject(concept, "field-vector"), x: width / 2, y: height / 2 - 80 } });
}

function drawWaveMotion(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const mid = height / 2;
  const A = values.A ?? 58;
  const lambda = values.lambda ?? 190;
  const waveSpeed = (values.waveSpeed ?? 1.2) * (values.speed ?? 1);
  const k = (2 * Math.PI) / Math.max(lambda, 1);
  const phase = time * waveSpeed * 2.2;

  ctx.strokeStyle = "rgba(246,240,230,0.16)";
  ctx.beginPath();
  ctx.moveTo(42, mid);
  ctx.lineTo(width - 42, mid);
  ctx.stroke();

  drawGlowLine(ctx, "#4dd6ff", 2.5, () => {
    for (let x = 40; x <= width - 40; x += 4) {
      const y = mid + A * Math.sin(k * x - phase);
      if (x === 40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  });

  const crestX = 40 + (((phase / k) % lambda) + lambda) % lambda;
  const visibleCrestX = crestX < width - 40 ? crestX : crestX - lambda;
  const crest = { x: clamp(visibleCrestX, 40, width - 40), y: mid - A };
  drawPoint(ctx, crest.x, crest.y, "#ffcf70", "crest");
  drawArrow(ctx, crest.x - 55, crest.y - 38, crest.x + 10, crest.y - 38, "#66f0a3");
  hotspots.push({ x: crest.x, y: crest.y, r: 28, object: { ...getObject(concept, "wave-crest"), x: crest.x, y: crest.y } });
}

function drawWaveOptics(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const sourceX = width * 0.15;
  const barrierX = width * 0.38;
  const screenX = width * 0.82;
  const cy = height / 2;
  const slitGap = values.slitSeparation ?? 96;
  const wavelength = values.wavelength ?? 46;
  const screenDistance = Math.max(values.screenDistance ?? 420, 120);
  const contrast = clamp(values.contrast ?? 0.82, 0.1, 1);
  const phase = time * 1.7 * (values.speed ?? 1);
  const slitA = { x: barrierX, y: cy - slitGap / 2 };
  const slitB = { x: barrierX, y: cy + slitGap / 2 };

  ctx.save();
  ctx.strokeStyle = "rgba(246,240,230,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barrierX, 54);
  ctx.lineTo(barrierX, slitA.y - 18);
  ctx.moveTo(barrierX, slitA.y + 18);
  ctx.lineTo(barrierX, slitB.y - 18);
  ctx.moveTo(barrierX, slitB.y + 18);
  ctx.lineTo(barrierX, height - 54);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(screenX, 54, 10, height - 108);
  ctx.restore();

  drawPoint(ctx, sourceX, cy, "#ffcf70", "source");
  drawGlowLine(ctx, "#41f4ff", 1.4, () => {
    for (let r = 28 + ((phase * 18) % wavelength); r < barrierX - sourceX; r += wavelength) {
      ctx.moveTo(sourceX + r, cy);
      ctx.arc(sourceX, cy, r, -0.55, 0.55);
    }
  });

  [slitA, slitB].forEach((slit, index) => {
    drawPoint(ctx, slit.x, slit.y, index === 0 ? "#41f4ff" : "#ff4fd8", `S${index + 1}`);
    drawGlowLine(ctx, index === 0 ? "#41f4ff" : "#ff4fd8", 1.1, () => {
      for (let r = 20 + ((phase * 24) % wavelength); r < screenX - barrierX; r += wavelength) {
        ctx.moveTo(slit.x + r, slit.y);
        ctx.arc(slit.x, slit.y, r, -0.68, 0.68);
      }
    });
  });

  const patternTop = 64;
  const patternBottom = height - 64;
  for (let y = patternTop; y <= patternBottom; y += 3) {
    const ym = ((y - cy) / Math.max(screenDistance * 0.35, 1));
    const pathDifference = slitGap * ym;
    const intensity = Math.pow(Math.cos((Math.PI * pathDifference) / wavelength), 2);
    const alpha = 0.08 + intensity * contrast * 0.78;
    ctx.fillStyle = `rgba(185,255,106,${alpha.toFixed(3)})`;
    ctx.fillRect(screenX + 10, y, 28 + intensity * 44, 3);
  }

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  ctx.font = "800 10px Inter,sans-serif";
  [-2, -1, 0, 1, 2].forEach((order) => {
    const y = cy + order * ((wavelength * screenDistance) / Math.max(slitGap, 1)) * 0.35;
    if (y < patternTop || y > patternBottom) return;
    ctx.strokeStyle = order === 0 ? "rgba(255,255,255,0.42)" : "rgba(185,255,106,0.24)";
    ctx.beginPath();
    ctx.moveTo(screenX + 6, y);
    ctx.lineTo(screenX + 92, y);
    ctx.stroke();
    ctx.fillText(order === 0 ? "m=0" : `m=${order}`, screenX + 100, y + 3);
  });
  ctx.restore();

  const central = { x: screenX + 42, y: cy };
  drawGlowLine(ctx, "#ffffff", 1.4, () => {
    ctx.moveTo(slitA.x, slitA.y);
    ctx.lineTo(central.x, central.y);
    ctx.moveTo(slitB.x, slitB.y);
    ctx.lineTo(central.x, central.y);
  });
  drawPoint(ctx, central.x, central.y, "#ffffff", "central max");
  drawMeasurementBadge(ctx, 24, height - 112, `lambda=${wavelength.toFixed(0)}  d=${slitGap.toFixed(0)}  beta ~ lambdaD/d`, "#b9ff6a");
  hotspots.push({ x: slitA.x, y: slitA.y, r: 26, object: { ...getObject(concept, "slit-source"), x: slitA.x, y: slitA.y } });
  hotspots.push({ x: central.x, y: central.y, r: 34, object: { ...getObject(concept, "central-maximum"), x: central.x, y: central.y } });
  hotspots.push({ x: screenX + 34, y: cy - slitGap, r: 40, object: { ...getObject(concept, "fringe-pattern"), x: screenX + 34, y: cy - slitGap } });
}

function drawChemistrySteps(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cy = height / 2;
  const phase = (time * 0.16 * (values.speed ?? 1)) % 1;

  if (concept.id === "chem-sn1") {
    const center = { x: width * 0.48, y: cy };
    const lg = { x: center.x + 52 + 160 * clamp(phase * 1.6, 0, 1), y: cy - 42 * clamp(phase * 1.4, 0, 1) };
    const nu = { x: width * 0.18 + 170 * clamp((phase - 0.55) * 2, 0, 1), y: cy + 72 };
    drawPoint(ctx, center.x, center.y, "#ffcf70", phase > 0.28 ? "C+" : "C-LG");
    drawPoint(ctx, lg.x, lg.y, "#ff7979", "LG-");
    drawPoint(ctx, nu.x, nu.y, "#66f0a3", "Nu-");
    if (phase < 0.38) {
      drawGlowLine(ctx, "#ff7979", 2, () => {
        ctx.moveTo(center.x + 16, center.y);
        ctx.lineTo(lg.x - 14, lg.y);
      });
    }
    if (phase > 0.45) drawArrow(ctx, nu.x + 20, nu.y - 20, center.x - 18, center.y + 12, "#66f0a3");
    const obj = getObject(concept, "carbocation");
    hotspots.push({ x: center.x, y: center.y, r: 46, object: { ...obj, x: center.x, y: center.y } });
    return;
  }

  if (concept.id === "chem-sn1-sn2" || concept.id === "chem-sn2") {
    const left = { x: width * 0.26, y: cy };
    const center = { x: width * 0.5, y: cy };
    const right = { x: width * 0.74, y: cy };
    const nuX = left.x + (center.x - left.x - 44) * clamp(phase * 1.4, 0, 1);
    const lgX = center.x + 44 + 120 * clamp((phase - 0.45) * 1.8, 0, 1);
    drawPoint(ctx, nuX, cy, "#66f0a3", "Nu-");
    drawPoint(ctx, center.x, cy, "#ffcf70", "C");
    drawPoint(ctx, lgX, cy, "#ff7979", "LG");
    drawGlowLine(ctx, "#b680d9", 2, () => {
      ctx.moveTo(nuX + 12, cy);
      ctx.lineTo(center.x - 12, cy);
      ctx.moveTo(center.x + 12, cy);
      ctx.lineTo(lgX - 12, cy);
    });
    drawArrow(ctx, right.x - 55, cy - 60, right.x + 35, cy - 60, "#ffffff");
    const obj = getObject(concept, "transition-state");
    hotspots.push({ x: center.x, y: cy, r: 42, object: { ...obj, x: center.x, y: cy } });
    return;
  }

  const hx = width * 0.25 + (width * 0.25) * clamp(phase * 1.6, 0, 1);
  const ox = width * 0.75 - (width * 0.25) * clamp(phase * 1.6, 0, 1);
  drawPoint(ctx, hx, cy, "#ff7979", "H+");
  drawPoint(ctx, ox, cy, "#4dd6ff", "OH-");
  if (phase > 0.45) {
    drawGlowLine(ctx, "#ffcf70", 3, () => {
      ctx.arc(width / 2, cy, 44 + Math.sin(time * 5) * 3, 0, Math.PI * 2);
    });
    ctx.fillStyle = "rgba(246,240,230,0.88)";
    ctx.font = "700 22px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("H2O", width / 2, cy + 8);
    ctx.textAlign = "start";
  }
  hotspots.push({ x: hx, y: cy, r: 24, object: { ...getObject(concept, "h-ion"), x: hx, y: cy } });
}

function drawEquilibrium(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const progress = equilibriumProgress(values);
  const y = height / 2;
  const left = width * 0.24;
  const right = width * 0.76;
  drawPoint(ctx, left, y, "#4dd6ff", "Reactants");
  drawPoint(ctx, right, y, "#ffcf70", "Products");
  drawArrow(ctx, left + 55, y - 20, right - 55, y - 20, progress > 0.5 ? "#66f0a3" : "rgba(255,255,255,0.45)");
  drawArrow(ctx, right - 55, y + 20, left + 55, y + 20, progress < 0.5 ? "#ff7979" : "rgba(255,255,255,0.45)");
  const markerX = left + (right - left) * progress;
  drawPoint(ctx, markerX, y - 58, "#66f0a3", "Q -> K");
  hotspots.push({ x: markerX, y: y - 30, r: 46, object: { ...getObject(concept, "equilibrium-arrow"), x: markerX, y } });
}

function drawCollisionTheory(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const probability = arrheniusRelativeProbability(values);
  const eventIndex = Math.floor(time * 2 * (values.speed ?? 1));
  for (let i = 0; i < 24; i += 1) {
    const angle = time * (0.35 + i * 0.01) + i * 2.41;
    const radius = 60 + (i % 6) * 28;
    const x = width / 2 + Math.cos(angle) * radius + Math.sin(i) * 30;
    const y = height / 2 + Math.sin(angle * 1.2) * radius * 0.58;
    drawPoint(ctx, x, y, i % 2 ? "#4dd6ff" : "#ffcf70");
  }
  const flash = (eventIndex % 10) / 10 < probability;
  if (flash) {
    drawGlowLine(ctx, "#66f0a3", 4, () => {
      ctx.arc(width / 2, height / 2, 42 + Math.sin(time * 10) * 12, 0, Math.PI * 2);
    });
  }
  hotspots.push({ x: width / 2, y: height / 2, r: 60, object: { ...getObject(concept, "effective-collision"), x: width / 2, y: height / 2 } });
}

function drawTitration(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const pad = 54;
  const acidMoles = (values.acidConc ?? 0.2) * (values.acidVolume ?? 50) * 0.001;
  const eqVolume = (acidMoles / Math.max(values.baseConc ?? 0.2, 0.001)) * 1000;
  const maxVolume = Math.max(eqVolume * 2, 80);
  const xToPx = (x: number) => pad + (x / maxVolume) * (width - pad * 2);
  const yToPx = (ph: number) => height - pad - (ph / 14) * (height - pad * 2);
  drawAxes(ctx, width, height, xToPx, yToPx, 0, maxVolume, 0, 14);
  drawGlowLine(ctx, "#b680d9", 2.4, () => {
    for (let i = 0; i <= 220; i += 1) {
      const volume = (i / 220) * maxVolume;
      const ph = titrationPh(values, volume);
      const x = xToPx(volume);
      const y = yToPx(ph);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  });
  const currentVolume = ((time * 0.08) % 1) * maxVolume;
  drawPoint(ctx, xToPx(currentVolume), yToPx(titrationPh(values, currentVolume)), "#ffcf70", "pH");
  drawPoint(ctx, xToPx(eqVolume), yToPx(7), "#66f0a3", "eq");
  hotspots.push({ x: xToPx(eqVolume), y: yToPx(7), r: 26, object: { ...getObject(concept, "equivalence-point"), x: xToPx(eqVolume), y: yToPx(7) } });
}

function drawElectrochemicalCell(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const left = { x: width * 0.28, y: height * 0.58 };
  const right = { x: width * 0.72, y: height * 0.58 };
  const eCell = (values.cathodePotential ?? 0.34) - (values.anodePotential ?? -0.76);
  const pulse = (time * 0.28 * (values.speed ?? 1)) % 1;

  ctx.fillStyle = "rgba(77,214,255,0.08)";
  ctx.strokeStyle = "rgba(77,214,255,0.24)";
  ctx.lineWidth = 2;
  for (const cell of [left, right]) {
    ctx.beginPath();
    ctx.roundRect(cell.x - 86, cell.y - 78, 172, 128, 16);
    ctx.fill();
    ctx.stroke();
  }
  drawGlowLine(ctx, "#ffffff", 1.8, () => {
    ctx.moveTo(left.x, left.y - 108);
    ctx.lineTo(left.x, left.y - 142);
    ctx.lineTo(right.x, right.y - 142);
    ctx.lineTo(right.x, right.y - 108);
  });
  drawArrow(ctx, left.x + 18 + pulse * (right.x - left.x - 36), left.y - 142, left.x + 46 + pulse * (right.x - left.x - 36), right.y - 142, "#ffcf70");
  drawGlowLine(ctx, "#66f0a3", 2, () => {
    ctx.moveTo(left.x + 70, left.y - 26);
    ctx.bezierCurveTo(width * 0.43, height * 0.42, width * 0.57, height * 0.42, right.x - 70, right.y - 26);
  });
  drawPoint(ctx, left.x, left.y - 18, "#ff7979", "Anode");
  drawPoint(ctx, right.x, right.y - 18, "#4dd6ff", "Cathode");
  ctx.fillStyle = "rgba(246,240,230,0.76)";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText(`Ecell = ${eCell.toFixed(2)} V`, width / 2 - 42, height * 0.27);
  hotspots.push({ x: width / 2, y: height * 0.47, r: 58, object: { ...getObject(concept, "salt-bridge"), x: width / 2, y: height * 0.47 } });
}

function drawVseprGeometry(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const center = { x: width / 2, y: height / 2 };
  const bondPairs = Math.round(clamp(values.bondPairs ?? 4, 2, 6));
  const lonePairs = Math.round(clamp(values.lonePairs ?? 0, 0, 2));
  const total = bondPairs + lonePairs;
  const radius = Math.min(width, height) * 0.24;

  drawPoint(ctx, center.x, center.y, "#ffcf70", "A");
  for (let i = 0; i < total; i += 1) {
    const angle = -Math.PI / 2 + (i / total) * Math.PI * 2 + Math.sin(time * 0.7) * 0.03;
    const end = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    if (i < bondPairs) {
      drawGlowLine(ctx, "#4dd6ff", 2, () => {
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(end.x, end.y);
      });
      drawPoint(ctx, end.x, end.y, "#4dd6ff", "X");
    } else {
      drawGlowLine(ctx, "#b680d9", 2, () => {
        ctx.arc(end.x, end.y, 18, 0, Math.PI * 2);
      });
      ctx.fillStyle = "rgba(182,128,217,0.82)";
      ctx.font = "700 13px Inter, sans-serif";
      ctx.fillText("LP", end.x - 9, end.y + 4);
      hotspots.push({ x: end.x, y: end.y, r: 28, object: { ...getObject(concept, "lone-pair"), x: end.x, y: end.y } });
    }
  }
}

function drawNuclearDecay(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const daughter = nuclearDaughter(concept.id, values);
  const phase = (time * 0.18 * (values.speed ?? 1)) % 1;
  const parent = { x: width * 0.35, y: height / 2 };
  const child = { x: width * 0.64, y: height / 2 };
  const emitted = { x: parent.x + (width * 0.38) * phase, y: parent.y - 100 * Math.sin(phase * Math.PI) };
  drawPoint(ctx, parent.x, parent.y, "#ffcf70", `A${daughter.parentA} Z${daughter.parentZ}`);
  drawPoint(ctx, child.x, child.y, "#4dd6ff", `A${daughter.daughterA} Z${daughter.daughterZ}`);
  drawPoint(ctx, emitted.x, emitted.y, "#66f0a3", daughter.emitted);
  drawArrow(ctx, parent.x + 45, parent.y, child.x - 45, child.y, "#ffffff");
  const objectId = concept.id.includes("alpha")
    ? "alpha-particle"
    : concept.id.includes("minus")
      ? "beta-minus"
      : concept.id.includes("plus")
        ? "beta-plus"
        : "gamma-ray";
  hotspots.push({ x: emitted.x, y: emitted.y, r: 34, object: { ...getObject(concept, objectId), x: emitted.x, y: emitted.y } });
}

function drawHalfLife(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const pad = 54;
  const halfLife = values.halfLife ?? 6;
  const maxT = halfLife * 5;
  const N0 = values.N0 ?? 100;
  const xToPx = (x: number) => pad + (x / maxT) * (width - pad * 2);
  const yToPx = (n: number) => height - pad - (n / N0) * (height - pad * 2);
  drawAxes(ctx, width, height, xToPx, yToPx, 0, maxT, 0, N0);
  drawGlowLine(ctx, "#ffcf70", 2.4, () => {
    for (let i = 0; i <= 180; i += 1) {
      const t = (i / 180) * maxT;
      const n = halfLifeRemaining(values, t);
      if (i === 0) ctx.moveTo(xToPx(t), yToPx(n));
      else ctx.lineTo(xToPx(t), yToPx(n));
    }
  });
  const tNow = ((time * 0.07 * (values.speed ?? 1)) % 1) * maxT;
  drawPoint(ctx, xToPx(tNow), yToPx(halfLifeRemaining(values, tNow)), "#4dd6ff", "N(t)");
  drawPoint(ctx, xToPx(halfLife), yToPx(N0 / 2), "#66f0a3", "T1/2");
  hotspots.push({ x: xToPx(halfLife), y: yToPx(N0 / 2), r: 26, object: { ...getObject(concept, "half-life-point"), x: xToPx(halfLife), y: yToPx(N0 / 2) } });
}

function drawNuclearEvent(ctx: CanvasRenderingContext2D, concept: VisualConcept, values: VariableValues, time: number, hotspots: Hotspot[]) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const phase = (time * 0.14 * (values.speed ?? 1)) % 1;
  const center = { x: width / 2, y: height / 2 };

  if (concept.id.includes("fission")) {
    const incoming = { x: width * 0.16 + width * 0.24 * clamp(phase * 1.8, 0, 1), y: center.y };
    const split = clamp((phase - 0.38) * 2, 0, 1);
    const left = { x: center.x - split * 120, y: center.y - split * 42 };
    const right = { x: center.x + split * 120, y: center.y + split * 42 };
    drawPoint(ctx, incoming.x, incoming.y, "#66f0a3", "n");
    drawPoint(ctx, left.x, left.y, "#ffcf70", split > 0.2 ? "fragment" : "heavy nucleus");
    if (split > 0.2) drawPoint(ctx, right.x, right.y, "#4dd6ff", "fragment");
    if (split > 0.45) {
      drawArrow(ctx, center.x, center.y, center.x + 150, center.y - 92, "#66f0a3");
      drawArrow(ctx, center.x, center.y, center.x + 150, center.y + 92, "#66f0a3");
    }
    hotspots.push({ x: incoming.x, y: incoming.y, r: 30, object: { ...getObject(concept, "fission-neutron"), x: incoming.x, y: incoming.y } });
    return;
  }

  const approach = clamp(phase * 1.7, 0, 1);
  const left = { x: center.x - 180 + approach * 145, y: center.y - 28 };
  const right = { x: center.x + 180 - approach * 145, y: center.y + 28 };
  const fused = phase > 0.62;
  drawPoint(ctx, fused ? center.x : left.x, fused ? center.y : left.y, "#4dd6ff", fused ? "fused" : "D");
  if (!fused) drawPoint(ctx, right.x, right.y, "#ffcf70", "T");
  if (fused) {
    drawGlowLine(ctx, "#ffcf70", 4, () => {
      ctx.arc(center.x, center.y, 58 + Math.sin(time * 8) * 6, 0, Math.PI * 2);
    });
  }
  hotspots.push({ x: center.x, y: center.y, r: 52, object: { ...getObject(concept, "fusion-core"), x: center.x, y: center.y } });
}

function VisualCanvas({
  concept,
  values,
  equations,
  surfaceExpression,
  playing,
  resetKey,
  sceneMode,
  scrubProgress,
  onSelect,
}: {
  concept: VisualConcept;
  values: VariableValues;
  equations: string[];
  surfaceExpression: string;
  playing: boolean;
  resetKey: number;
  sceneMode: VisualSceneMode;
  scrubProgress: number | null;
  onSelect: (object: SelectedVisualObject) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hotspotsRef = useRef<Hotspot[]>([]);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const angleRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    startedAtRef.current = performance.now();
    pausedAtRef.current = 0;
  }, [resetKey, concept.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    const render = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.max(320, Math.floor(rect.width * dpr));
      const nextHeight = Math.max(280, Math.floor(rect.height * dpr));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      const elapsedBase = playing
        ? (now - startedAtRef.current) / 1000
        : pausedAtRef.current || (now - startedAtRef.current) / 1000;
      if (!playing && !pausedAtRef.current) pausedAtRef.current = elapsedBase;
      if (playing && pausedAtRef.current) {
        startedAtRef.current = now - pausedAtRef.current * 1000;
        pausedAtRef.current = 0;
      }
      const elapsed = scrubProgress === null ? elapsedBase : (scrubProgress / 0.08) / Math.max(values.speed ?? 1, 0.001);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawLabGrid(ctx, canvas.width, canvas.height, elapsed);
      hotspotsRef.current = [];

      if (concept.renderer === "math-2d") drawMath2D(ctx, concept, values, equations, elapsed, hotspotsRef.current);
      if (concept.renderer === "math-3d") drawMath3D(ctx, concept, values, surfaceExpression, elapsed, hotspotsRef.current, angleRef.current);
      if (concept.renderer === "projectile") drawProjectile(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "shm") drawShm(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "pendulum") drawPendulum(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "double-pendulum") drawDoublePendulum(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "wave-motion") drawWaveMotion(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "wave-optics") drawWaveOptics(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "ray-optics") drawRayOptics(ctx, concept, values, hotspotsRef.current, sceneMode, elapsed);
      if (concept.renderer === "electric-field") drawElectricField(ctx, concept, values, hotspotsRef.current);
      if (concept.renderer === "chemistry-steps") drawChemistrySteps(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "equilibrium") drawEquilibrium(ctx, concept, values, hotspotsRef.current);
      if (concept.renderer === "collision-theory") drawCollisionTheory(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "titration") drawTitration(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "electrochemical-cell") drawElectrochemicalCell(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "vsepr-geometry") drawVseprGeometry(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "nuclear-decay") drawNuclearDecay(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "half-life") drawHalfLife(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "nuclear-event") drawNuclearEvent(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "circular-motion") drawCircularMotion(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "spring-mass") drawSpringMass(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "work-energy") drawWorkEnergy(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "energy-profile") drawEnergyProfile(ctx, concept, values, elapsed, hotspotsRef.current);
      if (concept.renderer === "radiation-penetration") drawRadiationPenetration(ctx, concept, values, elapsed, hotspotsRef.current);
      drawSceneOverlay(ctx, concept, getLoopProgress(elapsed, values), values, elapsed);

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [concept, equations, playing, resetKey, sceneMode, scrubProgress, surfaceExpression, values]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || concept.renderer !== "math-3d") return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    angleRef.current = {
      x: clamp(angleRef.current.x + dy * 0.006, -1.1, 1.1),
      y: angleRef.current.y + dx * 0.006,
    };
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    const hit = hotspotsRef.current.find((spot) => Math.hypot(spot.x - x, spot.y - y) <= spot.r);
    if (hit) onSelect(hit.object);
    dragRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className="vl-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      aria-label={`${concept.title} visual canvas`}
    />
  );
}

function buildTutorQuestion(mode: TutorRequestPayload["mode"], object: SelectedVisualObject | null) {
  if (mode === "why") return object ? `Why does ${object.label} behave this way?` : "Why does this visual behave this way?";
  if (mode === "how") return object ? `How is ${object.label} connected to the formula?` : "How is this visual calculated?";
  if (mode === "practice") return "Give two NEET-style practice checks from this verified concept.";
  return object ? `Give a deep explanation of ${object.label}.` : "Give a deep explanation of this verified concept.";
}

function getPresetDefaults(concept: VisualConcept) {
  return {
    values: getDefaultVariables(concept),
    equations: concept.defaultEquations,
    surfaceExpression: concept.defaultSurface,
  };
}

function formatVariableValue(concept: VisualConcept, key: string, value: number, fallback: number, step: number, unit?: string) {
  if (concept.id === "physics-ray-optics" && key === "lensMode") {
    return ["Convex lens", "Concave lens", "Concave mirror", "Convex mirror"][Math.round(value)] ?? "Convex lens";
  }
  return `${(value ?? fallback).toFixed(step < 1 ? 2 : 0)}${unit ? ` ${unit}` : ""}`;
}

function formatSnapshotTime(createdAt: number) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(createdAt));
}

function getMissionSteps(concept: VisualConcept): MissionStep[] {
  const firstStep = concept.cinematic?.beats[0] ?? concept.steps[0];
  const examStep = concept.examChecks?.[0];
  return [
    {
      id: "observe",
      label: "Observe",
      detail: firstStep?.detail ?? concept.description,
      action: "observe",
    },
    {
      id: "predict",
      label: "Predict",
      detail: concept.neetTakeaways[0] ?? "Predict the direction of change before moving a slider.",
      action: "predict",
    },
    {
      id: "experiment",
      label: "Experiment",
      detail: concept.variables[0]
        ? `Change ${concept.variables[0].label} and watch what stays invariant.`
        : "Compare the visual state against a saved snapshot.",
      action: "experiment",
    },
    {
      id: "exam",
      label: "Exam Trap",
      detail: examStep?.prompt ?? concept.commonMistakes[0] ?? "Name the most likely NEET mistake in this concept.",
      action: "exam",
    },
    {
      id: "notebook",
      label: "Lock It",
      detail: "Save one line that future-you should revise before a test.",
      action: "notebook",
    },
  ];
}

function buildPracticeQuestions(concept: VisualConcept, values: VariableValues): PracticeQuestion[] {
  const primaryFormula = concept.formulas[0] ?? "Verified formula from this visual";
  const mainTakeaway = concept.neetTakeaways[0] ?? concept.description;
  const mainMistake = concept.commonMistakes[0] ?? "Using an unsupported assumption";
  const variable = concept.variables[0];
  const variableValue = variable ? values[variable.key] ?? variable.defaultValue : null;
  const fromExam = (concept.examChecks ?? []).slice(0, 2).map((check) => ({
    id: `exam-${check.id}`,
    prompt: check.prompt,
    choices: [
      check.answer,
      mainMistake,
      "It cannot be determined from the verified visual.",
      primaryFormula,
    ],
    answerIndex: 0,
    explanation: check.explanation,
  }));

  return [
    ...fromExam,
    {
      id: "formula-anchor",
      prompt: `Which statement best anchors ${concept.title} to the visual model?`,
      choices: [
        primaryFormula,
        mainMistake,
        "The shape is chosen by AI without calculation.",
        "Only the animation speed decides the result.",
      ],
      answerIndex: 0,
      explanation: `This visual is constrained by ${concept.aiContext.sourceOfTruth}.`,
    },
    {
      id: "mistake-lens",
      prompt: "Which option is the trap to avoid in this topic?",
      choices: [
        mainMistake,
        mainTakeaway,
        concept.verifiedFacts[0] ?? "The deterministic model is the source of truth.",
        variable && variableValue !== null ? `${variable.label} is currently ${variableValue.toFixed(variable.step < 1 ? 2 : 0)}.` : primaryFormula,
      ],
      answerIndex: 0,
      explanation: mainTakeaway,
    },
  ].slice(0, 4);
}

function computeMastery(progress?: ConceptProgress) {
  if (!progress) return 0;
  const practiceScore = progress.practiceAttempts ? Math.min(30, Math.round((progress.practiceCorrect / progress.practiceAttempts) * 30)) : 0;
  return clamp(
    Math.round(
      Math.min(progress.missionsCompleted, 2) * 18 +
      Math.min(progress.snapshotsSaved, 3) * 6 +
      Math.min(progress.notes, 3) * 6 +
      practiceScore
    ),
    0,
    100
  );
}

export default function VisualLabClient() {
  const [subject, setSubject] = useState<VisualSubject>("maths");
  const [conceptId, setConceptId] = useState("math-exp-vs-quad");
  const concept = useMemo(() => getConceptById(conceptId), [conceptId]);
  const subjectConcepts = useMemo(() => getConceptsBySubject(subject), [subject]);
  const [mode, setMode] = useState<"guided" | "custom">("guided");
  const [values, setValues] = useState<VariableValues>(() => getDefaultVariables(getConceptById("math-exp-vs-quad")));
  const [equations, setEquations] = useState<string[]>(["x^2", "1.1^x"]);
  const [surfaceExpression, setSurfaceExpression] = useState("sin(x^2 + y^2)");
  const [playing, setPlaying] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [selected, setSelected] = useState<SelectedVisualObject | null>(concept.visualObjects[0] ?? null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerModel, setAnswerModel] = useState("");
  const [asking, setAsking] = useState(false);
  const [controlDockOpen, setControlDockOpen] = useState(true);
  const [deepDrawerOpen, setDeepDrawerOpen] = useState(false);
  const [topicSearch, setTopicSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<VisualConcept["difficulty"] | "All">("All");
  const [sceneMode, setSceneMode] = useState<VisualSceneMode>("learn");
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const [examReveal, setExamReveal] = useState(false);
  const [snapshots, setSnapshots] = useState<LabSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [completedMissionSteps, setCompletedMissionSteps] = useState<string[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceChoice, setPracticeChoice] = useState<number | null>(null);
  const [practiceContext, setPracticeContext] = useState({ attempts: 0, correct: 0, lastQuestion: "", lastCorrect: false });
  const [notebookEntries, setNotebookEntries] = useState<NotebookEntry[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [progressByConcept, setProgressByConcept] = useState<LabProgress>({});
  const restoredRef = useRef(false);
  const restoringConceptRef = useRef(false);
  const cinematicBeats = useMemo(() => getCinematicBeats(concept), [concept]);
  const filteredSubjectConcepts = useMemo(() => {
    const query = topicSearch.trim().toLowerCase();
    return subjectConcepts.filter((item) => {
      const matchesSearch = !query || `${item.title} ${item.chapter} ${item.description}`.toLowerCase().includes(query);
      const matchesDifficulty = difficultyFilter === "All" || item.difficulty === difficultyFilter;
      return matchesSearch && matchesDifficulty;
    });
  }, [difficultyFilter, subjectConcepts, topicSearch]);
  const chapterOptions = useMemo(() => {
    const chapters = Array.from(new Set(filteredSubjectConcepts.map((item) => item.chapter)));
    return chapters.includes(concept.chapter) ? chapters : [concept.chapter, ...chapters];
  }, [concept.chapter, filteredSubjectConcepts]);
  const conceptOptions = useMemo(() => {
    const base = (filteredSubjectConcepts.length ? filteredSubjectConcepts : subjectConcepts).filter((item) => item.chapter === concept.chapter);
    return base.some((item) => item.id === concept.id) ? base : [concept, ...base];
  }, [concept, filteredSubjectConcepts, subjectConcepts]);

  const applyPreset = (preset: VisualPreset) => {
    const defaults = getPresetDefaults(concept);
    setValues({ ...defaults.values, ...(preset.values ?? {}) });
    if (preset.equations ?? defaults.equations) setEquations(preset.equations ?? defaults.equations ?? equations);
    if (preset.surfaceExpression ?? defaults.surfaceExpression) {
      setSurfaceExpression(preset.surfaceExpression ?? defaults.surfaceExpression ?? surfaceExpression);
    }
    setScrubProgress(null);
    setExamReveal(false);
    setResetKey((key) => key + 1);
  };

  const qualityGates = useMemo(() => [
    { label: "V3 scene", ok: concept.renderer === "ray-optics" || Boolean(concept.cinematic) },
    { label: "Presets", ok: Boolean(concept.presets?.length) },
    { label: "Cinematic beats", ok: cinematicBeats.length >= 3 },
    { label: "Exam check", ok: Boolean(concept.examChecks?.length) },
    { label: "Live values", ok: concept.variables.length > 0 },
  ], [cinematicBeats.length, concept]);
  const missionSteps = useMemo(() => getMissionSteps(concept), [concept]);
  const activeMissionStep = missionSteps.find((step) => !completedMissionSteps.includes(step.id)) ?? missionSteps[missionSteps.length - 1];
  const practiceQuestions = useMemo(() => buildPracticeQuestions(concept, values), [concept, values]);
  const currentPractice = practiceQuestions[practiceIndex % Math.max(practiceQuestions.length, 1)];
  const conceptNotes = useMemo(
    () => notebookEntries.filter((entry) => entry.conceptId === concept.id).slice(0, 4),
    [concept.id, notebookEntries]
  );
  const conceptProgress = progressByConcept[concept.id];
  const subjectProgress = useMemo(() => {
    const entries = Object.values(progressByConcept).filter((entry) => entry.subject === subject);
    const mastered = entries.filter((entry) => computeMastery(entry) >= 70).length;
    const attempts = entries.reduce((sum, entry) => sum + entry.practiceAttempts, 0);
    const correct = entries.reduce((sum, entry) => sum + entry.practiceCorrect, 0);
    const avgMastery = entries.length ? Math.round(entries.reduce((sum, entry) => sum + computeMastery(entry), 0) / entries.length) : 0;
    return { explored: entries.length, mastered, attempts, correct, avgMastery };
  }, [progressByConcept, subject]);
  const activeSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? null,
    [activeSnapshotId, snapshots]
  );
  const snapshotDiff = useMemo(() => {
    if (!activeSnapshot) return [];
    const diffs = concept.variables
      .map((item) => {
        const before = activeSnapshot.values[item.key] ?? item.defaultValue;
        const after = values[item.key] ?? item.defaultValue;
        if (Math.abs(before - after) < Math.max(item.step / 10, 0.0001)) return null;
        return `${item.label}: ${formatVariableValue(concept, item.key, before, item.defaultValue, item.step, item.unit)} -> ${formatVariableValue(concept, item.key, after, item.defaultValue, item.step, item.unit)}`;
      })
      .filter((item): item is string => Boolean(item));
    if (activeSnapshot.equations.join("|") !== equations.join("|")) diffs.push("Equations changed");
    if (activeSnapshot.surfaceExpression !== surfaceExpression) diffs.push("Surface changed");
    return diffs.slice(0, 4);
  }, [activeSnapshot, concept, equations, surfaceExpression, values]);
  const timelineBeat = useMemo(() => {
    if (!cinematicBeats.length) return null;
    const progress = scrubProgress ?? 0;
    return cinematicBeats.reduce((current, beat) => progress >= beat.t ? beat : current, cinematicBeats[0]);
  }, [cinematicBeats, scrubProgress]);
  const liveMetrics = useMemo(
    () => concept.variables.slice(0, 3).map((item) => ({
      key: item.key,
      label: item.label,
      value: formatVariableValue(concept, item.key, values[item.key] ?? item.defaultValue, item.defaultValue, item.step, item.unit),
    })),
    [concept, values]
  );
  const recordProgress = useCallback((patch: Partial<ConceptProgress>) => {
    setProgressByConcept((current) => {
      const previous = current[concept.id] ?? {
        conceptId: concept.id,
        subject: concept.subject,
        viewedAt: Date.now(),
        practiceAttempts: 0,
        practiceCorrect: 0,
        missionsCompleted: 0,
        snapshotsSaved: 0,
        notes: 0,
        mastery: 0,
      };
      const next = { ...previous, ...patch, viewedAt: Date.now(), subject: concept.subject };
      next.mastery = computeMastery(next);
      return { ...current, [concept.id]: next };
    });
  }, [concept.id, concept.subject]);

  useEffect(() => {
    const next = subjectConcepts[0];
    if (next && next.subject !== concept.subject) setConceptId(next.id);
  }, [concept.subject, subjectConcepts]);

  useEffect(() => {
    recordProgress({});
  }, [recordProgress]);

  useEffect(() => {
    if (restoringConceptRef.current) {
      restoringConceptRef.current = false;
      setSelected(concept.visualObjects[0] ?? null);
      setAnswer("");
      setAnswerModel("");
      return;
    }
    setValues(getDefaultVariables(concept));
    setEquations(concept.defaultEquations ?? equations);
    setSurfaceExpression(concept.defaultSurface ?? surfaceExpression);
    setSelected(concept.visualObjects[0] ?? null);
    setAnswer("");
    setAnswerModel("");
    setScrubProgress(null);
    setExamReveal(false);
    setCompletedMissionSteps([]);
    setPracticeIndex(0);
    setPracticeChoice(null);
    setResetKey((key) => key + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept.id]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const recent = localStorage.getItem("neet_visual_lab_recent");
      const savedSnapshots = localStorage.getItem("neet_visual_lab_snapshots");
      const savedNotebook = localStorage.getItem("neet_visual_lab_notebook");
      const savedProgress = localStorage.getItem("neet_visual_lab_progress");
      if (recent) {
        const parsed = JSON.parse(recent) as Partial<LabSnapshot>;
        const savedConcept = typeof parsed.conceptId === "string" ? getConceptById(parsed.conceptId) : null;
        if (savedConcept) {
          restoringConceptRef.current = true;
          setSubject(savedConcept.subject);
          setConceptId(savedConcept.id);
          if (parsed.values && typeof parsed.values === "object") setValues({ ...getDefaultVariables(savedConcept), ...parsed.values });
          if (Array.isArray(parsed.equations)) setEquations(parsed.equations.filter((item): item is string => typeof item === "string").slice(0, 2));
          if (typeof parsed.surfaceExpression === "string") setSurfaceExpression(parsed.surfaceExpression);
          if (parsed.sceneMode === "learn" || parsed.sceneMode === "experiment" || parsed.sceneMode === "exam" || parsed.sceneMode === "compare") {
            setSceneMode(parsed.sceneMode);
          }
        }
      }
      if (savedSnapshots) {
        const parsedSnapshots = JSON.parse(savedSnapshots) as LabSnapshot[];
        if (Array.isArray(parsedSnapshots)) {
          setSnapshots(parsedSnapshots.filter((item) => item?.id && item?.conceptId).slice(0, 3));
        }
      }
      if (savedNotebook) {
        const parsedNotebook = JSON.parse(savedNotebook) as NotebookEntry[];
        if (Array.isArray(parsedNotebook)) setNotebookEntries(parsedNotebook.filter((item) => item?.id && item?.conceptId).slice(0, 40));
      }
      if (savedProgress) {
        const parsedProgress = JSON.parse(savedProgress) as LabProgress;
        if (parsedProgress && typeof parsedProgress === "object") setProgressByConcept(parsedProgress);
      }
    } catch {
      // Ignore stale browser state and keep the deterministic defaults.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "neet_visual_lab_recent",
        JSON.stringify({ conceptId, subject, values, equations, surfaceExpression, sceneMode })
      );
      localStorage.setItem("neet_visual_lab_snapshots", JSON.stringify(snapshots));
      localStorage.setItem("neet_visual_lab_notebook", JSON.stringify(notebookEntries.slice(0, 40)));
      localStorage.setItem("neet_visual_lab_progress", JSON.stringify(progressByConcept));
    } catch {
      // Non-critical local persistence.
    }
  }, [conceptId, equations, notebookEntries, progressByConcept, sceneMode, snapshots, subject, surfaceExpression, values]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (concept.renderer === "math-2d") {
      equations.forEach((eq, index) => {
        try {
          compileExpression(eq);
        } catch (error) {
          errors.push(`Equation ${index + 1}: ${error instanceof Error ? error.message : "Invalid expression"}`);
        }
      });
    }
    if (concept.renderer === "math-3d") {
      try {
        compileExpression(surfaceExpression);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Invalid surface expression");
      }
    }
    return errors;
  }, [concept.renderer, equations, surfaceExpression]);

  const updateVariable = (key: string, value: number) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const askTutor = useCallback(
    async (askMode: TutorRequestPayload["mode"], explicitQuestion?: string) => {
      const finalQuestion = explicitQuestion?.trim() || question.trim() || buildTutorQuestion(askMode, selected);
      setDeepDrawerOpen(true);
      setAsking(true);
      setAnswer("");
      setAnswerModel("");
      const payload: TutorRequestPayload = {
        concept: {
          id: concept.id,
          title: concept.title,
          subject: concept.subject,
          chapter: concept.chapter,
          difficulty: concept.difficulty,
          description: concept.description,
          formulas: concept.formulas,
          verifiedFacts: concept.verifiedFacts,
          neetTakeaways: concept.neetTakeaways,
          commonMistakes: concept.commonMistakes,
        },
        currentStep: timelineBeat ?? concept.steps[0] ?? null,
        selectedObject: selected,
        variables: values,
        equations,
        surfaceExpression,
        sceneMode,
        currentBeat: timelineBeat,
        activeSnapshot: activeSnapshot ? {
          label: activeSnapshot.label,
          conceptId: activeSnapshot.conceptId,
          values: activeSnapshot.values,
          equations: activeSnapshot.equations,
          surfaceExpression: activeSnapshot.surfaceExpression,
        } : null,
        snapshotDiff,
        validationErrors: validation,
        missionStatus: {
          activeStep: activeMissionStep?.label ?? "Complete",
          completedSteps: completedMissionSteps,
          mastery: computeMastery(conceptProgress),
        },
        practiceContext,
        notebookContext: {
          noteCount: conceptNotes.length,
          latestNote: conceptNotes[0]?.note,
        },
        studentLevel: askMode === "deep" ? "Deep" : "NEET",
        mode: askMode,
        question: finalQuestion,
      };
      try {
        const res = await fetch("/api/visual-lab/explain?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok || !res.body) throw new Error("Stream unavailable");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as { chunk?: string; done?: boolean; model?: string; error?: string };
              if (ev.error) throw new Error(ev.error);
              if (ev.chunk) setAnswer((prev) => prev + ev.chunk);
              if (ev.done && ev.model) setAnswerModel(ev.model);
            } catch {
              // skip malformed SSE line
            }
          }
        }
      } catch {
        // Fallback to non-streaming
        try {
          const res2 = await fetch("/api/visual-lab/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res2.json() as { answer?: string; model?: string; error?: string };
          if (!res2.ok) throw new Error(data.error ?? "Tutor error");
          setAnswer(data.answer ?? "");
          setAnswerModel(data.model ?? "");
        } catch (err2) {
          setAnswer(err2 instanceof Error ? err2.message : "Unable to get explanation.");
        }
      } finally {
        setAsking(false);
      }
    },
    [
      activeMissionStep?.label,
      activeSnapshot,
      completedMissionSteps,
      concept,
      conceptNotes,
      conceptProgress,
      equations,
      practiceContext,
      question,
      sceneMode,
      selected,
      snapshotDiff,
      surfaceExpression,
      timelineBeat,
      validation,
      values,
    ]
  );

  const selectSubject = (nextSubject: VisualSubject) => {
    setSubject(nextSubject);
    const first = getConceptsBySubject(nextSubject)[0];
    if (first) setConceptId(first.id);
  };

  const captureSnapshot = () => {
    const next: LabSnapshot = {
      id: `${concept.id}-${Date.now()}`,
      label: `${concept.title} ${snapshots.length >= 3 ? snapshots.length : snapshots.length + 1}`,
      conceptId: concept.id,
      subject: concept.subject,
      values,
      equations,
      surfaceExpression,
      sceneMode,
      createdAt: Date.now(),
    };
    setSnapshots((current) => [next, ...current].slice(0, 3));
    setActiveSnapshotId(next.id);
    recordProgress({ snapshotsSaved: (conceptProgress?.snapshotsSaved ?? 0) + 1 });
  };

  const restoreSnapshot = (snapshot: LabSnapshot) => {
    const savedConcept = getConceptById(snapshot.conceptId);
    restoringConceptRef.current = snapshot.conceptId !== concept.id;
    setSubject(snapshot.subject);
    setConceptId(snapshot.conceptId);
    setValues({ ...getDefaultVariables(savedConcept), ...snapshot.values });
    setEquations(snapshot.equations);
    setSurfaceExpression(snapshot.surfaceExpression);
    setSceneMode(snapshot.sceneMode);
    setActiveSnapshotId(snapshot.id);
    setScrubProgress(null);
    setResetKey((key) => key + 1);
  };

  const completeMissionStep = (stepId: string) => {
    setCompletedMissionSteps((current) => {
      if (current.includes(stepId)) return current;
      const next = [...current, stepId];
      if (next.length >= missionSteps.length) {
        recordProgress({ missionsCompleted: (conceptProgress?.missionsCompleted ?? 0) + 1 });
      }
      return next;
    });
  };

  const answerPractice = (choiceIndex: number) => {
    if (!currentPractice || practiceChoice !== null) return;
    const isCorrect = choiceIndex === currentPractice.answerIndex;
    setPracticeChoice(choiceIndex);
    setPracticeContext((current) => ({
      attempts: current.attempts + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
      lastQuestion: currentPractice.prompt,
      lastCorrect: isCorrect,
    }));
    recordProgress({
      practiceAttempts: (conceptProgress?.practiceAttempts ?? 0) + 1,
      practiceCorrect: (conceptProgress?.practiceCorrect ?? 0) + (isCorrect ? 1 : 0),
    });
    if (isCorrect) completeMissionStep("exam");
  };

  const nextPracticeQuestion = () => {
    setPracticeChoice(null);
    setPracticeIndex((index) => (index + 1) % Math.max(practiceQuestions.length, 1));
  };

  const saveNotebookEntry = () => {
    const note = noteDraft.trim();
    if (!note) return;
    const next: NotebookEntry = {
      id: `${concept.id}-note-${Date.now()}`,
      conceptId: concept.id,
      subject: concept.subject,
      title: concept.title,
      note,
      selectedLabel: selected?.label ?? concept.title,
      sceneMode,
      values,
      createdAt: Date.now(),
      pinned: false,
    };
    setNotebookEntries((current) => [next, ...current].slice(0, 40));
    setNoteDraft("");
    completeMissionStep("notebook");
    recordProgress({ notes: (conceptProgress?.notes ?? 0) + 1 });
  };

  return (
    <main className="vl-shell">
      <section className="vl-stage">
        <header className="vl-header">
          <div className="vl-title-block">
            <p className="vl-eyebrow">NEET Visual Lab</p>
            <h1>{concept.title}</h1>
          </div>
          <div className="vl-top-controls">
            <div className="vl-mode" role="tablist" aria-label="Visual Lab mode">
              <button className={mode === "guided" ? "active" : ""} onClick={() => setMode("guided")}>
                Guided
              </button>
              <button className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>
                Custom
              </button>
            </div>
            <div className="vl-top-subjects" aria-label="Subject switcher">
              {SUBJECTS.map((item) => (
                <button
                  key={item.id}
                  className={subject === item.id ? "active" : ""}
                  style={{ "--accent": item.accent } as React.CSSProperties}
                  onClick={() => selectSubject(item.id)}
                  title={SUBJECT_LABELS[item.id]}
                >
                  <item.icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </header>

        <button className="vl-dock-toggle vl-dock-toggle-left" onClick={() => setControlDockOpen((open) => !open)} title="Toggle controls">
          {controlDockOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <button className="vl-dock-toggle vl-dock-toggle-right" onClick={() => setDeepDrawerOpen((open) => !open)} title="Toggle Deep Dive">
          {deepDrawerOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>

        <div className={`vl-panel vl-controls ${controlDockOpen ? "open" : "collapsed"}`}>
          <div className="vl-dock-heading">
            <SlidersHorizontal size={16} />
            <span>Control Dock</span>
            <em>{filteredSubjectConcepts.length || subjectConcepts.length}/{subjectConcepts.length} topics</em>
          </div>

          <label className="vl-label">
            Subject
            <select className="vl-select" value={subject} onChange={(event) => selectSubject(event.target.value as VisualSubject)}>
              {SUBJECTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {SUBJECT_LABELS[item.id]}
                </option>
              ))}
            </select>
          </label>

          <div className="vl-topic-tools">
            <label className="vl-label">
              Search
              <input className="vl-input" value={topicSearch} onChange={(event) => setTopicSearch(event.target.value)} placeholder="Find topic or chapter..." />
            </label>
            <label className="vl-label">
              Level
              <select className="vl-select" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as VisualConcept["difficulty"] | "All")}>
                <option value="All">All</option>
                <option value="Foundation">Foundation</option>
                <option value="NEET Core">NEET Core</option>
                <option value="Advanced NEET">Advanced NEET</option>
              </select>
            </label>
          </div>

          <label className="vl-label">
            Chapter
            <select
              className="vl-select"
              value={concept.chapter}
              onChange={(event) => {
                const next = filteredSubjectConcepts.find((item) => item.chapter === event.target.value) ?? subjectConcepts.find((item) => item.chapter === event.target.value);
                if (next) setConceptId(next.id);
              }}
            >
              {(chapterOptions.length ? chapterOptions : Array.from(new Set(subjectConcepts.map((item) => item.chapter)))).map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </label>

          <label className="vl-label">
            Concept
            <select className="vl-select" value={conceptId} onChange={(event) => setConceptId(event.target.value)}>
              {conceptOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
              ))}
            </select>
          </label>

          <div className="vl-topic-grid" aria-label="Filtered topic shortcuts">
            {(filteredSubjectConcepts.length ? filteredSubjectConcepts : subjectConcepts).slice(0, 8).map((item) => (
              <button key={item.id} className={item.id === conceptId ? "active" : ""} onClick={() => setConceptId(item.id)}>
                <span>{item.chapter}</span>
                {item.title}
              </button>
            ))}
          </div>

          {concept.presets && concept.presets.length > 0 && (
            <div className="vl-presets">
              <div className="vl-section-label">Exam presets</div>
              {concept.presets.map((preset) => (
                <button key={preset.id} onClick={() => applyPreset(preset)} title={preset.description}>
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
          )}

          <div className="vl-template-status">
            <span className={concept.readiness === "template-ready" ? "template" : concept.readiness === "preview" ? "preview" : ""}>
              {concept.readiness === "template-ready" ? "Template-ready" : concept.readiness === "preview" ? "Preview only" : "Working visual"}
            </span>
            <small>{concept.aiContext.sourceOfTruth}</small>
          </div>

          <div className="vl-v3-panel">
            <div className="vl-section-label">V3 studio mode</div>
            <div className="vl-scene-modes" role="tablist" aria-label="Scene mode">
              {(["learn", "experiment", "exam", "compare"] as VisualSceneMode[]).map((item) => (
                <button
                  key={item}
                  className={sceneMode === item ? "active" : ""}
                  onClick={() => {
                    setSceneMode(item);
                    setExamReveal(false);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="vl-quality-gates">
              {qualityGates.map((gate) => (
                <span key={gate.label} className={gate.ok ? "ok" : ""}>{gate.label}</span>
              ))}
            </div>
            <div className="vl-progress-pulse">
              <span>Mastery <strong>{computeMastery(conceptProgress)}%</strong></span>
              <span>{SUBJECT_LABELS[subject]} explored <strong>{subjectProgress.explored}</strong></span>
              <span>Practice <strong>{subjectProgress.correct}/{subjectProgress.attempts || 0}</strong></span>
            </div>
          </div>

          <div className="vl-mission-panel">
            <div className="vl-section-label">Concept mission</div>
            <div className="vl-mission-steps">
              {missionSteps.map((step, index) => {
                const done = completedMissionSteps.includes(step.id);
                const active = activeMissionStep?.id === step.id;
                return (
                  <button
                    key={step.id}
                    className={`${done ? "done" : ""} ${active ? "active" : ""}`}
                    onClick={() => completeMissionStep(step.id)}
                    title={step.detail}
                  >
                    <span>{done ? "OK" : index + 1}</span>
                    <strong>{step.label}</strong>
                    <em>{step.detail}</em>
                  </button>
                );
              })}
            </div>
          </div>

          {currentPractice && (
            <div className="vl-practice-panel">
              <div className="vl-section-label">Visual MCQ trainer</div>
              <p>{currentPractice.prompt}</p>
              <div className="vl-practice-choices">
                {currentPractice.choices.map((choice, index) => {
                  const answered = practiceChoice !== null;
                  const correct = index === currentPractice.answerIndex;
                  const picked = practiceChoice === index;
                  return (
                    <button
                      key={`${currentPractice.id}-${choice}`}
                      className={`${answered && correct ? "correct" : ""} ${answered && picked && !correct ? "wrong" : ""}`}
                      onClick={() => answerPractice(index)}
                      disabled={answered}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
              {practiceChoice !== null && (
                <div className="vl-practice-result">
                  <strong>{practiceChoice === currentPractice.answerIndex ? "Correct" : "Review"}</strong>
                  <span>{currentPractice.explanation}</span>
                  <button onClick={nextPracticeQuestion}>Next check</button>
                </div>
              )}
            </div>
          )}

          <div className="vl-snapshot-deck">
            <div className="vl-section-label">Snapshot deck</div>
            <button className="vl-snapshot-save" onClick={captureSnapshot}>
              <Beaker size={14} />
              Save current state
            </button>
            {snapshots.length > 0 ? (
              <div className="vl-snapshot-list">
                {snapshots.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    className={snapshot.id === activeSnapshotId ? "active" : ""}
                    onClick={() => restoreSnapshot(snapshot)}
                    title="Restore this lab state"
                  >
                    <strong>{getConceptById(snapshot.conceptId).title}</strong>
                    <span>{snapshot.sceneMode} / {formatSnapshotTime(snapshot.createdAt)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="vl-snapshot-empty">Save a state before changing sliders to build a quick comparison trail.</p>
            )}
            {activeSnapshot && (
              <div className="vl-snapshot-diff">
                <strong>Compared with selected</strong>
                {snapshotDiff.length > 0 ? snapshotDiff.map((item) => <span key={item}>{item}</span>) : <span>No drift from this saved state.</span>}
              </div>
            )}
          </div>

          {concept.reactionTemplate && (
            <details className="vl-reaction-template">
              <summary>
                <FlaskConical size={14} />
                Verified template
              </summary>
              <p>{concept.reactionTemplate.balancedEquation}</p>
              {concept.reactionTemplate.ionicEquation && <p>{concept.reactionTemplate.ionicEquation}</p>}
            </details>
          )}

          {(mode === "custom" || concept.renderer === "math-2d") && concept.renderer === "math-2d" && (
            <div className="vl-equations">
              <label className="vl-label">
                Equation 1
                <input className="vl-input" value={equations[0] ?? ""} onChange={(event) => setEquations([event.target.value, equations[1] ?? ""])} />
              </label>
              <label className="vl-label">
                Equation 2
                <input className="vl-input" value={equations[1] ?? ""} onChange={(event) => setEquations([equations[0] ?? "", event.target.value])} />
              </label>
            </div>
          )}

          {(mode === "custom" || concept.renderer === "math-3d") && concept.renderer === "math-3d" && (
            <label className="vl-label">
              z = f(x, y)
              <input className="vl-input" value={surfaceExpression} onChange={(event) => setSurfaceExpression(event.target.value)} />
            </label>
          )}

          <div className="vl-slider-list">
            {concept.variables.map((item) => (
              <label key={item.key} className="vl-slider">
                <span>
                  {item.label}
                  <strong>
                    {formatVariableValue(concept, item.key, values[item.key] ?? item.defaultValue, item.defaultValue, item.step, item.unit)}
                  </strong>
                </span>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={values[item.key] ?? item.defaultValue}
                  onChange={(event) => updateVariable(item.key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>

          {validation.length > 0 && (
            <div className="vl-errors">
              {validation.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
        </div>

        <section className="vl-visual">
          <div className="vl-canvas-frame">
            <VisualCanvas
              concept={concept}
              values={values}
              equations={equations.filter(Boolean)}
              surfaceExpression={surfaceExpression}
              playing={playing && validation.length === 0}
              resetKey={resetKey}
              sceneMode={sceneMode}
              scrubProgress={scrubProgress}
              onSelect={(object) => {
                setSelected(object);
                setDeepDrawerOpen(true);
              }}
            />

            <div className="vl-floating-label">
              <span>{SUBJECT_LABELS[concept.subject]}</span>
              <strong>{concept.chapter}</strong>
              <em>{concept.difficulty}</em>
            </div>

            <div className="vl-variable-orbit">
              {concept.variables.slice(0, 4).map((item) => (
                <span key={item.key}>
                  {item.label}: <strong>{formatVariableValue(concept, item.key, values[item.key] ?? item.defaultValue, item.defaultValue, item.step, item.unit)}</strong>
                </span>
              ))}
            </div>

            <div className="vl-intel-strip">
              <div className="vl-intel-card">
                <span>Scene</span>
                <strong>{sceneMode}</strong>
                <em>{concept.renderer}</em>
              </div>
              <div className="vl-intel-card">
                <span>{scrubProgress === null ? "Timeline" : "Beat"}</span>
                <strong>{scrubProgress === null ? "Live loop" : timelineBeat?.label ?? "Start"}</strong>
                <em>{concept.cinematic?.examFocus ?? concept.neetTakeaways[0]}</em>
              </div>
              <div className="vl-intel-card">
                <span>Selected</span>
                <strong>{selected?.label ?? "Canvas"}</strong>
                <em>{selected?.kind ?? "concept"}</em>
              </div>
              {liveMetrics.length > 0 && (
                <div className="vl-intel-card vl-intel-metrics">
                  <span>Live values</span>
                  {liveMetrics.map((metric) => (
                    <em key={metric.key}>{metric.label}: {metric.value}</em>
                  ))}
                </div>
              )}
            </div>

            {sceneMode === "compare" && (
              <div className="vl-compare-ribbon">
                <strong>{activeSnapshot ? `Comparing with ${activeSnapshot.label}` : "Save a snapshot, then change variables"}</strong>
                <span>{snapshotDiff.length ? snapshotDiff.join(" / ") : "No visible variable drift yet."}</span>
              </div>
            )}

            <button
              className="vl-deep-peek"
              onClick={() => {
                setDeepDrawerOpen(true);
                void askTutor("why");
              }}
            >
              <Brain size={15} />
              Why?
            </button>
          </div>

          <div className="vl-transport">
            <button onClick={() => setPlaying((value) => !value)} title={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={() => {
              setScrubProgress(null);
              setResetKey((key) => key + 1);
            }} title="Restart">
              <RotateCcw size={18} />
            </button>
            <label className="vl-scrubber">
              <span>timeline</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={scrubProgress ?? 0}
                onChange={(event) => {
                  setPlaying(false);
                  setScrubProgress(Number(event.target.value));
                }}
                onDoubleClick={() => setScrubProgress(null)}
              />
            </label>
            <div className="vl-stepper">
              {cinematicBeats.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setSelected(getObject(concept, concept.visualObjects[index]?.id ?? concept.visualObjects[0]?.id ?? step.id));
                    setDeepDrawerOpen(true);
                  }}
                >
                  <span>{index + 1}</span>
                  {step.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className={`vl-panel vl-explain ${deepDrawerOpen ? "open" : ""}`} aria-hidden={!deepDrawerOpen}>
          <button className="vl-drawer-close" onClick={() => setDeepDrawerOpen(false)} title="Close Deep Dive">
            <PanelRightClose size={16} />
          </button>
          <div className="vl-explain-top">
            <p className="vl-eyebrow">Deep Dive</p>
            <h2>{selected?.label ?? concept.title}</h2>
            <p>{selected?.description ?? concept.description}</p>
          </div>

          <div className="vl-mini">
            <strong>Formula</strong>
            <span>{selected?.formulaConnection ?? concept.formulas[0]}</span>
          </div>
          <div className="vl-mini">
            <strong>NEET Takeaway</strong>
            <span>{selected?.neetTakeaway ?? concept.neetTakeaways[0]}</span>
          </div>
          <div className="vl-mini">
            <strong>Common mistake</strong>
            <span>{selected?.commonMistake ?? concept.commonMistakes[0]}</span>
          </div>

          {concept.examChecks && concept.examChecks.length > 0 && (
            <div className="vl-exam-check">
              <strong>Exam check</strong>
              <p>{concept.examChecks[0].prompt}</p>
              <button onClick={() => setExamReveal((value) => !value)}>
                {examReveal ? "Hide answer" : "Reveal answer"}
              </button>
              {examReveal && (
                <span>
                  {concept.examChecks[0].answer} - {concept.examChecks[0].explanation}
                </span>
              )}
            </div>
          )}

          <div className="vl-notebook">
            <strong>Visual notebook</strong>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Save the one line you must remember..."
            />
            <button onClick={saveNotebookEntry} disabled={!noteDraft.trim()}>
              Save note
            </button>
            {conceptNotes.length > 0 && (
              <div className="vl-note-list">
                {conceptNotes.map((entry) => (
                  <span key={entry.id}>
                    {entry.note}
                    <em>{formatSnapshotTime(entry.createdAt)} / {entry.selectedLabel}</em>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="vl-ai-actions">
            <button onClick={() => askTutor("why")} disabled={asking}>
              Why?
            </button>
            <button onClick={() => askTutor("how")} disabled={asking}>
              How?
            </button>
            <button onClick={() => askTutor("deep")} disabled={asking}>
              Deep Dive
            </button>
            <button onClick={() => askTutor("practice")} disabled={asking}>
              Practice
            </button>
          </div>

          <form
            className="vl-question"
            onSubmit={(event) => {
              event.preventDefault();
              void askTutor("deep", question);
            }}
          >
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask why or how..." />
            <button disabled={asking || !question.trim()} title="Ask tutor">
              {asking ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
            </button>
          </form>

          {(asking || answer) && (
            <div className="vl-answer">
              {asking ? <p>Asking Gemma with verified context...</p> : <p>{answer}</p>}
              {answerModel && <span>Model: {answerModel}</span>}
            </div>
          )}

          <div className="vl-facts">
            <div className="vl-facts-label">Verified Facts</div>
            {concept.verifiedFacts.slice(0, 3).map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </div>
        </aside>
      </section>

      <style jsx>{`
        @keyframes vl-enter {
          from { opacity: 0; transform: scale(0.975) translateY(18px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes vl-glow-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.85; }
        }
        @keyframes vl-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .vl-shell {
          min-height: 100vh;
          padding: 14px;
          background:
            radial-gradient(circle at 48% -12%, rgba(77,214,255,0.18), transparent 32%),
            radial-gradient(circle at 12% 78%, rgba(182,128,217,0.12), transparent 26%),
            radial-gradient(circle at 88% 76%, rgba(255,207,112,0.10), transparent 28%),
            #010104;
          overflow: hidden;
          animation: vl-enter 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }

        .vl-stage {
          position: relative;
          min-height: calc(100vh - 28px);
          border-radius: 30px;
          overflow: hidden;
          background: rgba(0,0,0,0.18);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .vl-header {
          position: absolute;
          top: 16px;
          left: 18px;
          right: 18px;
          z-index: 20;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          pointer-events: none;
        }

        .vl-title-block,
        .vl-top-controls {
          pointer-events: auto;
        }

        .vl-eyebrow {
          margin: 0 0 5px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,207,112,0.76);
        }

        h1 {
          margin: 0;
          max-width: min(56vw, 760px);
          font-family: var(--font-display);
          font-size: clamp(25px, 3.8vw, 52px);
          letter-spacing: 0;
          color: rgba(250,247,240,0.96);
          text-shadow: 0 18px 48px rgba(0,0,0,0.56);
        }

        button,
        .vl-select,
        .vl-input,
        .vl-question input {
          font-family: var(--font-sans);
        }

        .vl-top-controls,
        .vl-mode,
        .vl-top-subjects,
        .vl-ai-actions,
        .vl-transport {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vl-mode,
        .vl-top-subjects,
        .vl-panel,
        .vl-transport,
        .vl-floating-label,
        .vl-variable-orbit,
        .vl-deep-peek,
        .vl-dock-toggle {
          border: 1px solid rgba(255,255,255,0.09);
          background: linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.026));
          backdrop-filter: blur(24px) saturate(150%);
          box-shadow: 0 24px 80px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .vl-mode,
        .vl-top-subjects {
          padding: 4px;
          border-radius: 999px;
        }

        .vl-mode button,
        .vl-top-subjects button,
        .vl-ai-actions button,
        .vl-transport button,
        .vl-stepper button,
        .vl-deep-peek,
        .vl-dock-toggle,
        .vl-drawer-close {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.05);
          color: rgba(246,240,230,0.72);
          border-radius: 999px;
          cursor: pointer;
          transition: var(--t-fast);
        }

        .vl-mode button {
          padding: 8px 14px;
          border-color: transparent;
        }

        .vl-top-subjects button {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
        }

        .vl-mode button.active,
        .vl-top-subjects button.active,
        .vl-ai-actions button:hover,
        .vl-transport button:hover,
        .vl-stepper button:hover,
        .vl-deep-peek:hover,
        .vl-dock-toggle:hover {
          background: color-mix(in srgb, var(--accent, #4dd6ff), transparent 84%);
          color: #fff;
          border-color: color-mix(in srgb, var(--accent, #4dd6ff), transparent 62%);
        }

        .vl-visual {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
        }

        .vl-canvas-frame {
          position: relative;
          min-height: 100%;
          background: #020308;
        }

        /* Cinematic neon glow ring behind canvas */
        .vl-canvas-frame::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 62%;
          height: 62%;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(77,214,255,0.07) 0%, transparent 68%);
          pointer-events: none;
          z-index: 1;
          animation: vl-glow-pulse 4s ease-in-out infinite;
        }

        :global(.vl-canvas) {
          width: 100%;
          height: 100%;
          display: block;
          touch-action: none;
          cursor: crosshair;
        }

        .vl-canvas-frame::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(0,0,0,0.58), transparent 22%, transparent 78%, rgba(0,0,0,0.58)),
            linear-gradient(180deg, rgba(0,0,0,0.46), transparent 22%, transparent 76%, rgba(0,0,0,0.62));
        }

        .vl-controls {
          position: absolute;
          z-index: 25;
          left: 18px;
          top: 126px;
          bottom: 96px;
          width: min(330px, calc(100vw - 36px));
          padding: 14px;
          border-radius: 22px;
          overflow-y: auto;
          transition: transform 0.32s var(--ease-in-out), opacity 0.2s ease;
        }

        .vl-controls.collapsed {
          transform: translateX(calc(-100% - 28px));
          opacity: 0;
          pointer-events: none;
        }

        .vl-explain {
          position: absolute;
          z-index: 28;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(440px, 92vw);
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-radius: 0;
          border-right: none;
          border-top: none;
          border-bottom: none;
          overflow-y: auto;
          transform: translateX(104%);
          transition: transform 0.38s cubic-bezier(0.22,1,0.36,1);
          scrollbar-width: none;
        }
        .vl-explain::-webkit-scrollbar { display: none; }

        .vl-explain.open {
          transform: translateX(0);
        }

        .vl-dock-toggle {
          position: absolute;
          z-index: 31;
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
        }

        .vl-dock-toggle-left {
          left: 18px;
          top: 74px;
        }

        .vl-dock-toggle-right {
          right: 18px;
          top: 74px;
        }

        .vl-drawer-close {
          align-self: flex-end;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
        }

        .vl-dock-heading {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          color: rgba(250,247,240,0.88);
          font-size: 13px;
          font-weight: 800;
        }

        .vl-dock-heading em {
          margin-left: auto;
          color: rgba(246,240,230,0.42);
          font-size: 10px;
          font-style: normal;
          font-weight: 700;
        }

        .vl-label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-bottom: 12px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(246,240,230,0.45);
        }

        .vl-select,
        .vl-input,
        .vl-question input {
          width: 100%;
          min-height: 38px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(0,0,0,0.30);
          color: rgba(250,247,240,0.92);
          outline: none;
        }

        .vl-template-status,
        .vl-reaction-template,
        .vl-presets,
        .vl-v3-panel,
        .vl-mission-panel,
        .vl-practice-panel,
        .vl-snapshot-deck,
        .vl-exam-check,
        .vl-notebook {
          margin-bottom: 12px;
          padding: 10px;
          border-radius: 14px;
          background: rgba(0,0,0,0.22);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .vl-topic-tools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 118px;
          gap: 8px;
        }

        .vl-topic-grid {
          display: grid;
          gap: 7px;
          margin: 0 0 12px;
          max-height: 164px;
          overflow-y: auto;
          padding-right: 2px;
        }

        .vl-topic-grid button,
        .vl-presets button {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: rgba(246,240,230,0.72);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: var(--t-fast);
        }

        .vl-topic-grid button {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 8px 10px;
          font-size: 12px;
          line-height: 1.25;
        }

        .vl-topic-grid button span,
        .vl-presets button span {
          color: rgba(246,240,230,0.42);
          font-size: 10px;
          line-height: 1.35;
        }

        .vl-topic-grid button.active,
        .vl-topic-grid button:hover,
        .vl-presets button:hover {
          background: rgba(77,214,255,0.09);
          border-color: rgba(77,214,255,0.26);
          color: #fff;
        }

        .vl-section-label {
          margin-bottom: 8px;
          color: rgba(255,207,112,0.68);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .vl-presets {
          display: grid;
          gap: 7px;
        }

        .vl-presets button {
          display: grid;
          gap: 2px;
          padding: 9px 10px;
        }

        .vl-presets button strong {
          color: rgba(250,247,240,0.9);
          font-size: 12px;
        }

        .vl-scene-modes {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 9px;
        }

        .vl-scene-modes button,
        .vl-exam-check button {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: rgba(246,240,230,0.70);
          border-radius: 10px;
          cursor: pointer;
          padding: 7px 6px;
          font-size: 10.5px;
          text-transform: capitalize;
          transition: var(--t-fast);
        }

        .vl-scene-modes button.active,
        .vl-scene-modes button:hover,
        .vl-exam-check button:hover {
          background: rgba(185,255,106,0.09);
          border-color: rgba(185,255,106,0.24);
          color: #fff;
        }

        .vl-quality-gates {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .vl-quality-gates span {
          padding: 5px 7px;
          border-radius: 999px;
          background: rgba(255,255,255,0.045);
          color: rgba(246,240,230,0.42);
          font-size: 10px;
        }

        .vl-quality-gates span.ok {
          background: rgba(102,240,163,0.10);
          color: rgba(185,255,106,0.82);
        }

        .vl-progress-pulse {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-top: 9px;
        }

        .vl-progress-pulse span {
          display: grid;
          gap: 2px;
          min-width: 0;
          padding: 7px;
          border-radius: 10px;
          background: rgba(255,255,255,0.035);
          color: rgba(246,240,230,0.45);
          font-size: 9.5px;
          line-height: 1.25;
        }

        .vl-progress-pulse strong {
          color: rgba(250,247,240,0.9);
          font-size: 12px;
        }

        .vl-mission-panel,
        .vl-practice-panel {
          display: grid;
          gap: 8px;
        }

        .vl-mission-steps {
          display: grid;
          gap: 6px;
        }

        .vl-mission-steps button {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr);
          gap: 2px 8px;
          width: 100%;
          padding: 8px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.035);
          color: rgba(246,240,230,0.72);
          text-align: left;
          cursor: pointer;
          transition: var(--t-fast);
        }

        .vl-mission-steps button.active,
        .vl-mission-steps button:hover {
          border-color: rgba(255,207,112,0.28);
          background: rgba(255,207,112,0.08);
          color: #fff;
        }

        .vl-mission-steps button.done {
          border-color: rgba(102,240,163,0.22);
          background: rgba(102,240,163,0.08);
        }

        .vl-mission-steps button span {
          grid-row: span 2;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(77,214,255,0.12);
          color: rgba(250,247,240,0.9);
          font-size: 10px;
          font-weight: 900;
        }

        .vl-mission-steps strong {
          overflow: hidden;
          font-size: 12px;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vl-mission-steps em {
          overflow: hidden;
          color: rgba(246,240,230,0.45);
          font-size: 10.5px;
          font-style: normal;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vl-practice-panel p {
          margin: 0;
          color: rgba(250,247,240,0.78);
          font-size: 12px;
          font-weight: 700;
          line-height: 1.4;
        }

        .vl-practice-choices {
          display: grid;
          gap: 6px;
        }

        .vl-practice-choices button {
          width: 100%;
          padding: 8px 9px;
          border-radius: 11px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.035);
          color: rgba(246,240,230,0.72);
          cursor: pointer;
          text-align: left;
          font-size: 11px;
          line-height: 1.35;
        }

        .vl-practice-choices button.correct {
          border-color: rgba(102,240,163,0.30);
          background: rgba(102,240,163,0.10);
          color: #d8ffe7;
        }

        .vl-practice-choices button.wrong {
          border-color: rgba(255,121,121,0.35);
          background: rgba(255,121,121,0.10);
          color: #ffd7d7;
        }

        .vl-practice-result {
          display: grid;
          gap: 6px;
          padding: 8px;
          border-radius: 12px;
          background: rgba(77,214,255,0.055);
          border: 1px solid rgba(77,214,255,0.12);
        }

        .vl-practice-result strong {
          color: rgba(185,255,106,0.84);
          font-size: 11px;
        }

        .vl-practice-result span {
          color: rgba(246,240,230,0.58);
          font-size: 11px;
          line-height: 1.4;
        }

        .vl-practice-result button {
          justify-self: start;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(185,255,106,0.22);
          background: rgba(185,255,106,0.08);
          color: rgba(250,247,240,0.88);
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
        }

        .vl-snapshot-deck {
          display: grid;
          gap: 8px;
        }

        .vl-snapshot-save {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(77,214,255,0.18);
          background: rgba(77,214,255,0.075);
          color: rgba(250,247,240,0.88);
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          transition: var(--t-fast);
        }

        .vl-snapshot-save:hover {
          border-color: rgba(77,214,255,0.34);
          background: rgba(77,214,255,0.12);
          color: #fff;
        }

        .vl-snapshot-list {
          display: grid;
          gap: 6px;
        }

        .vl-snapshot-list button {
          display: grid;
          gap: 2px;
          width: 100%;
          padding: 9px 10px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.035);
          color: rgba(246,240,230,0.74);
          text-align: left;
          cursor: pointer;
          transition: var(--t-fast);
        }

        .vl-snapshot-list button.active,
        .vl-snapshot-list button:hover {
          border-color: rgba(185,255,106,0.25);
          background: rgba(185,255,106,0.08);
          color: #fff;
        }

        .vl-snapshot-list strong {
          overflow: hidden;
          color: rgba(250,247,240,0.9);
          font-size: 11.5px;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vl-snapshot-list span,
        .vl-snapshot-empty,
        .vl-snapshot-diff span {
          color: rgba(246,240,230,0.48);
          font-size: 10.5px;
          line-height: 1.4;
        }

        .vl-snapshot-empty {
          margin: 0;
        }

        .vl-snapshot-diff {
          display: grid;
          gap: 5px;
          padding: 8px;
          border-radius: 12px;
          background: rgba(0,0,0,0.20);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .vl-snapshot-diff strong {
          color: rgba(255,207,112,0.74);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .vl-template-status span {
          display: inline-flex;
          margin-bottom: 5px;
          color: #66f0a3;
          font-size: 11px;
          font-weight: 800;
        }

        .vl-template-status span.template {
          color: #ffcf70;
        }

        .vl-template-status span.preview {
          color: #ff9e9e;
        }

        .vl-template-status small,
        .vl-reaction-template p {
          display: block;
          color: rgba(246,240,230,0.48);
          font-size: 11px;
          line-height: 1.45;
        }

        .vl-reaction-template summary {
          display: flex;
          align-items: center;
          gap: 7px;
          color: rgba(250,247,240,0.78);
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
        }

        .vl-reaction-template p {
          margin-top: 8px;
        }

        .vl-slider-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .vl-slider {
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: rgba(246,240,230,0.58);
          font-size: 12px;
        }

        .vl-slider span {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }

        .vl-slider strong {
          color: rgba(255,255,255,0.86);
          font-variant-numeric: tabular-nums;
          font-size: 11px;
        }

        .vl-slider input {
          accent-color: #4dd6ff;
          width: 100%;
        }

        .vl-errors {
          margin-top: 12px;
          padding: 10px;
          border-radius: 12px;
          background: rgba(255,100,100,0.08);
          border: 1px solid rgba(255,100,100,0.2);
          color: #ffb4b4;
          font-size: 12px;
        }

        .vl-floating-label {
          position: absolute;
          z-index: 12;
          left: 50%;
          top: 95px;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 9px 12px;
          border-radius: 999px;
          color: rgba(250,247,240,0.82);
          pointer-events: none;
        }

        .vl-floating-label span,
        .vl-floating-label em {
          color: rgba(246,240,230,0.48);
          font-size: 11px;
          font-style: normal;
        }

        .vl-floating-label strong {
          color: #fff;
          font-size: 12px;
        }

        .vl-variable-orbit {
          position: absolute;
          z-index: 12;
          left: 50%;
          bottom: 96px;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          max-width: min(780px, calc(100vw - 56px));
          overflow-x: auto;
          padding: 8px;
          border-radius: 999px;
        }

        .vl-variable-orbit span {
          flex: 0 0 auto;
          padding: 6px 9px;
          border-radius: 999px;
          background: rgba(0,0,0,0.26);
          color: rgba(246,240,230,0.54);
          font-size: 11px;
        }

        .vl-variable-orbit strong {
          color: rgba(250,247,240,0.9);
        }

        .vl-intel-strip {
          position: absolute;
          z-index: 13;
          top: 134px;
          right: 22px;
          width: min(330px, calc(100vw - 380px));
          display: grid;
          gap: 8px;
          pointer-events: none;
        }

        .vl-intel-card {
          min-width: 0;
          padding: 10px 12px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          background: linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.026));
          backdrop-filter: blur(20px) saturate(145%);
          box-shadow: 0 18px 52px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.07);
        }

        .vl-intel-card span {
          display: block;
          margin-bottom: 3px;
          color: rgba(255,207,112,0.64);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.12em;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .vl-intel-card strong {
          display: block;
          overflow: hidden;
          color: rgba(255,255,255,0.92);
          font-size: 13px;
          line-height: 1.28;
          text-overflow: ellipsis;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .vl-intel-card em {
          display: block;
          overflow: hidden;
          color: rgba(246,240,230,0.50);
          font-size: 11px;
          font-style: normal;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vl-intel-metrics {
          display: grid;
          gap: 2px;
        }

        .vl-compare-ribbon {
          position: absolute;
          z-index: 13;
          left: 50%;
          bottom: 164px;
          transform: translateX(-50%);
          width: min(720px, calc(100vw - 380px));
          padding: 10px 14px;
          border-radius: 16px;
          border: 1px solid rgba(185,255,106,0.16);
          background: linear-gradient(145deg, rgba(185,255,106,0.10), rgba(77,214,255,0.045));
          backdrop-filter: blur(20px) saturate(145%);
          box-shadow: 0 18px 52px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.07);
          pointer-events: none;
          text-align: center;
        }

        .vl-compare-ribbon strong,
        .vl-compare-ribbon span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .vl-compare-ribbon strong {
          color: rgba(250,247,240,0.92);
          font-size: 12px;
        }

        .vl-compare-ribbon span {
          margin-top: 2px;
          color: rgba(246,240,230,0.54);
          font-size: 11px;
        }

        .vl-deep-peek {
          position: absolute;
          z-index: 14;
          right: 22px;
          bottom: 96px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 10px 13px;
        }

        .vl-transport {
          position: absolute;
          z-index: 20;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          width: min(920px, calc(100vw - 36px));
          min-height: 58px;
          padding: 9px;
          border-radius: 999px;
          overflow-x: auto;
        }

        .vl-transport > button {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }

        .vl-stepper {
          display: flex;
          gap: 8px;
          min-width: 0;
        }

        .vl-stepper button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px 8px 8px;
          white-space: nowrap;
          font-size: 12px;
        }

        .vl-stepper span {
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(77,214,255,0.12);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
        }

        .vl-explain-top h2 {
          margin: 0 0 7px;
          font-size: 22px;
          letter-spacing: 0;
          color: #fff;
        }

        .vl-explain-top p:last-child {
          margin: 0;
          color: rgba(246,240,230,0.62);
          font-size: 13px;
          line-height: 1.55;
        }

        .vl-mini {
          padding: 11px;
          border-radius: 14px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .vl-mini strong {
          display: block;
          margin-bottom: 4px;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,207,112,0.75);
        }

        .vl-mini span {
          color: rgba(246,240,230,0.72);
          font-size: 12.5px;
          line-height: 1.5;
        }

        .vl-ai-actions {
          flex-wrap: wrap;
        }
        .vl-ai-actions button {
          flex: 1 1 calc(50% - 4px);
          min-width: 0;
          padding: 9px 8px;
          font-size: 11.5px;
        }

        .vl-question {
          display: grid;
          grid-template-columns: 1fr 42px;
          gap: 8px;
        }

        .vl-question button {
          border-radius: 13px;
          border: 1px solid rgba(77,214,255,0.26);
          background: rgba(77,214,255,0.1);
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .vl-answer {
          max-height: 260px;
          overflow-y: auto;
          padding: 13px;
          border-radius: 16px;
          background: rgba(77,214,255,0.07);
          border: 1px solid rgba(77,214,255,0.14);
          color: rgba(250,247,240,0.82);
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .vl-answer span {
          display: block;
          margin-top: 10px;
          color: rgba(246,240,230,0.42);
          font-size: 11px;
        }

        .vl-facts {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .vl-facts-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,207,112,0.55);
          margin-bottom: 2px;
        }

        .vl-facts span {
          color: rgba(246,240,230,0.46);
          font-size: 11px;
          line-height: 1.5;
          padding: 5px 8px;
          border-radius: 8px;
          background: rgba(255,255,255,0.025);
        }

        .spin {
          animation: spin-slow 0.8s linear infinite;
        }

        @media (max-width: 980px) {
          .vl-header {
            flex-direction: column;
          }

          h1 {
            max-width: calc(100vw - 40px);
            font-size: clamp(24px, 7vw, 38px);
          }

          .vl-controls {
            top: 162px;
            bottom: 88px;
          }

          .vl-floating-label {
            top: 148px;
          }

          .vl-variable-orbit {
            display: none;
          }

          .vl-intel-strip {
            display: none;
          }

          .vl-compare-ribbon {
            left: 16px;
            right: 16px;
            bottom: 142px;
            transform: none;
            width: auto;
          }

          .vl-topic-tools {
            grid-template-columns: 1fr;
          }
        }

        .vl-exam-check {
          display: grid;
          gap: 8px;
        }

        .vl-exam-check strong {
          color: rgba(255,207,112,0.75);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .vl-exam-check p,
        .vl-exam-check span {
          margin: 0;
          color: rgba(246,240,230,0.68);
          font-size: 12px;
          line-height: 1.45;
        }

        .vl-notebook {
          display: grid;
          gap: 8px;
        }

        .vl-notebook strong {
          color: rgba(255,207,112,0.75);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .vl-notebook textarea {
          width: 100%;
          min-height: 72px;
          resize: vertical;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(0,0,0,0.30);
          color: rgba(250,247,240,0.9);
          outline: none;
          font: 12px var(--font-sans);
          line-height: 1.45;
        }

        .vl-notebook > button {
          justify-self: start;
          padding: 8px 11px;
          border-radius: 999px;
          border: 1px solid rgba(77,214,255,0.22);
          background: rgba(77,214,255,0.08);
          color: rgba(250,247,240,0.86);
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
        }

        .vl-notebook > button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .vl-note-list {
          display: grid;
          gap: 6px;
        }

        .vl-note-list span {
          padding: 7px 8px;
          border-radius: 10px;
          background: rgba(255,255,255,0.035);
          color: rgba(246,240,230,0.66);
          font-size: 11px;
          line-height: 1.4;
        }

        .vl-note-list em {
          display: block;
          margin-top: 3px;
          color: rgba(246,240,230,0.36);
          font-size: 9.5px;
          font-style: normal;
        }

        .vl-scrubber {
          flex: 0 1 180px;
          min-width: 140px;
          display: grid;
          gap: 2px;
          color: rgba(246,240,230,0.44);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .vl-scrubber input {
          width: 100%;
          accent-color: #b9ff6a;
        }

        @media (max-width: 720px) {
          .vl-shell {
            padding: 0;
          }

          .vl-stage {
            min-height: 100vh;
            border-radius: 0;
            border: none;
          }

          .vl-header {
            top: 10px;
            left: 10px;
            right: 10px;
            gap: 10px;
          }

          .vl-eyebrow {
            font-size: 9px;
          }

          h1 {
            max-width: calc(100vw - 20px);
            font-size: clamp(20px, 6.4vw, 30px);
            line-height: 1.05;
          }

          .vl-top-controls {
            width: 100%;
            justify-content: space-between;
          }

          .vl-controls {
            left: 8px;
            right: 8px;
            top: auto;
            width: auto;
            bottom: 78px;
            max-height: min(58vh, 520px);
            border-radius: 20px 20px 16px 16px;
          }

          .vl-controls.collapsed {
            transform: translateY(calc(100% + 90px));
          }

          .vl-dock-toggle-left {
            left: 12px;
            top: auto;
            bottom: 20px;
          }

          .vl-dock-toggle-right {
            right: 12px;
            top: auto;
            bottom: 20px;
          }

          .vl-floating-label {
            top: 112px;
            max-width: calc(100vw - 24px);
            overflow: hidden;
            white-space: nowrap;
            padding: 8px 10px;
          }

          .vl-deep-peek {
            right: 12px;
            bottom: 78px;
            padding: 9px 11px;
          }

          .vl-compare-ribbon {
            display: none;
          }

          .vl-explain {
            width: 100%;
            padding: 18px;
          }

          .vl-transport {
            left: 58px;
            right: 58px;
            transform: none;
            width: auto;
            bottom: 10px;
            min-height: 48px;
            border-radius: 18px;
            padding: 6px;
          }

          .vl-transport > button {
            width: 34px;
            height: 34px;
          }

          .vl-stepper button {
            padding: 7px 9px 7px 7px;
            font-size: 11px;
          }

          .vl-scrubber {
            min-width: 118px;
            flex-basis: 120px;
          }

          .vl-stepper span {
            width: 20px;
            height: 20px;
          }

          .vl-topic-grid {
            grid-template-columns: 1fr 1fr;
            max-height: 126px;
          }

          .vl-presets button span,
          .vl-topic-grid button span {
            display: none;
          }
        }

        @media (max-width: 430px) {
          .vl-mode button {
            padding: 7px 10px;
            font-size: 12px;
          }

          .vl-top-subjects {
            gap: 4px;
          }

          .vl-top-subjects button {
            width: 30px;
            height: 30px;
          }

          .vl-floating-label {
            display: none;
          }

          .vl-topic-grid {
            grid-template-columns: 1fr;
          }

          .vl-transport {
            left: 54px;
            right: 54px;
          }

          .vl-scrubber {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}



