import {
  generateParticles,
  MAX_PARTICLES,
  STAR_COUNT,
  type HologramInputs,
} from "./geometry";
import { HologramMotion } from "./motion";
import { vertexSource, fragmentSource } from "./shaders";
export function createHologramGL(
  gl: WebGLRenderingContext,
  premultiplied = false,
) {
  const buffers: WebGLBuffer[] = [],
    shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  const dispose = () => {
    buffers.forEach((b) => gl.deleteBuffer(b));
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
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        premultiplied
          ? fragmentSource.replace(
              "gl_FragColor=vec4(c,a);",
              "gl_FragColor=vec4(c*a*.65,a);",
            )
          : fragmentSource,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Shader linking failed");
    gl.useProgram(program);
    const data = generateParticles();
    [...data.geometries, data.particleData].forEach((values, i) => {
      const b = gl.createBuffer();
      if (!b) throw new Error("Buffer unavailable");
      buffers.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(
        program!,
        ["aOrbit", "aHelix", "aBloom", "aEclipse", "aData"][i],
      );
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, i === 4 ? 4 : 3, gl.FLOAT, false, 0, 0);
    });
    const uniforms = Object.fromEntries(
      [
        "uWeights",
        "uPointer",
        "uDrag",
        "uTime",
        "uAspect",
        "uDpr",
        "uBurst",
        "uEnergy",
        "uDawn",
        "uColorA",
        "uColorB",
        "uColorC",
        "uStars",
        "uStill",
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
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.blendFunc(
          gl.SRC_ALPHA,
          input.theme === "light" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE,
        );
        gl.uniform4fv(uniforms.uWeights, m.weights);
        gl.uniform2fv(uniforms.uPointer, m.pointer);
        gl.uniform2fv(uniforms.uDrag, m.drag);
        for (const [k, v] of Object.entries({
          uTime: m.time,
          uAspect: width / height,
          uDpr: dpr,
          uBurst: m.burst,
          uEnergy: m.energy,
          uDawn: input.theme === "light" ? 1 : 0,
          uStill: input.reducedMotion ? 1 : 0,
          uStars: 0,
        }))
          gl.uniform1f(uniforms[k], v);
        m.colors.forEach((c, i) =>
          gl.uniform3fv(
            uniforms[["uColorA", "uColorB", "uColorC"][i]],
            input.theme === "light" ? c.map((v) => v * 0.48) : c,
          ),
        );
        gl.drawArrays(gl.POINTS, 0, Math.min(MAX_PARTICLES, count));
        gl.uniform1f(uniforms.uStars, 1);
        gl.drawArrays(gl.POINTS, MAX_PARTICLES, STAR_COUNT);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
