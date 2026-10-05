"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Aperture, Sparkles } from "lucide-react";
import {
  type HologramInputs,
  type HologramMode,
} from "../../../shared/hologram/geometry";
import {
  ALL_FORMS,
  FORM_PALETTES,
  FORM_TINTS,
  FORM_PARTICLES,
} from "../../../shared/hologram/forms";
import { CYCLE_SECONDS, HologramMotion } from "../../../shared/hologram/motion";
import { mountHologram, type RenderStats } from "./web-renderer";
import {
  readAssistantState,
  readAssistantAudio,
  subscribeAssistantState,
} from "@/lib/hologram-signal";
import styles from "./hologram.module.css";
export type HologramProps = HologramInputs & {
  className?: string;
  onModeChange?: (mode: HologramMode) => void;
  simulated?: boolean;
  renderer?: "auto" | "canvas";
  /** A companion that shares the sculpture's frame, such as the focus timer. */
  aside?: ReactNode;
  /** Seconds each form is held before drifting into the next. */
  cycleSeconds?: number;
};
/** Picks a different form, and a palette that is free to disagree with it. */
function nextLook(form: number, palette: number) {
  return {
    form:
      (form + 1 + Math.floor(Math.random() * (ALL_FORMS.length - 1))) %
      ALL_FORMS.length,
    palette:
      (palette + 1 + Math.floor(Math.random() * (FORM_PALETTES.length - 1))) %
      FORM_PALETTES.length,
  };
}
/**
 * An ambient sculpture. It has no controls: it chooses its own shape and colour
 * on a slow timer, answers the pointer, and pulses when a study session lands.
 */
export function HologramWidget(props: HologramProps) {
  const assistant = useSyncExternalStore(
    subscribeAssistantState,
    readAssistantState,
    () => "idle" as const,
  );
  const [look, setLook] = useState({ form: 0, palette: 0 }),
    [theme, setTheme] = useState<"light" | "dark">("dark"),
    [reduced, setReduced] = useState(false),
    [stats, setStats] = useState<RenderStats>({
      kind: "webgl",
      count: FORM_PARTICLES,
      lost: false,
    });
  const stage = useRef<HTMLDivElement>(null),
    motion = useRef(new HologramMotion()),
    input = useRef<HologramInputs>({}),
    pausedRef = useRef(false),
    lookRef = useRef({ form: 0, palette: 0 }),
    onModeChange = useRef(props.onModeChange);
  const live: HologramInputs = {
    ...props,
    theme: props.theme ?? theme,
    reducedMotion: props.reducedMotion ?? reduced,
    paused: props.paused,
    assistantState: props.assistantState ?? assistant,
  };
  // The render loop reads these outside React, so they are refreshed after each render.
  useEffect(() => {
    input.current = live;
    pausedRef.current = !!live.paused;
    onModeChange.current = props.onModeChange;
  });
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)"),
      sync = () => {
        setReduced(mq.matches);
        setTheme(
          document.documentElement.dataset.theme === "light" ? "light" : "dark",
        );
      };
    sync();
    mq.addEventListener("change", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      mq.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);
  // Server and client agree on the default form, then the sculpture immediately
  // drifts out of it — so every visit arrives somewhere different without a
  // hydration mismatch, and the arrival itself is part of the motion.
  useEffect(() => {
    motion.current.cycleClock = props.cycleSeconds ?? CYCLE_SECONDS;
  }, [props.cycleSeconds]);
  useEffect(() => {
    if (!stage.current) return;
    const interval = props.cycleSeconds ?? CYCLE_SECONDS;
    return mountHologram(
      stage.current,
      motion.current,
      () => {
        // The sculpture keeps its own company: it drifts to another form on its
        // own schedule, which only advances while it is actually on screen.
        const m = motion.current;
        if (!input.current.reducedMotion && m.dueForNextForm(interval)) {
          const next = nextLook(lookRef.current.form, lookRef.current.palette);
          lookRef.current = next;
          m.transitionTo(next.form, FORM_PALETTES[next.palette]);
          setLook(next);
          onModeChange.current?.(ALL_FORMS[next.form] as HologramMode);
        }
        return {
          ...input.current,
          audioLevel: input.current.audioLevel ?? readAssistantAudio(),
        };
      },
      setStats,
      props.renderer === "canvas",
    );
  }, [props.renderer, props.cycleSeconds]);
  useEffect(() => {
    const celebrate = () => {
      if (!pausedRef.current) motion.current.pulse(input.current.reducedMotion);
    };
    window.addEventListener("neet:study-completed", celebrate);
    return () => window.removeEventListener("neet:study-completed", celebrate);
  }, []);
  return (
    <section
      className={`${styles.widget} ${props.className ?? ""}`}
      style={{ ["--core-subject" as string]: FORM_TINTS[look.palette] }}
      data-theme={live.theme}
      data-paused={live.paused || live.reducedMotion}
      data-mode={ALL_FORMS[look.form]}
      data-aside={props.aside ? "true" : undefined}
      data-renderer={stats.kind}
      aria-label="Your living core hologram"
    >
      <div className={styles.body}>
        <div
          className={styles.stage}
          ref={stage}
          tabIndex={0}
          aria-label="A 3D sculpture that reshapes itself while you study. Drag to turn it; tap to send a pulse through it."
        >
          <div className={styles.haze} />
          <div className={styles.ring} />
          <div className={`${styles.ring} ${styles.ringTwo}`} />
          {[0, 1, 2, 3].map((n) => (
            <span
              key={n}
              className={styles.cross}
              data-corner={n}
              aria-hidden="true"
            >
              +
            </span>
          ))}
          <div className={styles.topLeft}>
            <strong>YOUR LIVING CORE</strong>
            <span>A little energy. Infinite possibility.</span>
          </div>
          <div className={styles.topRight}>
            <strong>
              {stats.kind === "webgl" ? "REAL-TIME 3D" : "CANVAS · LIGHTWEIGHT"}
            </strong>
            <span>
              {stats.lost
                ? "Restoring graphics…"
                : `${stats.count.toLocaleString("en-IN")} living particles`}
            </span>
          </div>
          <div className={`${styles.label} ${styles.biology}`}>
            <Aperture size={19} />
            <span>
              <strong>Always becoming</strong>
              <small>Curiosity looks good on you.</small>
            </span>
          </div>
          <div className={`${styles.label} ${styles.momentum}`}>
            <Sparkles size={18} />
            <span>
              <strong>Made of momentum</strong>
              <small>
                {props.simulated
                  ? "Simulated assistant state"
                  : live.assistantState === "thinking"
                    ? "Ideas finding their shape."
                    : live.assistantState === "speaking"
                      ? "A little energy in every word."
                      : live.assistantState === "listening"
                        ? "Listening, quietly."
                        : "Calm. Present. Ready."}
              </small>
            </span>
          </div>
        </div>
        {props.aside && <div className={styles.aside}>{props.aside}</div>}
      </div>
    </section>
  );
}
