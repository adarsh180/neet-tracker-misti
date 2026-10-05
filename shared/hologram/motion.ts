import {
  FORMS,
  palettes,
  SUBJECT_FORMS,
  type HologramInputs,
} from "./geometry";
export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));
export function resolvedMode(input: HologramInputs) {
  return input.assistantState === "thinking"
    ? "eclipse"
    : input.assistantState === "speaking"
      ? "bloom"
      : input.assistantState === "listening"
        ? "orbit"
        : (input.mode ??
          (input.subject ? SUBJECT_FORMS[input.subject] : "orbit"));
}
/** How long one form is held before the sculpture drifts into the next. */
export const CYCLE_SECONDS = 30;
/** How long a form takes to become the next one. */
export const MORPH_SECONDS = 2.1;
const easeMorph = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
/** Persistent barycentric weights preserve every particle's identity even when a morph is interrupted. */
export class HologramMotion {
  weights = new Float32Array([1, 0, 0, 0]);
  colors = palettes.biology.map((c) => [...c]);
  time = 0;
  burst = 0;
  energy = 0;
  pointer = [0, 0];
  pointerTarget = [0, 0];
  drag = [0, 0];
  dragTarget = [0, 0];
  /** Form indices for the morphing renderer, and how far between them we are. */
  fromForm = 0;
  toForm = 0;
  morph = 1;
  /** Seconds the current form has been held. Only advances while visibly animating. */
  cycleClock = 0;
  /** When set, overrides the subject palette so colours can drift independently of form. */
  colorTarget: number[][] | null = null;
  private queued: { form: number; palette?: number[][] } | null = null;
  /** True when the sculpture has settled and has been holding this form long enough. */
  dueForNextForm(interval = CYCLE_SECONDS) {
    return this.morph >= 1 && this.cycleClock >= interval;
  }
  /** Eased 0..1 for the shader; raw `morph` stays linear so timing math is simple. */
  morphAmount() {
    return easeMorph(this.morph);
  }
  /** Begins a drift into another form. A request made mid-morph is held until this one lands. */
  transitionTo(form: number, palette?: number[][]) {
    if (form === this.toForm) return false;
    if (this.morph < 1) {
      this.queued = { form, palette };
      return false;
    }
    this.fromForm = this.toForm;
    this.toForm = form;
    this.morph = 0;
    this.cycleClock = 0;
    if (palette) this.colorTarget = palette.map((c) => [...c]);
    return true;
  }
  pulse(reduced = false) {
    if (!reduced) this.burst = Math.max(this.burst, 0.85);
  }
  step(dt: number, input: HologramInputs) {
    if (input.paused) return;
    dt = clamp(dt, 0, 0.05);
    const target = FORMS.indexOf(resolvedMode(input)),
      reduced = !!input.reducedMotion;
    const f = reduced ? 1 : 1 - Math.exp(-dt * 3.5),
      smooth = reduced ? 1 : 1 - Math.exp(-dt * 7);
    for (let i = 0; i < 4; i++)
      this.weights[i] += (Number(i === target) - this.weights[i]) * f;
    const palette = this.colorTarget ?? palettes[input.subject ?? "biology"];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        this.colors[i][j] += (palette[i][j] - this.colors[i][j]) * f;
    for (let i = 0; i < 2; i++) {
      this.pointer[i] += (this.pointerTarget[i] - this.pointer[i]) * smooth;
      this.drag[i] += (this.dragTarget[i] - this.drag[i]) * smooth;
    }
    if (!reduced && !input.paused) {
      this.time += dt;
      this.cycleClock += dt;
      this.morph = Math.min(1, this.morph + dt / MORPH_SECONDS);
      this.burst *= Math.exp(-dt * 2.7);
    } else if (reduced) {
      this.burst = 0;
      this.morph = 1;
    }
    if (this.morph >= 1 && this.queued) {
      const next = this.queued;
      this.queued = null;
      this.transitionTo(next.form, next.palette);
    }
    const level = Number.isFinite(input.audioLevel)
      ? clamp(input.audioLevel!)
      : 0;
    const targetEnergy = reduced
      ? 0
      : level * 0.9 +
        (input.assistantState && input.assistantState !== "idle" ? 0.06 : 0);
    this.energy += (targetEnergy - this.energy) * (1 - Math.exp(-dt * 9));
  }
}
