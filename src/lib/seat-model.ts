import { estimateCalibratedRank } from "@/lib/neet-rank-calibration";

/**
 * NEET seat model (pure — runs on the server and in the browser).
 *
 * 1. Current level C (out of 720): recency-weighted full-length mock scores,
 *    blended with the chapter engine's expected marks; falls back to the last
 *    real attempt when there is no evidence.
 * 2. Exam-day projection S = C + headroom × growth, where growth follows how
 *    much effort is left until the exam (hours, questions, mocks, revision).
 * 3. Accuracy sets a ceiling: with +4 / −1 marking, ~171 attempts can never
 *    beat 171 × (5a − 1) marks — so accuracy is a lever of its own.
 * 4. S becomes an AIR with the calibrated marks-vs-rank tables, and seat odds
 *    are P(score ≥ the score that historically reached each AIR) on a normal
 *    curve whose width shrinks as evidence grows.
 */

export type SeatInputs = {
  daysToExam: number;
  currentScore: number;
  currentBasis: "mocks" | "chapters" | "last-attempt";
  lastRealScore: number | null;
  mockCount: number;
  observedAccuracy: number | null;
  observedAttemptRate: number | null;
  revisionHealth: number; // 0..1
  subjectExpected: Record<SubjectKey, number>; // marks out of 180 today
};

export type SubjectKey = "Physics" | "Chemistry" | "Botany" | "Zoology";

export type SeatLevers = {
  hoursPerDay: number;
  questionsPerDay: number;
  mocksPerWeek: number;
  accuracy: number; // 0..1
  revision: number; // 0..1 share of finished topics revised on schedule
};

export type SeatTier = { key: "govt" | "rishikesh" | "aiims"; label: string; air: number; threshold: number; p: number };

export type SeatResult = {
  projected: number;
  low: number;
  high: number;
  sigma: number;
  ceiling: number;
  air: number;
  airBest: number;
  airWorst: number;
  gainVsLast: number | null;
  evidence: number;
  tiers: SeatTier[];
  subjects: Record<SubjectKey, number>;
};

// General category. The goal is AIIMS Delhi / AIIMS Rishikesh; the govt seat
// is only the safety floor = last AIQ govt MBBS allotment (MCC 2025 round 3:
// AIR 26,178 for General).
export const SEAT_TARGETS = [
  { key: "govt" as const, label: "Govt MBBS (floor)", air: 26000 },
  { key: "rishikesh" as const, label: "AIIMS Rishikesh tier", air: 900 },
  { key: "aiims" as const, label: "AIIMS Delhi", air: 50 },
];

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function phi(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const scoreCache = new Map<number, number>();
/** Lowest score whose calibrated AIR is at or better than `air`. */
export function scoreForRank(air: number) {
  const hit = scoreCache.get(air);
  if (hit !== undefined) return hit;
  let lo = 0;
  let hi = 720;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (estimateCalibratedRank(mid).rank <= air) hi = mid;
    else lo = mid + 1;
  }
  scoreCache.set(air, lo);
  return lo;
}

export function runSeatModel(inputs: SeatInputs, levers: SeatLevers): SeatResult {
  const months = Math.max(0, inputs.daysToExam) / 30.4;
  const C = clamp(inputs.currentScore, 0, 720);

  const effort =
    0.42 * clamp(levers.hoursPerDay / 10, 0, 1.25) +
    0.3 * clamp(levers.questionsPerDay / 160, 0, 1.25) +
    0.16 * clamp(levers.mocksPerWeek / 2, 0, 1.25) +
    0.12 * clamp(levers.revision, 0, 1);
  const growth = 1 - Math.exp(-0.12 * effort * months);
  const raw = C + (720 - C) * growth;

  const attempted = 180 * clamp(inputs.observedAttemptRate ?? 0.93, 0.6, 1);
  const ceiling = Math.max(0, attempted * (5 * clamp(levers.accuracy, 0.2, 1) - 1));
  // Soft ceiling: approaching it gets harder rather than stopping dead.
  const projected = Math.round(Math.min(raw, ceiling - 18 * Math.exp(-(ceiling - raw) / 18)));

  const evidence = clamp(0.25 + 0.45 * (inputs.mockCount / (inputs.mockCount + 5)) + (inputs.currentBasis === "mocks" ? 0.15 : 0) + 0.15 * clamp(inputs.revisionHealth));
  const sigma = 22 + 48 * (1 - evidence) + 10 * clamp(months / 8);
  const est = estimateCalibratedRank(Math.max(0, projected));
  const best = estimateCalibratedRank(Math.min(720, projected + sigma));
  const worst = estimateCalibratedRank(Math.max(0, projected - sigma));

  const tiers: SeatTier[] = SEAT_TARGETS.map((t) => {
    const threshold = scoreForRank(t.air);
    return { ...t, threshold, p: clamp(phi((projected - threshold) / sigma), 0.001, 0.995) };
  });

  // Subjects grow in proportion to their own headroom.
  const subjects = Object.fromEntries(
    (Object.keys(inputs.subjectExpected) as SubjectKey[]).map((k) => {
      const now = clamp(inputs.subjectExpected[k], 0, 180);
      return [k, Math.round(Math.min(180, now + (180 - now) * growth))];
    }),
  ) as Record<SubjectKey, number>;

  return {
    projected,
    low: Math.max(0, Math.round(projected - sigma)),
    high: Math.min(720, Math.round(projected + sigma)),
    sigma,
    ceiling: Math.round(ceiling),
    air: est.rank,
    airBest: best.rank,
    airWorst: worst.rank,
    gainVsLast: inputs.lastRealScore === null ? null : projected - inputs.lastRealScore,
    evidence,
    tiers,
    subjects,
  };
}
