import type { VariableValues } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function projectileState(values: VariableValues, phase: number) {
  const u = values.u ?? 30;
  const theta = ((values.theta ?? 45) * Math.PI) / 180;
  const g = Math.max(values.g ?? 9.8, 0.1);
  const ux = u * Math.cos(theta);
  const uy = u * Math.sin(theta);
  const totalTime = (2 * uy) / g;
  const t = clamp(phase, 0, 1) * totalTime;
  const x = ux * t;
  const y = Math.max(0, uy * t - 0.5 * g * t * t);
  const range = (u * u * Math.sin(2 * theta)) / g;
  const maxHeight = (uy * uy) / (2 * g);
  const peakTime = uy / g;

  return {
    t,
    x,
    y,
    ux,
    uy: uy - g * t,
    totalTime,
    range,
    maxHeight,
    peakTime,
  };
}

export function shmState(values: VariableValues, timeSeconds: number) {
  const A = values.A ?? 90;
  const omega = values.omega ?? 2;
  const t = timeSeconds * (values.speed ?? 1);
  const x = A * Math.sin(omega * t);
  const velocity = A * omega * Math.cos(omega * t);
  const acceleration = -omega * omega * x;

  return { x, velocity, acceleration, period: (2 * Math.PI) / omega };
}

export function pendulumState(values: VariableValues, timeSeconds: number) {
  const L = Math.max(values.L ?? 1.2, 0.05);
  const g = Math.max(values.g ?? 9.8, 0.1);
  const theta0 = ((values.theta0 ?? 15) * Math.PI) / 180;
  const omega = Math.sqrt(g / L);
  const theta = theta0 * Math.cos(omega * timeSeconds * (values.speed ?? 1));

  return {
    theta,
    period: 2 * Math.PI * Math.sqrt(L / g),
    length: L,
  };
}

export function doublePendulumState(values: VariableValues, timeSeconds: number) {
  const L1 = Math.max(values.L1 ?? 1.15, 0.25);
  const L2 = Math.max(values.L2 ?? 1.0, 0.25);
  const m1 = Math.max(values.m1 ?? 1, 0.1);
  const m2 = Math.max(values.m2 ?? 1, 0.1);
  const g = Math.max(values.g ?? 9.8, 0.1);
  const speed = values.speed ?? 1;
  const loopTime = ((timeSeconds * speed) % 18 + 18) % 18;
  const maxStep = 0.018;
  const initial: [number, number, number, number] = [
    ((values.theta1 ?? 110) * Math.PI) / 180,
    ((values.theta2 ?? 65) * Math.PI) / 180,
    0,
    0,
  ];

  const derivative = ([theta1, theta2, omega1, omega2]: [number, number, number, number]) => {
    const delta = theta1 - theta2;
    const den1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * delta));
    const den2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * delta));
    const a1 = (
      -g * (2 * m1 + m2) * Math.sin(theta1)
      - m2 * g * Math.sin(theta1 - 2 * theta2)
      - 2 * Math.sin(delta) * m2 * (omega2 * omega2 * L2 + omega1 * omega1 * L1 * Math.cos(delta))
    ) / den1;
    const a2 = (
      2 * Math.sin(delta) * (
        omega1 * omega1 * L1 * (m1 + m2)
        + g * (m1 + m2) * Math.cos(theta1)
        + omega2 * omega2 * L2 * m2 * Math.cos(delta)
      )
    ) / den2;

    return [omega1, omega2, a1, a2] as [number, number, number, number];
  };

  const addScaled = (
    state: [number, number, number, number],
    delta: [number, number, number, number],
    scale: number
  ): [number, number, number, number] => [
    state[0] + delta[0] * scale,
    state[1] + delta[1] * scale,
    state[2] + delta[2] * scale,
    state[3] + delta[3] * scale,
  ];

  let state = initial;
  for (let elapsed = 0; elapsed < loopTime; elapsed += maxStep) {
    const dt = Math.min(maxStep, loopTime - elapsed);
    const k1 = derivative(state);
    const k2 = derivative(addScaled(state, k1, dt / 2));
    const k3 = derivative(addScaled(state, k2, dt / 2));
    const k4 = derivative(addScaled(state, k3, dt));
    state = [
      state[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      state[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      state[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      state[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
    ];
  }

  const [theta1, theta2, omega1, omega2] = state;
  return {
    theta1,
    theta2,
    omega1,
    omega2,
    length1: L1,
    length2: L2,
    periodHint: 2 * Math.PI * Math.sqrt((L1 + L2) / (2 * g)),
  };
}

export function lensImage(values: VariableValues) {
  const u = Math.max(values.u ?? 30, 0.1);
  const f = Math.max(values.f ?? 15, 0.1);
  const denominator = 1 / f - 1 / u;
  const v = Math.abs(denominator) < 1e-5 ? Number.POSITIVE_INFINITY : 1 / denominator;
  const magnification = -v / u;

  return {
    u,
    f,
    v,
    magnification,
    real: Number.isFinite(v) && v > 0,
  };
}

export function nuclearDaughter(conceptId: string, values: VariableValues) {
  const A = Math.round(values.A ?? 0);
  const Z = Math.round(values.Z ?? 0);

  if (conceptId.includes("alpha")) return { parentA: A, parentZ: Z, daughterA: A - 4, daughterZ: Z - 2, emitted: "alpha (4He2)" };
  if (conceptId.includes("beta-minus")) return { parentA: A, parentZ: Z, daughterA: A, daughterZ: Z + 1, emitted: "beta- electron" };
  if (conceptId.includes("beta-plus")) return { parentA: A, parentZ: Z, daughterA: A, daughterZ: Z - 1, emitted: "positron" };
  return { parentA: A, parentZ: Z, daughterA: A, daughterZ: Z, emitted: "gamma photon" };
}

export function halfLifeRemaining(values: VariableValues, t: number) {
  const N0 = values.N0 ?? 100;
  const halfLife = Math.max(values.halfLife ?? 5, 0.001);
  return N0 * Math.pow(0.5, t / halfLife);
}

export function titrationPh(values: VariableValues, baseVolumeMl: number) {
  const acidConc = Math.max(values.acidConc ?? 0.1, 1e-6);
  const baseConc = Math.max(values.baseConc ?? 0.1, 1e-6);
  const acidVolume = Math.max(values.acidVolume ?? 50, 1e-6);
  const acidMoles = acidConc * acidVolume * 0.001;
  const baseMoles = baseConc * baseVolumeMl * 0.001;
  const totalVolumeL = (acidVolume + baseVolumeMl) * 0.001;
  const diff = acidMoles - baseMoles;

  if (Math.abs(diff) < 1e-10) return 7;
  if (diff > 0) {
    return clamp(-Math.log10(diff / totalVolumeL), 0, 14);
  }

  const pOH = -Math.log10(Math.abs(diff) / totalVolumeL);
  return clamp(14 - pOH, 0, 14);
}

export function arrheniusRelativeProbability(values: VariableValues) {
  const T = Math.max(values.temperature ?? 350, 1);
  const Ea = Math.max(values.Ea ?? 60, 1);
  const R = 8.314e-3;
  return clamp(Math.exp(-Ea / (R * T)) * 16000, 0.02, 1);
}

export function equilibriumProgress(values: VariableValues) {
  const stress = values.reactant ?? 5;
  const K = Math.max(values.K ?? 1, 0.01);
  const raw = stress / (stress + 4 / K);
  return clamp(raw, 0.12, 0.88);
}

export function circularMotionState(values: VariableValues, timeSeconds: number) {
  const r = clamp(values.radius ?? 130, 30, 200);
  const v = Math.max(values.v ?? 4, 0.1);
  const m = Math.max(values.mass ?? 2, 0.1);
  const omega = v / r;
  const t = timeSeconds * (values.speed ?? 1);
  const angle = omega * t;
  const px = r * Math.cos(angle);
  const py = r * Math.sin(angle);
  const ux = -v * Math.sin(angle); // tangential velocity direction
  const uy = v * Math.cos(angle);
  const ax = -(v * v / r) * Math.cos(angle); // centripetal, toward centre
  const ay = -(v * v / r) * Math.sin(angle);
  const Fc = m * v * v / r;
  const period = (2 * Math.PI * r) / v;
  return { px, py, ux, uy, ax, ay, Fc, period, r, v, m };
}

export function springMassState(values: VariableValues, timeSeconds: number) {
  const k = Math.max(values.k ?? 8, 0.1);
  const mass = Math.max(values.mass ?? 2, 0.1);
  const A = values.amplitude ?? 90;
  const omega = Math.sqrt(k / mass);
  const t = timeSeconds * (values.speed ?? 1);
  const x = A * Math.cos(omega * t);
  const v = -A * omega * Math.sin(omega * t);
  const F = -k * x;
  const KE = 0.5 * mass * v * v;
  const PE = 0.5 * k * x * x;
  const E = 0.5 * k * A * A;
  return { x, v, F, KE, PE, E, omega, period: (2 * Math.PI) / omega };
}

export function workEnergyState(values: VariableValues, phase: number) {
  const mass = Math.max(values.mass ?? 3, 0.1);
  const h = Math.max(values.height ?? 80, 1);
  const g = values.g ?? 9.8;
  const totalE = mass * g * h;
  const progress = clamp(phase, 0, 1);
  const currentH = h * (1 - progress);
  const PE = mass * g * currentH;
  const KE = totalE - PE;
  const v = Math.sqrt(Math.max(2 * KE / mass, 0));
  return { PE, KE, totalE, v, currentH, h };
}
