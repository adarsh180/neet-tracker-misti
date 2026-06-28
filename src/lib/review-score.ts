/**
 * Deterministic review scoring — the single source of truth for a review card's
 * grade and 0-100 performance index.
 *
 * Why this exists: the grade used to be written by the AI, which made it
 * subjective and non-monotonic (e.g. a 75h week could score worse than a 64h
 * week). A report card has to be mathematically consistent: more hours, more
 * output, more consistency and cleaner integrity must never produce a worse
 * grade. This module computes the grade purely from the logged numbers so the
 * result is reproducible, comparable across periods, and identical whether it is
 * computed on the server (when the card is generated) or on the client (when an
 * older card is re-rendered).
 *
 * It is intentionally framework-free and has zero imports so it is safe to use
 * in both server code and the browser bundle.
 */

/** Daily benchmark for a 5th-attempt AIIMS Delhi aspirant. */
export const DAILY_HOURS_TARGET = 12;
export const DAILY_QUESTIONS_TARGET = 100;
/** Healthy solving pace (questions/hour) the productivity term is normalised to. */
const HEALTHY_QUESTIONS_PER_HOUR = 10;

export type ReviewScoreInput = {
  hours: number;
  questions: number;
  activeDays: number;
  periodDays: number;
  topicsCompleted: number;
  revisions: number;
  testsTaken: number;
  avgTestPercentage: number | null;
  distractionHours: number;
  /** Deterministic log-forensics flags; each severity costs integrity points. */
  integritySignals: { severity: number }[];
};

export type ReviewScoreComponents = {
  /** Hours logged vs the 12h/day standard (0-30). */
  effort: number;
  /** Question volume vs the 100/day standard (0-25). */
  output: number;
  /** Questions per hour vs a healthy pace (0-10). */
  productivity: number;
  /** Active days vs every day in the period (0-15). */
  consistency: number;
  /** Topics completed + revisions, i.e. real syllabus movement (0-10). */
  progress: number;
  /** Test performance, or a neutral baseline when no test was taken (0-10). */
  assessment: number;
  /** Integrity deduction from forensic flags (0 to -30). */
  integrityPenalty: number;
  /** Distraction deduction beyond a sane daily allowance (0 to -10). */
  distractionPenalty: number;
};

export type ReviewScore = {
  /** Composite 0-100 performance index. */
  index: number;
  /** Letter grade derived monotonically from the index. */
  grade: string;
  components: ReviewScoreComponents;
};

export const GRADE_THRESHOLDS: { grade: string; min: number }[] = [
  { grade: "A+", min: 90 },
  { grade: "A", min: 82 },
  { grade: "B+", min: 74 },
  { grade: "B", min: 66 },
  { grade: "C", min: 54 },
  { grade: "D", min: 40 },
  { grade: "F", min: 0 },
];

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function gradeForIndex(index: number): string {
  for (const tier of GRADE_THRESHOLDS) {
    if (index >= tier.min) return tier.grade;
  }
  return "F";
}

/**
 * Map a letter grade back to a representative index. Only used as a fallback for
 * very old cards that predate stored metrics; live cards always use the real
 * computed index.
 */
export function indexForGrade(grade: string): number {
  const tier = GRADE_THRESHOLDS.find((entry) => entry.grade === grade.trim().toUpperCase());
  if (!tier) return 50;
  // Midpoint between this tier's floor and the next higher floor.
  const higher = GRADE_THRESHOLDS.filter((entry) => entry.min > tier.min).map((entry) => entry.min);
  const ceiling = higher.length ? Math.min(...higher) : 100;
  return Math.round((tier.min + ceiling) / 2);
}

export function computeReviewScore(input: ReviewScoreInput): ReviewScore {
  const periodDays = Math.max(1, input.periodDays);
  const hours = Math.max(0, input.hours);
  const questions = Math.max(0, input.questions);

  const hoursTarget = periodDays * DAILY_HOURS_TARGET;
  const questionsTarget = periodDays * DAILY_QUESTIONS_TARGET;

  // 1. Effort — hours vs the 12h/day standard (capped at target; overwork earns no bonus).
  const effort = clamp(hours / hoursTarget, 0, 1) * 30;

  // 2. Output — question volume vs the 100/day standard.
  const output = clamp(questions / questionsTarget, 0, 1) * 25;

  // 3. Productivity — questions per hour vs a healthy pace. Punishes "hours with
  //    no output". Neutral (half marks) when no hours are logged.
  const qph = hours > 0 ? questions / hours : 0;
  const productivity = (hours > 0 ? clamp(qph / HEALTHY_QUESTIONS_PER_HOUR, 0, 1) : 0.5) * 10;

  // 4. Consistency — active days vs every day in the period (no zero days).
  const consistency = clamp(input.activeDays / periodDays, 0, 1) * 15;

  // 5. Progress — real syllabus movement. A revision counts half a completion.
  //    Target ≈ one completion-equivalent per day.
  const progressUnits = input.topicsCompleted + input.revisions * 0.5;
  const progress = clamp(progressUnits / periodDays, 0, 1) * 10;

  // 6. Assessment — test performance when tested; a neutral 50% baseline when no
  //    test was taken so a test-less week is flagged, not destroyed.
  const assessment =
    input.testsTaken > 0 && input.avgTestPercentage !== null
      ? clamp(input.avgTestPercentage / 100, 0, 1) * 10
      : 5;

  // Penalties.
  const integrityPenalty = -Math.min(
    30,
    input.integritySignals.reduce((sum, signal) => sum + Math.max(0, signal.severity) * 5, 0),
  );
  const distractionAllowance = periodDays * 1.5; // ~1.5h/day is tolerated.
  const distractionPenalty = -Math.min(10, Math.max(0, input.distractionHours - distractionAllowance) * 0.5);

  const components: ReviewScoreComponents = {
    effort: Math.round(effort * 10) / 10,
    output: Math.round(output * 10) / 10,
    productivity: Math.round(productivity * 10) / 10,
    consistency: Math.round(consistency * 10) / 10,
    progress: Math.round(progress * 10) / 10,
    assessment: Math.round(assessment * 10) / 10,
    integrityPenalty: Math.round(integrityPenalty * 10) / 10,
    distractionPenalty: Math.round(distractionPenalty * 10) / 10,
  };

  const rawIndex =
    effort + output + productivity + consistency + progress + assessment + integrityPenalty + distractionPenalty;
  const index = Math.round(clamp(rawIndex, 0, 100));

  return { index, grade: gradeForIndex(index), components };
}

// ---------------------------------------------------------------------------
// Period-over-period comparison (statistical, deterministic)
// ---------------------------------------------------------------------------

export type ComparisonPoint = {
  index: number;
  hours: number;
  questions: number;
};

export type ReviewComparison = {
  /** Delta vs the immediately previous period of the same cadence. */
  vsPrevious: {
    indexDelta: number;
    hoursDelta: number;
    hoursPct: number | null;
    questionsDelta: number;
    questionsPct: number | null;
  } | null;
  /** Mean index of up to the last 4 prior same-cadence periods. */
  baselineIndex: number | null;
  /** Current index minus the trailing baseline. */
  vsBaseline: number | null;
  /** 1-based rank of this period's index among all same-cadence periods. */
  rank: number | null;
  totalPeriods: number;
  /** Direction of the last three indices. */
  momentum: "improving" | "declining" | "stable" | "unknown";
};

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Compare the current period against its history.
 *
 * @param current the period being graded
 * @param previous the immediately preceding period (chronologically), or null
 * @param priorChronological all same-cadence periods strictly before `current`,
 *        ordered oldest → newest. Used for the trailing baseline, ranking and
 *        momentum.
 */
export function computeReviewComparison(
  current: ComparisonPoint,
  previous: ComparisonPoint | null,
  priorChronological: ComparisonPoint[],
): ReviewComparison {
  const vsPrevious = previous
    ? {
        indexDelta: current.index - previous.index,
        hoursDelta: Math.round((current.hours - previous.hours) * 10) / 10,
        hoursPct: pct(current.hours, previous.hours),
        questionsDelta: current.questions - previous.questions,
        questionsPct: pct(current.questions, previous.questions),
      }
    : null;

  const trailing = priorChronological.slice(-4);
  const baselineIndex = trailing.length
    ? Math.round((trailing.reduce((sum, point) => sum + point.index, 0) / trailing.length) * 10) / 10
    : null;
  const vsBaseline = baselineIndex !== null ? Math.round((current.index - baselineIndex) * 10) / 10 : null;

  const allIndices = [...priorChronological, current].map((point) => point.index);
  const totalPeriods = allIndices.length;
  const rank = totalPeriods
    ? allIndices.filter((value) => value > current.index).length + 1
    : null;

  // Momentum from the last three indices (older → current).
  const lastThree = [...priorChronological.slice(-2).map((point) => point.index), current.index];
  let momentum: ReviewComparison["momentum"] = "unknown";
  if (lastThree.length >= 2) {
    const first = lastThree[0];
    const last = lastThree[lastThree.length - 1];
    if (last - first >= 4) momentum = "improving";
    else if (first - last >= 4) momentum = "declining";
    else momentum = "stable";
  }

  return { vsPrevious, baselineIndex, vsBaseline, rank, totalPeriods, momentum };
}
