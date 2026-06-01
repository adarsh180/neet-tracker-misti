"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// useLayoutEffect on the client, useEffect on the server (avoids SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Tracks the rendered width of a container element.
 *
 * Recharts 3.x `ResponsiveContainer` renders `null` until its ResizeObserver
 * reports a positive size, and seeds with `{ width: -1 }`. Inside this app's
 * animated / view-transition frame the first measurement can come back `0`,
 * leaving the chart permanently blank. Seeding with a non-zero fallback and
 * measuring ourselves guarantees the chart always gets a positive width.
 */
export function useChartWidth(fallback = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

interface ResponsiveChartProps {
  height: number;
  /** Initial width used before the container is measured. */
  fallbackWidth?: number;
  className?: string;
  children: (width: number, height: number) => ReactNode;
}

/**
 * Drop-in replacement for recharts `<ResponsiveContainer>` that never renders
 * blank. Provide a render function receiving the measured `width` and `height`,
 * and pass them straight to the recharts chart root, e.g.
 *
 *   <ResponsiveChart height={280}>
 *     {(w, h) => <AreaChart width={w} height={h} data={data}>...</AreaChart>}
 *   </ResponsiveChart>
 */
export default function ResponsiveChart({
  height,
  fallbackWidth = 600,
  className,
  children,
}: ResponsiveChartProps) {
  const { ref, width } = useChartWidth(fallbackWidth);

  return (
    <div ref={ref} className={className} style={{ width: "100%", height }}>
      {children(width, height)}
    </div>
  );
}
