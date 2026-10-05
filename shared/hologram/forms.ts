/**
 * The sculpture's full vocabulary of shapes.
 *
 * Every form is built from the same deterministic `meta` table, so a particle
 * keeps its identity across every shape and a morph reads as one object
 * rearranging itself rather than a cross-fade between two clouds.
 *
 * `formDeform` is the CPU mirror of the `deform()` branch in the vertex shader;
 * the two must stay in step or the Canvas fallback drifts from the WebGL path.
 */
import { STAR_COUNT } from "./geometry";

/**
 * The morphing engine carries more points than the legacy four-form path: these
 * shapes are hollow surfaces and filaments, and they need the density to read as
 * solid. Quality tiers scale down from here on slower machines.
 */
export const FORM_PARTICLES = 14000;

export const ALL_FORMS = [
  "orbit",
  "helix",
  "bloom",
  "eclipse",
  "aurora",
  "medusa",
  "gyroscope",
  "wormhole",
  "mobius",
  "supernova",
  "heartbeat",
  "nautilus",
  "lotus",
  "neuron",
  "tesseract",
  "asclepius",
] as const;
export type HologramForm = (typeof ALL_FORMS)[number];

/** Three-stop palettes in linear 0..1 RGB, one per form. */
export const FORM_PALETTES: number[][][] = [
  ["#b4f7d7", "#8ec4fa", "#c4a9ff"],
  ["#95f5d1", "#a3bdff", "#ecdaff"],
  ["#cfb0ff", "#ffbfdc", "#9fd9ff"],
  ["#ffc691", "#ff9dba", "#b7aeff"],
  ["#85ffd6", "#86cfff", "#c6a0ff"],
  ["#92ddff", "#b5b6ff", "#f2bbff"],
  ["#a1e1ff", "#b8ffd5", "#e3ccff"],
  ["#c3acff", "#88beff", "#b4ffe5"],
  ["#f5ceab", "#d2b5ff", "#a7dfff"],
  ["#ffe3a8", "#ffad8f", "#efb2ff"],
  ["#ffb2cf", "#ff8da9", "#d9c2ff"],
  ["#ffd5a0", "#eab3bf", "#b6caff"],
  ["#ffc6de", "#ddd0ff", "#abf4de"],
  ["#a5f1dd", "#a9caff", "#ddb2ff"],
  ["#afd9ff", "#bdb2ff", "#b5ffe4"],
  ["#a5f4d0", "#f8d9a5", "#c2deff"],
].map((set) => set.map((h) => saturate(hexToRgb(h), 0.52)));

function hexToRgb(h: string) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
/**
 * Pastels wash out to grey under additive blending, so each stop is pushed back
 * toward its own hue while keeping its brightest channel intact.
 */
function saturate(c: number[], amount: number) {
  const peak = Math.max(...c) || 1,
    floor = Math.min(...c) * amount,
    span = peak - floor || 1;
  return c.map((v) => ((v - floor) / span) * peak);
}

/** The leading colour of each palette, for tinting the surrounding panel. */
export const FORM_TINTS = [
  "#b4f7d7",
  "#95f5d1",
  "#cfb0ff",
  "#ffc691",
  "#85ffd6",
  "#92ddff",
  "#a1e1ff",
  "#c3acff",
  "#f5ceab",
  "#ffe3a8",
  "#ffb2cf",
  "#ffd5a0",
  "#ffc6de",
  "#a5f1dd",
  "#afd9ff",
  "#a5f4d0",
];

const TAU = Math.PI * 2;
const TOTAL = FORM_PARTICLES + STAR_COUNT;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared per-particle randomness. Identical for every form, so identities are stable. */
export const META = (() => {
  const random = rng(17429),
    values = new Float32Array(TOTAL * 4);
  for (let i = 0; i < values.length; i++) values[i] = random();
  return values;
})();

/** Screen-space specks behind the sculpture. Identical in every form so they never morph. */
const STARS = (() => {
  const random = rng(9181),
    values = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++)
    values.set([random() * 2 - 1, random() * 2 - 1, 0], i * 3);
  return values;
})();

const unit = (p: number[]) => {
  const n = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / n, p[1] / n, p[2] / n];
};
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const rx = (p: number[], a: number) => [
  p[0],
  p[1] * Math.cos(a) - p[2] * Math.sin(a),
  p[1] * Math.sin(a) + p[2] * Math.cos(a),
];
const ry = (p: number[], a: number) => [
  p[0] * Math.cos(a) + p[2] * Math.sin(a),
  p[1],
  -p[0] * Math.sin(a) + p[2] * Math.cos(a),
];
const rz = (p: number[], a: number) => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
  p[2],
];
const sphere = (u: number, v: number, r: number) => {
  const y = 2 * v - 1,
    s = Math.sqrt(1 - y * y);
  return [r * s * Math.cos(u * TAU), r * y, r * s * Math.sin(u * TAU)];
};
const knot = (t: number) => {
  const r = 1.08 + 0.34 * Math.cos(3 * t);
  return [r * Math.cos(2 * t), r * Math.sin(2 * t), 0.55 * Math.sin(3 * t)];
};
const heart = (t: number) => [
  (16 * Math.pow(Math.sin(t), 3)) / 10,
  (13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t)) /
    10,
];

export type FormGeometry = { positions: Float32Array; info: Float32Array };
const cache = new Map<number, FormGeometry>();

/** Builds one form's particle cloud. Cached: each shape is only ever computed once. */
export function buildForm(index: number): FormGeometry {
  const cached = cache.get(index);
  if (cached) return cached;
  const positions = new Float32Array(TOTAL * 3),
    info = new Float32Array(TOTAL * 4);
  for (let i = 0; i < FORM_PARTICLES; i++) {
    const u = META[i * 4],
      v = META[i * 4 + 1],
      w = META[i * 4 + 2],
      q = META[i * 4 + 3],
      a = u * TAU,
      b = v * TAU;
    let p = [0, 0, 0],
      data = [0, u, v, w];
    switch (index) {
      case 0: {
        const c = knot(a),
          tangent = unit(knot(a + 0.001).map((x, j) => x - c[j])),
          n = unit([Math.cos(2 * a), Math.sin(2 * a), 0]),
          bn = unit(cross(tangent, n)),
          r = 0.14 + 0.075 * w;
        p = c.map((x, j) => x + r * (n[j] * Math.cos(b) + bn[j] * Math.sin(b)));
        break;
      }
      case 1: {
        const strand = i % 2,
          ang = a * 2.6 + strand * Math.PI;
        if (i % 8 < 5) {
          const r = 0.53 + 0.04 * Math.cos(b);
          p = [r * Math.cos(ang), u * 3.05 - 1.525, r * Math.sin(ang)];
          data[0] = 0;
        } else {
          const h = Math.floor(u * 27) / 26,
            ang2 = h * TAU * 2.6,
            r = (v * 2 - 1) * 0.53;
          p = [
            r * Math.cos(ang2),
            h * 3.05 - 1.525 + 0.022 * (w - 0.5),
            r * Math.sin(ang2),
          ];
          data[0] = 1;
        }
        break;
      }
      case 2: {
        const r = Math.sqrt(v) * (1.05 + 0.35 * Math.cos(7 * a)),
          z = 0.5 * Math.cos(Math.sqrt(v) * Math.PI) + 0.16 * Math.cos(7 * a) * v;
        p = [r * Math.cos(a), r * Math.sin(a), z + 0.028 * (w - 0.5)];
        data[0] = Math.floor(q * 3);
        break;
      }
      case 3: {
        let r = 0.6 + Math.pow(v, 0.72) * 1.08;
        const ang = a + (1 - v) * 4;
        p = [
          r * Math.cos(ang),
          r * Math.sin(ang),
          0.018 * (w - 0.5) + 0.03 * Math.sin(v * 22 + u * 25),
        ];
        if (i % 9 === 0) {
          r = 0.6 + 0.035 * w;
          p = [r * Math.cos(a), r * Math.sin(a), 0.013 * (v - 0.5)];
        }
        break;
      }
      case 4: {
        const band = i % 5,
          x = (u * 2 - 1) * 1.68,
          y =
            (v - 0.5) * (0.45 + 0.14 * Math.cos(u * 9 + band)) +
            0.45 * Math.sin(x * 1.7 + band * 0.75);
        p = [
          x,
          y + (band - 2) * 0.15,
          0.28 * (band - 2) + 0.2 * Math.cos(x * 2 + band),
        ];
        data[0] = band;
        break;
      }
      case 5: {
        if (i % 10 < 6) {
          const theta = v * 1.5,
            r = 1.02 * Math.sin(theta) * (1 + 0.035 * Math.cos(18 * a));
          p = [r * Math.cos(a), 0.43 + 0.72 * Math.cos(theta), r * Math.sin(a)];
          data[0] = 0;
        } else {
          const tent = i % 18,
            ang = (tent * TAU) / 18,
            r = 0.28 + (0.56 * (tent % 3)) / 2,
            twist = ang + v * 1.25;
          p = [
            r * Math.cos(twist) + 0.08 * Math.sin(v * 13 + tent),
            0.45 - v * 2.05,
            r * Math.sin(twist) + 0.04 * Math.cos(v * 17 + tent),
          ];
          data = [1, v, tent, u];
        }
        break;
      }
      case 6: {
        const group = i % 10;
        if (group < 8) {
          const r = 1.38 + 0.03 * Math.cos(b);
          p = [r * Math.cos(a), r * Math.sin(a), 0.03 * Math.sin(b)];
          data[0] = group % 3;
        } else {
          p = sphere(u, v, 0.43 + 0.018 * w);
          data[0] = 3;
        }
        break;
      }
      case 7: {
        const z = v * 2.6 - 1.3,
          r = 0.23 + 1.17 * Math.pow(v, 1.8),
          angle = a + v * 3.2;
        p = [r * Math.cos(angle), r * Math.sin(angle), z];
        data[0] = Math.floor(q * 24);
        break;
      }
      case 8: {
        const band = (v - 0.5) * 0.83,
          r = 1.12 + band * Math.cos(a / 2);
        p = [r * Math.cos(a), r * Math.sin(a), band * Math.sin(a / 2)];
        break;
      }
      case 9: {
        if (i % 5 < 2) {
          p = sphere(u, v, 0.53 + 0.055 * Math.sin(a * 9) * Math.sin(b * 7));
          data[0] = 0;
        } else {
          const ray = i % 137,
            z = 1 - (2 * (ray + 0.5)) / 137,
            ang = ray * 2.3999632297,
            sz = Math.sqrt(1 - z * z),
            r = 0.55 + Math.pow(v, 0.72) * (1 + 0.35 * Math.sin(ray * 31));
          p = [
            sz * Math.cos(ang) * r + (w - 0.5) * 0.012,
            z * r + (w - 0.5) * 0.012,
            sz * Math.sin(ang) * r,
          ];
          data = [1, v, u, w];
        }
        break;
      }
      case 10: {
        const h = heart(a),
          r = Math.sqrt(v),
          z =
            (q > 0.5 ? 1 : -1) *
            0.53 *
            Math.sqrt(Math.max(0, 1 - r * r)) *
            (0.6 + 0.4 * Math.abs(Math.sin(a)));
        p = [h[0] * r, (h[1] + 0.2) * r, z + 0.012 * (w - 0.5)];
        break;
      }
      case 11: {
        const t = u * TAU * 1.85,
          r = 0.17 * Math.exp(t * 0.205),
          tube = r * 0.39,
          radial = r + tube * Math.cos(b);
        p = [
          radial * Math.cos(t) - 0.2,
          radial * Math.sin(t) + 0.35,
          tube * Math.sin(b),
        ].map((x) => x * 0.65);
        data[0] = t;
        break;
      }
      case 12: {
        const layer = i % 3,
          petals = [9, 7, 5][layer],
          petal = Math.floor(u * petals),
          s = (u * petals) % 1,
          ang = (petal * TAU) / petals + layer * 0.24,
          r = 0.1 + v * (1.46 - layer * 0.3),
          width = Math.sin(v * Math.PI) * (0.35 - layer * 0.035) * (s * 2 - 1),
          ang2 = ang + width / (r + 0.1),
          y =
            -0.6 +
            layer * 0.24 +
            Math.pow(v, 1.5) * (0.63 + layer * 0.14) +
            0.2 * Math.sin(v * Math.PI);
        p = [r * Math.cos(ang2), y, r * Math.sin(ang2)];
        data = [layer, v, u, w];
        break;
      }
      case 13: {
        if (i % 5 === 0) {
          p = sphere(u, v, 0.35 + 0.055 * Math.sin(a * 6) * Math.cos(b * 4));
          data[0] = 0;
        } else {
          const branch = i % 11,
            ang = (branch * TAU) / 11,
            side = (i % 3) - 1,
            t = ang + (side * 0.3 * Math.max(0, v - 0.4)) / 0.6,
            r = 0.25 + 1.47 * v;
          p = [
            r * Math.cos(t) + 0.034 * Math.sin(v * 27 + branch) * v,
            r * Math.sin(t) + 0.025 * Math.sin(v * 31 + branch) * v,
            0.3 * Math.sin(branch * 2.13) * v + 0.07 * Math.sin(v * 18 + branch),
          ];
          data = [1, v, branch, w];
        }
        break;
      }
      case 14: {
        const edge = i % 32,
          axis = Math.floor(edge / 8),
          bits = edge % 8,
          base: number[] = [],
          other: number[] = [];
        let bit = 0;
        for (let j = 0; j < 4; j++) {
          base[j] = j === axis ? -1 : ((bits >> bit++) & 1 ? 1 : -1);
          other[j] = base[j];
        }
        other[axis] = 1;
        const h = base.map((x, j) => mix(x, other[j], u));
        p = [h[0] * 0.74, h[1] * 0.74, h[2] * 0.74];
        data = [0, h[3] * 0.74, v, w];
        break;
      }
      case 15: {
        const group = i % 10;
        if (group < 3) {
          p = [0.055 * Math.cos(a), (v * 2 - 1) * 1.63, 0.055 * Math.sin(a)];
          data[0] = 0;
        } else if (group < 9) {
          const t = v * TAU * 2.2,
            rad = 0.43 - 0.12 * v,
            r = 0.07 * (0.55 + v * 0.45);
          p = [
            rad * Math.cos(t) + Math.cos(t) * r * Math.cos(a),
            -1.22 + v * 2.52 + r * Math.sin(a),
            rad * Math.sin(t) + Math.sin(t) * r * Math.cos(a),
          ];
          data[0] = 1;
        } else {
          const t = TAU * 2.2,
            s = sphere(u, v, 1);
          p = [
            0.31 * Math.cos(t) + s[0] * 0.12,
            1.31 + s[1] * 0.11,
            0.31 * Math.sin(t) + s[2] * 0.19,
          ];
          data[0] = 2;
        }
        break;
      }
    }
    positions.set(p, i * 3);
    info.set(data, i * 4);
  }
  positions.set(STARS, FORM_PARTICLES * 3);
  const built = { positions, info };
  cache.set(index, built);
  return built;
}

/**
 * CPU mirror of the vertex shader's `deform()`. Keep both in step.
 * `k < 0` means "already baked", so the point is returned untouched.
 */
export function formDeform(
  point: number[],
  d: number[],
  k: number,
  t: number,
): number[] {
  let p = point.slice();
  if (k < 0) return p;
  if (k === 0) {
    p = p.map((x, j) => x + Math.sin(t * 0.85 + point[(j + 1) % 3] * 3) * 0.012);
    p = ry(p, t * 0.105);
  } else if (k === 1) {
    p = ry(p, t * 0.24);
    p[0] += Math.sin(p[1] * 3 - t * 1.8) * 0.014;
  } else if (k === 2) {
    const a = Math.atan2(p[1], p[0]),
      r = Math.hypot(p[0], p[1]);
    p[2] += 0.09 * Math.sin(t + r * 4 + a * 2);
    p = rz(p, 0.08 * Math.sin(t * 0.15));
  } else if (k === 3) {
    p = rx(rz(p, t * 0.13), 1.1);
  } else if (k === 4) {
    p[1] += 0.15 * Math.sin(p[0] * 2.7 - t * 0.9 + d[0] * 0.8);
    p[2] += 0.16 * Math.cos(p[0] * 1.8 + t * 0.6 + d[0]);
  } else if (k === 5) {
    if (d[0] < 0.5) {
      const z = 1 + 0.065 * Math.sin(t * 1.5);
      p[0] *= z;
      p[2] *= z;
      p[1] += 0.065 * Math.cos(t * 1.5);
    } else {
      p[0] += 0.11 * Math.sin(d[1] * 7 - t * 1.3 + d[2]) * d[1];
      p[2] += 0.1 * Math.cos(d[1] * 8 - t * 1.1 + d[2]) * d[1];
    }
    p[1] += 0.045 * Math.sin(t * 0.75);
  } else if (k === 6) {
    if (d[0] < 2.5) {
      p = rx(p, 0.5 + d[0] * 0.86 + t * (0.13 + d[0] * 0.05));
      p = ry(p, d[0] * 0.85 + t * 0.1);
    } else p = p.map((x) => x * (1 + 0.045 * Math.sin(t * 1.6)));
  } else if (k === 7) {
    const r = 1 + 0.05 * Math.sin(p[2] * 6 - t * 2);
    p[0] *= r;
    p[1] *= r;
    p = ry(rz(p, t * 0.12), -0.3);
  } else if (k === 8) {
    p = rx(p, 0.43 + 0.22 * Math.sin(t * 0.3));
    p[2] += 0.026 * Math.sin(d[1] * TAU * 3 - t * 1.2);
  } else if (k === 9) {
    const beat = Math.pow(Math.max(0, Math.sin(t * 1.3 - d[1] * 2)), 6);
    p = p.map((x) => x * (1 + 0.1 * beat));
    p = ry(p, t * 0.09);
  } else if (k === 10) {
    const a = Math.pow(Math.max(0, Math.sin(t * 3.2)), 14),
      b = Math.pow(Math.max(0, Math.sin(t * 3.2 - 0.72)), 22);
    p = p.map((x) => x * (1 + 0.055 * a + 0.03 * b));
    p = ry(p, 0.18 * Math.sin(t * 0.23));
  } else if (k === 11) {
    p = ry(p, 0.28 + 0.2 * Math.sin(t * 0.23));
    p = rz(p, 0.05 * Math.sin(t * 0.3));
  } else if (k === 12) {
    const breath = 0.055 * Math.sin(t * 0.85 + d[0] * 0.35);
    p[0] *= 1 + breath;
    p[2] *= 1 + breath;
    p[1] -= breath * d[1];
    p = rx(ry(p, t * 0.06), 0.55);
  } else if (k === 13) {
    if (d[0] > 0.5) p[2] += 0.025 * Math.sin(d[1] * 13 - t * 1.8 + d[2]);
    p = ry(p, 0.16 * Math.sin(t * 0.18));
  } else if (k === 14) {
    let [x, y, z] = p,
      w = d[1],
      a = t * 0.19 + 0.38,
      c = Math.cos(a),
      s = Math.sin(a);
    const nx = x * c - w * s;
    w = x * s + w * c;
    x = nx;
    a = t * 0.13 + 0.2;
    c = Math.cos(a);
    s = Math.sin(a);
    const ny = y * c - z * s;
    z = y * s + z * c;
    y = ny;
    a = t * 0.11;
    c = Math.cos(a);
    s = Math.sin(a);
    const nz = z * c - w * s;
    w = z * s + w * c;
    z = nz;
    const f = 2.85 / (2.85 - w);
    p = [x * f, y * f, z * f];
  } else if (k === 15) {
    p = ry(p, 0.24 * Math.sin(t * 0.3));
  }
  return p;
}
