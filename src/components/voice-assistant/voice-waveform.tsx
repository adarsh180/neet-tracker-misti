"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Live microphone / speech level in the 0–1 range. */
  audioLevelRef: React.RefObject<number>;
  /** When false the bars settle into a calm idle ripple. */
  active: boolean;
  bars?: number;
  className?: string;
};

/**
 * Bar meter for the assistant dock. The level arrives on a ref rather than as
 * state, so the animation is driven straight into the DOM to avoid re-rendering
 * the whole workspace on every audio frame.
 */
export default function VoiceWaveform({ audioLevelRef, active, bars = 44, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  // Mirrored onto a ref so the animation loop can read the latest value
  // without being torn down and rebuilt every time the state flips.
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const nodes = Array.from(host.children) as HTMLSpanElement[];
    if (!nodes.length) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Centre bars react hardest, edges stay calm — reads as a voice envelope.
    const envelope = nodes.map((_, index) => {
      const distance = Math.abs(index - (nodes.length - 1) / 2) / ((nodes.length - 1) / 2);
      return 0.32 + 0.68 * Math.cos((distance * Math.PI) / 2) ** 1.6;
    });
    const smoothed = new Array<number>(nodes.length).fill(0.06);

    let frame = 0;
    const started = performance.now();

    const draw = (now: number) => {
      const elapsed = (now - started) / 1000;
      const live = activeRef.current ? Math.min(1, Math.max(0, audioLevelRef.current ?? 0)) : 0;
      const floor = activeRef.current ? 0.1 : 0.05;

      for (let index = 0; index < nodes.length; index += 1) {
        const ripple =
          Math.sin(elapsed * 2.4 + index * 0.42) * 0.5 +
          Math.sin(elapsed * 3.9 - index * 0.27) * 0.32 +
          Math.sin(elapsed * 6.1 + index * 0.13) * 0.18;
        const target = Math.min(1, floor + envelope[index] * (live * 0.92 + 0.08) * (0.55 + 0.45 * ripple));
        // Fast attack, slow release — mirrors how a real level meter behaves.
        smoothed[index] += (target - smoothed[index]) * (target > smoothed[index] ? 0.42 : 0.13);
        nodes[index].style.transform = `scaleY(${Math.max(0.05, smoothed[index]).toFixed(3)})`;
        nodes[index].style.opacity = (0.32 + smoothed[index] * 0.68).toFixed(3);
      }

      if (!document.hidden) frame = window.requestAnimationFrame(draw);
    };

    if (reduced) {
      nodes.forEach((node, index) => {
        node.style.transform = `scaleY(${(0.18 + envelope[index] * 0.22).toFixed(3)})`;
        node.style.opacity = "0.5";
      });
      return;
    }

    const onVisibility = () => {
      window.cancelAnimationFrame(frame);
      if (!document.hidden) frame = window.requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [audioLevelRef, bars]);

  return (
    <div ref={hostRef} className={className} aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
