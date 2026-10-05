export const MAX_PARTICLES = 8500;
export const STAR_COUNT = 120;
export const FORMS = ["orbit", "helix", "bloom", "eclipse"] as const;
export type HologramMode = (typeof FORMS)[number];
export type HologramSubject = "biology" | "chemistry" | "physics";
export type AssistantState = "idle" | "listening" | "thinking" | "speaking";
export type Quality = "auto" | "high" | "medium" | "low";
export type HologramInputs = {
  mode?: HologramMode;
  subject?: HologramSubject;
  theme?: "light" | "dark";
  assistantState?: AssistantState;
  audioLevel?: number;
  quality?: Quality;
  reducedMotion?: boolean;
  paused?: boolean;
};
export const SUBJECT_FORMS = {
  biology: "helix",
  chemistry: "bloom",
  physics: "eclipse",
} as const;
export const palettes = {
  biology: [
    [0.45, 0.95, 0.75],
    [0.63, 0.6, 1],
    [0.87, 1, 0.91],
  ],
  chemistry: [
    [0.67, 0.53, 1],
    [0.95, 0.62, 0.88],
    [0.8, 0.92, 1],
  ],
  physics: [
    [0.83, 0.7, 0.47],
    [0.65, 0.8, 0.92],
    [1, 0.92, 0.71],
  ],
};
export function generateParticles(seed = 180704) {
  const particleCount = MAX_PARTICLES,
    TAU = Math.PI * 2;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const geometries = Array.from(
    { length: 4 },
    () => new Float32Array((particleCount + STAR_COUNT) * 3),
  );
  const particleData = new Float32Array((particleCount + STAR_COUNT) * 4);
  function normal(v: number[]) {
    const m = Math.hypot(...v) || 1;
    return v.map((x) => x / m);
  }
  function cross(a: number[], b: number[]) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }
  function knot(t: number) {
    const r = 1.1 + 0.35 * Math.cos(3 * t);
    return [r * Math.cos(2 * t), r * Math.sin(2 * t), 0.55 * Math.sin(3 * t)];
  }
  for (let i = 0; i < particleCount; i++) {
    const u = random(),
      v = random(),
      w = random(),
      a = u * TAU,
      b = v * TAU;
    particleData.set([u, v, w, random()], i * 4);
    const c = knot(a),
      n = normal([Math.cos(2 * a), Math.sin(2 * a), 0]),
      c2 = knot(a + 0.002),
      tangent = normal(c2.map((x, j) => x - c[j])),
      binormal = normal(cross(tangent, n)),
      tube = 0.17 + 0.075 * w;
    let orbit = c.map(
      (x, j) => x + tube * (n[j] * Math.cos(b) + binormal[j] * Math.sin(b)),
    );
    if (i % 17 === 0) {
      const ra = 1.85 + 0.1 * w;
      orbit = [ra * Math.cos(a), 0.49 * Math.sin(a), ra * Math.sin(a) * 0.35];
    }
    geometries[0].set(orbit, i * 3);
    let helix;
    if (i % 7 < 4) {
      const strand = i % 2,
        angle = u * TAU * 2.6 + strand * Math.PI,
        rad = 0.56 + 0.06 * Math.cos(b);
      helix = [
        rad * Math.cos(angle),
        u * 2.9 - 1.45,
        rad * Math.sin(angle) + 0.055 * Math.sin(b),
      ];
    } else if (i % 7 < 6) {
      const level = Math.floor(u * 24) / 23,
        angle = level * TAU * 2.6,
        r = (v * 2 - 1) * 0.56;
      helix = [
        r * Math.cos(angle),
        level * 2.9 - 1.45 + (w - 0.5) * 0.035,
        r * Math.sin(angle),
      ];
    } else {
      const theta = a,
        phi = Math.acos(2 * v - 1);
      helix = [
        0.11 * Math.sin(phi) * Math.cos(theta),
        u * 2.96 - 1.48,
        0.11 * Math.sin(phi) * Math.sin(theta),
      ];
    }
    geometries[1].set(helix, i * 3);
    const rr = Math.sqrt(v),
      petal = 1 + 0.24 * Math.cos(7 * a),
      r = 0.1 + 1.15 * rr * petal;
    let bloom = [
      r * Math.cos(a),
      r * Math.sin(a),
      0.48 * Math.cos(rr * Math.PI) +
        0.24 * Math.cos(7 * a) * rr +
        0.025 * (w - 0.5),
    ];
    if (i % 19 === 0)
      bloom = [1.75 * Math.cos(a), 1.75 * Math.sin(a), 0.03 * (w - 0.5)];
    geometries[2].set(bloom, i * 3);
    const r3 = 0.66 + Math.pow(v, 0.63) * 1.1,
      twist = a + (1 - v) * 3.6;
    let eclipse = [
      Math.cos(twist) * r3,
      Math.sin(twist) * r3 * 0.57,
      0.27 * Math.sin(twist) * r3 + 0.09 * Math.sin(v * 16 + u * 30),
    ];
    if (i % 11 === 0) {
      const a3 = u * TAU;
      eclipse = [0.65 * Math.cos(a3), 0.65 * Math.sin(a3), 0.05 * Math.sin(b)];
    }
    geometries[3].set(eclipse, i * 3);
  }
  for (let i = particleCount; i < particleCount + STAR_COUNT; i++) {
    geometries[0].set([random() * 2 - 1, random() * 2 - 1, 0], i * 3);
    particleData.set([random(), random(), random(), random()], i * 4);
  }
  return { geometries, particleData };
}
