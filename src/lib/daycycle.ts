/**
 * Day-cycle palette rule, shared by the pre-paint script (layout.tsx) and the
 * PaletteCycler. Colours follow the real time of day — dawn (5–10), noon
 * (10–16), dusk (16–20), night (20–5) — and within each part one of three
 * related palettes takes over every minute. Colours live in src/app/daycycle.css (data-pulse).
 */
export const DAYPARTS = ["dawn", "noon", "dusk", "night"] as const;
export type Daypart = (typeof DAYPARTS)[number];

export function daypartFor(date = new Date()): Daypart {
  const h = date.getHours();
  if (h >= 5 && h < 10) return "dawn";
  if (h >= 10 && h < 16) return "noon";
  if (h >= 16 && h < 20) return "dusk";
  return "night";
}

export function paletteForNow(now = Date.now()) {
  return `${daypartFor(new Date(now))}-${(Math.floor(now / 60000) % 3) + 1}`;
}

/** The same rule for the inline pre-paint script; expects `d` = document.documentElement. */
export const DAYCYCLE_SCRIPT =
  'var n=Date.now(),h=new Date(n).getHours(),p=h>=5&&h<10?"dawn":h>=10&&h<16?"noon":h>=16&&h<20?"dusk":"night";d.dataset.daypart=p;d.dataset.pulse=p+"-"+(Math.floor(n/60000)%3+1);';
