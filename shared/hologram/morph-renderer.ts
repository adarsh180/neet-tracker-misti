import { STAR_COUNT, type HologramInputs } from "./geometry";
import { buildForm, FORM_PARTICLES, META } from "./forms";
import { HologramMotion } from "./motion";
import { morphVertexSource, morphFragmentSource } from "./morph-shaders";

/**
 * Draws the sculpture as a morph between two resident forms. Interface-compatible
 * with `createHologramGL`, so callers can swap one for the other.
 *
 * Only two shapes live on the GPU at a time: when the motion state names a new
 * pair, their buffers are re-uploaded. Everything else — colours, rotation,
 * energy, the pulse — stays uniform-driven and costs nothing per frame.
 */
export function createHologramMorphGL(
  gl: WebGLRenderingContext,
  premultiplied = false,
) {
  const buffers: Record<string, WebGLBuffer> = {},
    shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  const dispose = () => {
    Object.values(buffers).forEach((b) => gl.deleteBuffer(b));
    shaders.forEach((s) => gl.deleteShader(s));
    if (program) gl.deleteProgram(program);
  };
  try {
    const compile = (kind: number, source: string) => {
      const s = gl.createShader(kind);
      if (!s) throw new Error("Shader unavailable");
      shaders.push(s);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error("Shader compilation failed");
      return s;
    };
    program = gl.createProgram();
    if (!program) throw new Error("Graphics unavailable");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, morphVertexSource));
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        premultiplied
          ? morphFragmentSource.replace(
              "gl_FragColor=vec4(c,soft*vAlpha);",
              "gl_FragColor=vec4(c*soft*vAlpha*.65,soft*vAlpha);",
            )
          : morphFragmentSource,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Shader linking failed");
    gl.useProgram(program);

    let loadedFrom = -1,
      loadedTo = -1;
    const attribute = (name: string, size: number, data: Float32Array) => {
      const b = gl.createBuffer();
      if (!b) throw new Error("Buffer unavailable");
      buffers[name] = b;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const loc = gl.getAttribLocation(program!, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    const first = buildForm(0);
    attribute("aFrom", 3, first.positions);
    attribute("aTo", 3, first.positions);
    attribute("aIF", 4, first.info);
    attribute("aIT", 4, first.info);
    attribute("aMeta", 4, META);
    const upload = (name: string, data: Float32Array) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    };
    const sync = (from: number, to: number) => {
      if (from !== loadedFrom) {
        const shape = buildForm(from);
        upload("aFrom", shape.positions);
        upload("aIF", shape.info);
        loadedFrom = from;
      }
      if (to !== loadedTo) {
        const shape = buildForm(to);
        upload("aTo", shape.positions);
        upload("aIT", shape.info);
        loadedTo = to;
      }
    };
    sync(0, 0);

    const uniforms = Object.fromEntries(
      [
        "uFrom",
        "uTo",
        "uMorph",
        "uTime",
        "uAspect",
        "uDpr",
        "uEnergy",
        "uPulse",
        "uGlow",
        "uStars",
        "uLight",
        "uRotation",
        "uPointer",
        "uA",
        "uB",
        "uC",
      ].map((k) => [k, gl.getUniformLocation(program!, k)]),
    );
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    return {
      kind: "webgl" as const,
      resize(w: number, h: number) {
        gl.viewport(0, 0, w, h);
      },
      draw(
        m: HologramMotion,
        input: HologramInputs,
        width: number,
        height: number,
        dpr: number,
        count: number,
      ) {
        const light = input.theme === "light";
        sync(m.fromForm, m.toForm);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.blendFunc(gl.SRC_ALPHA, light ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
        // Rotation carries the drag, a slow idle turn, and a little pointer parallax.
        const idle = input.reducedMotion ? 0 : 0.08 * Math.sin(m.time * 0.12);
        gl.uniform2fv(uniforms.uRotation, [
          -0.24 + m.drag[0] + m.time * 0.055 + m.pointer[0] * 0.19 + idle,
          0.15 + m.drag[1] + m.pointer[1] * 0.13,
        ]);
        gl.uniform2fv(uniforms.uPointer, m.pointer);
        for (const [k, v] of Object.entries({
          uFrom: m.fromForm,
          uTo: m.toForm,
          uMorph: m.morphAmount(),
          uTime: m.time,
          uAspect: width / height,
          uDpr: dpr,
          uEnergy: m.energy,
          uPulse: input.reducedMotion ? 0 : m.burst,
          uGlow: 0.8,
          uLight: light ? 1 : 0,
          uStars: 0,
        }))
          gl.uniform1f(uniforms[k], v);
        m.colors.forEach((c, i) =>
          gl.uniform3fv(uniforms[["uA", "uB", "uC"][i]], c),
        );
        gl.drawArrays(gl.POINTS, 0, Math.min(FORM_PARTICLES, count));
        gl.uniform1f(uniforms.uStars, 1);
        gl.drawArrays(gl.POINTS, FORM_PARTICLES, STAR_COUNT);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
