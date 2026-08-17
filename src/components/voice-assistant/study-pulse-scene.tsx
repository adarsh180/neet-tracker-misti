"use client";

import { useEffect, useRef, useState } from "react";

export type StudyPulseState = "idle" | "wake" | "listening" | "thinking" | "executing" | "speaking" | "success" | "error";

type Props = {
  state: StudyPulseState;
  audioLevelRef: React.RefObject<number>;
  className?: string;
};

const VERTEX_SHADER = `
attribute vec2 p;
varying vec2 uv;
void main(){ uv=p; gl_Position=vec4(p,0.,1.); }
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 uv;
uniform vec2 res;
uniform float time;
uniform float activity;
uniform float phase;
uniform vec3 signal;

float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float waveLine(vec2 p,float seed,float scale,float sharp){
  float env=.34+.66*exp(-p.x*p.x*.66);
  float y=sin(p.x*(6.6+activity*1.2)+seed+time*(1.02+activity*1.28))*.055*scale*env;
  y+=sin(p.x*16.4-seed*.62-time*.66)*.014*scale;
  y+=sin(p.x*29.0+seed*1.2+time*.37)*.0045*activity;
  return exp(-abs(p.y-y)*sharp);
}
float ellipse(vec2 p,vec2 radii,float width){ return exp(-abs(length(p/radii)-1.)*width); }

void main(){
  vec2 q=uv;
  q.x*=res.x/res.y;
  vec2 c=vec2(-.04,.095);
  vec2 p=q-c;
  float pulse=1.+activity*.045+sin(time*1.35)*.007;
  float r=.445*pulse;
  float d=length(p);
  float inside=1.-smoothstep(r-.006,r+.006,d);
  float z=sqrt(max(0.,r*r-d*d));
  vec3 n=normalize(vec3(p,z));
  vec3 view=vec3(0.,0.,1.);
  vec3 light=normalize(vec3(-.5,.58,.82));
  float fres=pow(1.-max(dot(n,view),0.),2.65);
  float diff=max(dot(n,light),0.);
  float spec=pow(max(dot(reflect(-light,n),view),0.),38.);
  vec3 cream=vec3(1.,.92,.78);
  vec3 col=vec3(.004,.004,.009);
  float vign=smoothstep(1.45,.12,length(q*vec2(.66,1.)));
  col+=signal*(.012+.025*activity)*vign;

  vec2 grid=floor((q+3.)*(27.+activity*5.));
  vec2 cell=fract((q+3.)*(27.+activity*5.))-.5;
  float rnd=hash21(grid);
  float star=smoothstep(.13,0.,length(cell))*step(.78,rnd);
  float depth=.18+.82*hash21(grid+7.1);
  float twinkle=.58+.42*sin(time*(.7+depth*1.5)+rnd*18.);
  col+=signal*star*(.09+.17*activity)*depth*twinkle*smoothstep(1.1,.2,abs(q.y))*smoothstep(1.35,.34,abs(q.x));

  float rear=waveLine(vec2(q.x,q.y-c.y),.35,.68+activity*.38,48.)+waveLine(vec2(q.x,q.y-c.y),2.4,.36+activity*.3,69.);
  rear*=.22+.22*activity;
  rear*=mix(1.,.08,inside);
  col+=signal*rear;

  float halo=exp(-abs(d-r)*17.)*(.13+.18*activity)+exp(-abs(d-r)*53.)*(.32+.25*activity);
  col+=signal*halo;
  if(inside>0.){
    vec2 rp=p+n.xy*(.066+.024*activity)*(1.-z/r);
    float refr=waveLine(rp,time*.1+1.18,.76+activity*.42,47.)+waveLine(rp,-1.25,.39+activity*.28,66.);
    vec3 volume=mix(vec3(.007,.008,.021),signal*(.14+.1*activity),diff*.42+fres*.66);
    float inner=pow(max(0.,1.-d/r),1.45);
    vec2 particleSpace=(rp+vec2(time*(.004+.011*activity),-time*.0025))*58.;
    vec2 particleCell=fract(particleSpace)-.5;
    vec2 particleId=floor(particleSpace);
    float particleRnd=hash21(particleId);
    float particleRadius=.085+.07*hash21(particleId+3.7);
    float particleShape=pow(smoothstep(particleRadius,0.,length(particleCell)),1.7);
    float particleGate=step(.91-activity*.035,particleRnd);
    float particleTwinkle=.52+.48*sin(time*(.8+particleRnd*1.9)+particleRnd*19.);
    volume+=mix(signal,cream,.18)*particleShape*particleGate*inner*particleTwinkle*(.28+.34*activity);
    volume+=signal*refr*(.18+.18*activity);
    float glassDepth=pow(fres,1.35)*smoothstep(r*.18,r,d);
    float shoulder=pow(max(dot(n,light),0.),4.5)*smoothstep(r*.28,r,d);
    volume+=signal*(fres*(.54+.3*activity)+glassDepth*.26)+cream*(spec*(.62+.34*activity)+shoulder*.1);
    float innerCore=exp(-d*d*11.)*(.035+.04*activity);
    volume+=signal*innerCore;
    col=mix(col,volume,.9);
  }

  float rim=exp(-abs(d-r)*135.);
  col+=mix(signal,cream,.17+spec)*rim*(.68+fres*.72+activity*.35);
  float orbit1=ellipse(vec2(p.x,p.y*.88),vec2(.65,.18),86.)*smoothstep(.14,.47,abs(p.x));
  float orbit2=ellipse(vec2(p.x*.92,p.y),vec2(.57,.57),112.)*.12;
  col+=signal*(orbit1*(.07+.1*activity)+orbit2*(.07+.08*activity));

  float front=waveLine(vec2(q.x,q.y-c.y),time*.16+2.12,.9+activity*.55,72.)+waveLine(vec2(q.x,q.y-c.y),-time*.13-.72,.43+activity*.36,90.);
  float depthMask=.38+.62*smoothstep(-.06,.13,q.y-c.y);
  front*=mix(1.,depthMask,inside);
  col+=signal*front*(.52+.5*activity);
  col+=vec3(1.)*front*front*(.1+.13*activity);

  if(phase>4.5 && phase<5.5) col+=vec3(.35,.08,.08)*exp(-abs(d-r)*34.)*.26;
  if(phase>3.5 && phase<4.5) col+=vec3(.08,.28,.16)*exp(-abs(d-r)*38.)*.18;
  col*=.84+.16*vign;
  col=pow(col,vec3(.82));
  gl_FragColor=vec4(col,1.);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function StudyPulseScene({ state, audioLevelRef, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const [fallback, setFallback] = useState(false);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) {
      setFallback(true);
      return;
    }
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      setFallback(true);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const timeUniform = gl.getUniformLocation(program, "time");
    const resolutionUniform = gl.getUniformLocation(program, "res");
    const signalUniform = gl.getUniformLocation(program, "signal");
    const activityUniform = gl.getUniformLocation(program, "activity");
    const phaseUniform = gl.getUniformLocation(program, "phase");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const weakDevice = memory <= 4 || navigator.hardwareConcurrency <= 4;
    const renderScale = Math.min(window.devicePixelRatio || 1, weakDevice ? 0.9 : 1.35);
    let frame = 0;
    let smoothed = 0;
    const started = performance.now();
    const stateNumber: Record<StudyPulseState, number> = { idle: 0, wake: 1, listening: 2, thinking: 3, executing: 3.4, success: 4, error: 5, speaking: 6 };

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(2, Math.round(rect.width * renderScale));
      const height = Math.max(2, Math.round(rect.height * renderScale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      const current = stateRef.current;
      const liveLevel = current === "listening" || current === "speaking" ? (audioLevelRef.current ?? 0) : 0;
      const automatic = current === "thinking" || current === "executing" ? 0.32 + Math.sin(now * 0.004) * 0.08 : current === "wake" ? 0.22 : current === "success" ? 0.2 : 0.08;
      const target = Math.max(liveLevel, automatic);
      smoothed += (target - smoothed) * (target > smoothed ? 0.3 : 0.08);
      if (reduced) smoothed = Math.min(smoothed, 0.14);
      const speaking = current === "speaking";
      const error = current === "error";
      const color = error ? [1, 0.45, 0.48] : speaking ? [0.57, 0.79, 1] : [0.96, 0.49, 0.7];
      gl.uniform1f(timeUniform, (now - started) / 1000);
      gl.uniform2f(resolutionUniform, width, height);
      gl.uniform3fv(signalUniform, color);
      gl.uniform1f(activityUniform, Math.min(1, smoothed));
      gl.uniform1f(phaseUniform, stateNumber[current]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!document.hidden) frame = window.requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      if (!document.hidden) frame = window.requestAnimationFrame(draw);
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onLost);
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [audioLevelRef]);

  return (
    <div className={className} aria-hidden="true">
      <canvas ref={canvasRef} />
      {fallback ? <div className="study-pulse-fallback"><span /><i /><b /></div> : null}
    </div>
  );
}
