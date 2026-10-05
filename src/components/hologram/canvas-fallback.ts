import { type HologramInputs } from "../../../shared/hologram/geometry";
import { buildForm, formDeform, META } from "../../../shared/hologram/forms";
import { HologramMotion } from "../../../shared/hologram/motion";
/** Lightweight CPU projection of the same forms, used only if WebGL is unavailable. */
export function createCanvasFallback(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  return {
    kind: "canvas" as const,
    resize() {},
    dispose() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    draw(
      m: HologramMotion,
      input: HologramInputs,
      width: number,
      height: number,
      dpr: number,
      count: number,
    ) {
      const light = input.theme === "light",
        from = buildForm(m.fromForm),
        to = buildForm(m.toForm),
        blend = m.morphAmount(),
        still = !!input.reducedMotion;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = light ? "source-over" : "lighter";
      const ay =
          -0.24 +
          m.drag[0] +
          m.time * 0.055 +
          m.pointer[0] * 0.19 +
          (still ? 0 : 0.08 * Math.sin(m.time * 0.12)),
        ax = 0.15 + m.drag[1] + m.pointer[1] * 0.13,
        cy = Math.cos(ay),
        sy = Math.sin(ay),
        cx = Math.cos(ax),
        sx = Math.sin(ax),
        boost = 1 + 0.018 * Math.sin(m.time * 0.85) + m.energy * 0.05,
        fit = Math.min(width, height);
      for (let i = 0; i < count; i++) {
        const j = i * 3,
          k = i * 4,
          info = [META[k], META[k + 1], META[k + 2], META[k + 3]];
        const b = formDeform(
          [to.positions[j], to.positions[j + 1], to.positions[j + 2]],
          [to.info[k], to.info[k + 1], to.info[k + 2], to.info[k + 3]],
          m.toForm,
          m.time,
        );
        // Settled forms are the common case; only pay for the outgoing shape mid-morph.
        const a =
          blend >= 1
            ? b
            : formDeform(
                [
                  from.positions[j],
                  from.positions[j + 1],
                  from.positions[j + 2],
                ],
                [
                  from.info[k],
                  from.info[k + 1],
                  from.info[k + 2],
                  from.info[k + 3],
                ],
                m.fromForm,
                m.time,
              );
        const p = a.map((v, n) => (v + (b[n] - v) * blend) * boost);
        const x1 = p[0] * cy + p[2] * sy,
          z1 = -p[0] * sy + p[2] * cy,
          y = p[1] * cx - z1 * sx,
          z = p[1] * sx + z1 * cx,
          depth = 5.4 - z,
          scale = (fit * 0.52 * 2.95) / depth;
        const c = m.colors[info[0] > 0.53 ? 1 : 0].map((v) =>
          Math.round(v * 255 * (light ? 0.42 : 1)),
        );
        const front = Math.max(0, Math.min(1, (z + 1.7) / 3.4));
        ctx.fillStyle = `rgba(${c.join(",")},${(0.24 + front * 0.3).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(
          width / 2 + x1 * scale,
          height / 2 - y * scale,
          Math.max(0.6, ((0.75 + info[2] * 0.7) * 5.4) / depth),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  };
}
