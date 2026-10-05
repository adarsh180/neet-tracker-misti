"use client";

import { useEffect, useState } from "react";

/** Odometer figure: each digit rolls to its value; starts from zero on mount. */
export function Roll({ value, decimals = 0, suffix, className }: { value: number; decimals?: number; suffix?: React.ReactNode; className?: string }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShown(value));
    return () => window.cancelAnimationFrame(id);
  }, [value]);
  const final = value.toFixed(decimals);
  const text = (shown ?? 0).toFixed(decimals).padStart(final.length, "0");
  return (
    <span className={`pl-roll ${className ?? ""}`} aria-label={final}>
      {text.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="pl-roll-digit" aria-hidden="true">
            <span style={{ transform: `translateY(${-Number(ch) * 10}%)`, transitionDelay: `${(text.length - i) * 45}ms` }}>
              0<br />1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">{ch}</span>
        ),
      )}
      {suffix ? <span aria-hidden="true">{suffix}</span> : null}
    </span>
  );
}
