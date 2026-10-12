/**
 * Chapter zones for the priority radar: how ready Misti is in each chapter,
 * judged against how much that chapter matters in the real NEET UG paper.
 *
 * Importance  = the chapter's official PYQ marks (out of 720, NMC-deleted
 *               chapters excluded), as a percentile among all her chapters.
 * Readiness   = 0–100 from five live signals:
 *   coverage    30%  topics completed
 *   revision    20%  how fresh the revision of finished topics is
 *   practice    15%  questions solved per topic (60 a topic = full)
 *   tests       20%  her test accuracy in the subject, minus this chapter's error-log hits,
 *                    counted in full only once the chapter has been studied
 *   consistency 15%  how recently she studied the chapter at all
 *   (a signal with no data yet — e.g. no tests — is left out and the rest re-weighted)
 * Bar         = the readiness a chapter of that weight needs: 50 for the
 *               lightest chapters up to 90 for the heaviest, rising a little
 *               as the exam gets closer.
 * Zone        = danger when far below its bar (40 points short for the
 *               lightest chapters, ~15 for the heaviest), watch when more than
 *               8 short, safe once it is within 8 of its bar.
 * Everything is recomputed on every load, so completing, revising, testing or
 * simply studying a chapter moves it.
 */

export type ZoneKey = "danger" | "watch" | "safe";
export type ZoneFactors = { coverage: number; revision: number; practice: number; tests: number | null; consistency: number };
export type ChapterZone = {
  subject: string;
  chapter: string;
  marks: number; // official NEET marks this chapter carries (of 720)
  weight: number; // 0–1 percentile of marks among all chapters
  readiness: number; // 0–100
  bar: number; // readiness this chapter's weight demands
  zone: ZoneKey;
  risk: number; // marks not yet secured against the bar
  topics: number;
  done: number;
  lastDays: number | null; // days since she last touched it
  factors: ZoneFactors;
  drag: keyof ZoneFactors | null; // the signal pulling it down most
};

export type ZoneTopic = {
  subject: string;
  chapter: string;
  marks: number;
  done: boolean;
  questions: number;
  lastRevised: Date | null;
  lastTouched: Date | null; // latest of completion, revision or logged study
};

const WEIGHTS: Record<keyof ZoneFactors, number> = { coverage: 0.3, revision: 0.2, practice: 0.15, tests: 0.2, consistency: 0.15 };
const DAY = 86_400_000;
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

function revisionScore(t: ZoneTopic, now: number) {
  if (!t.lastRevised) return 0;
  const age = (now - t.lastRevised.getTime()) / DAY;
  return age <= 14 ? 1 : age <= 45 ? 0.6 : 0.3;
}

function consistencyScore(days: number | null) {
  if (days === null) return 0;
  if (days <= 7) return 1;
  if (days <= 30) return 1 - ((days - 7) / 23) * 0.6;
  return clamp(0.4 - ((days - 30) / 30) * 0.4);
}

export function buildChapterZones(input: {
  topics: ZoneTopic[];
  testSignal: (subject: string) => number | null; // 0–100, null = no tests yet
  errorPenalty: (subject: string, chapter: string) => number; // 0–24
  daysToExam: number;
  now?: Date;
}): ChapterZone[] {
  const now = (input.now ?? new Date()).getTime();
  const groups = new Map<string, ZoneTopic[]>();
  for (const t of input.topics) {
    const key = `${t.subject}|${t.chapter}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const rows = [...groups.values()].map((list) => {
    const { subject, chapter } = list[0];
    const done = list.filter((t) => t.done);
    const marks = list.reduce((n, t) => n + t.marks, 0);
    const touched = list.map((t) => t.lastTouched?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    const lastDays = touched ? Math.max(0, Math.floor((now - touched) / DAY)) : null;
    const test = input.testSignal(subject);
    const coverage = done.length / list.length;
    const practice = clamp(list.reduce((n, t) => n + t.questions, 0) / list.length / 60);
    // Subject test accuracy only counts in full once the chapter itself has been studied.
    const evidence = 0.3 + 0.7 * clamp(coverage + practice);
    const factors: ZoneFactors = {
      coverage: Math.round(coverage * 100),
      revision: Math.round((done.length ? done.reduce((n, t) => n + revisionScore(t, now), 0) / done.length : 0) * 100),
      practice: Math.round(practice * 100),
      tests: test === null ? null : Math.round(clamp(((test - input.errorPenalty(subject, chapter)) / 100) * evidence) * 100),
      consistency: Math.round(consistencyScore(lastDays) * 100),
    };
    let sum = 0;
    let wsum = 0;
    for (const k of Object.keys(WEIGHTS) as Array<keyof ZoneFactors>) {
      const v = factors[k];
      if (v === null) continue;
      sum += v * WEIGHTS[k];
      wsum += WEIGHTS[k];
    }
    const readiness = Math.round(wsum ? sum / wsum : 0);
    // The weakest signal, scaled by how much it counts, is what to fix first.
    const drag = (Object.keys(WEIGHTS) as Array<keyof ZoneFactors>)
      .filter((k) => factors[k] !== null)
      .sort((a, b) => (100 - (factors[a] as number)) * WEIGHTS[a] - (100 - (factors[b] as number)) * WEIGHTS[b])
      .at(-1) ?? null;
    return { subject, chapter, marks, topics: list.length, done: done.length, lastDays, factors, readiness, drag };
  });

  // Importance: where this chapter's marks sit among all chapters.
  const sorted = rows.map((r) => r.marks).sort((a, b) => a - b);
  const pct = (m: number) => (sorted.length > 1 ? sorted.filter((x) => x < m).length / (sorted.length - 1) : 0.5);
  const urgency = 8 * clamp(1 - input.daysToExam / 365);

  return rows
    .map((r) => {
      const weight = pct(r.marks);
      const bar = Math.round(Math.min(97, 50 + 40 * weight + urgency));
      const gap = bar - r.readiness;
      // Heavy chapters turn red sooner: 40 points short for the lightest, ~15 for the heaviest.
      const zone: ZoneKey = gap >= 40 - 25 * weight ? "danger" : gap > 8 ? "watch" : "safe";
      const risk = Math.round(r.marks * clamp(gap / bar) * 10) / 10;
      return { ...r, marks: Math.round(r.marks * 10) / 10, weight: Math.round(weight * 100) / 100, bar, zone, risk };
    })
    .sort((a, b) => b.risk - a.risk || b.marks - a.marks);
}
