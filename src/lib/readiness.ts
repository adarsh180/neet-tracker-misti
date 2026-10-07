/**
 * NEET readiness today — a 0–100 index of how prepared Misti is right now for
 * her real goal (AIIMS Delhi / AIIMS Rishikesh MBBS), not a projection.
 *
 * Basis for every number:
 *  · Paper: NTA NEET UG — 180 questions, 720 marks, +4/−1, Biology 360,
 *    Physics 180, Chemistry 180 (no optional section since 2025).
 *  · Syllabus weight: each chapter's PYQ frequency on the NMC syllabus
 *    (deleted chapters carry nothing), so a topic counts for the marks it
 *    actually brings — not one vote per topic.
 *  · Targets: scores for AIR 900 (AIIMS Rishikesh tier) and AIR 50 (AIIMS
 *    Delhi) from the marks-vs-rank calibration blending 2020–2026, with 2025
 *    (tough) and 2026 (high-scoring) weighted equally; a govt seat (General,
 *    AIQ last round 2025 ≈ AIR 26k) is the safety floor only.
 *  · Weights shift with the calendar: early on, building the syllabus counts
 *    more; in the last months, mocks, accuracy and revision take over.
 * Each part is scored 0..1 from live records; a part with no evidence scores
 * zero and says so.
 */

export type ReadinessPart = {
  key: string;
  label: string;
  weight: number;
  score: number; // 0..1
  value: string;
  note: string;
  href: string;
  evidence: boolean;
};

export type Readiness = {
  score: number;
  band: string;
  parts: ReadinessPart[];
  lever: { key: string; label: string; points: number } | null;
  basis: string;
};

/** One syllabus topic, as a colony in the dish. `marks` = exam marks it carries. */
export type SyllabusTopic = { name: string; chapter: string; done: boolean; revised: boolean; fresh: boolean; questions: number; marks: number };
export type SyllabusSubject = {
  key: string;
  slug: string;
  topics: number;
  done: number;
  revised: number;
  marksTotal: number;
  marksDone: number;
  items: SyllabusTopic[];
};
export type SyllabusCompletion = {
  topics: number;
  done: number;
  revised: number; // topics revised at least once
  fresh: number; // topics revised in the last 14 days
  completion: number; // done / topics
  revisedShare: number; // revised / topics
  marksDone: number; // exam marks (of 720) whose chapters are done
  marksRevised: number; // exam marks whose chapters were revised
  marksShare: number; // marksDone / 720
  gaps: Array<{ subject: string; chapter: string; marks: number }>;
  subjects: SyllabusSubject[];
};

export type ReadinessInput = {
  syllabus: SyllabusCompletion;
  daysToExam: number;
  mockLevel: number | null; // recency-weighted score out of 720
  testCount: number;
  targetScore: number; // AIIMS Rishikesh tier
  aiimsScore: number; // AIIMS Delhi
  floorScore: number; // any govt MBBS seat
  accuracy: number | null;
  questionsPerDay28: number;
  mocks28: number;
  chapterMarks: number; // marks the chapter-mastery model expects today, out of 720
  weakestSlug: string;
  hoursPerDay28: number;
  loggedDays28: number;
  mood: { energy: number; focus: number; stress: number } | null;
};

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function bandFor(score: number) {
  if (score >= 85) return "Exam-ready";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Competitive";
  if (score >= 30) return "Building";
  return "Foundation";
}

/** Scale base weights by group multipliers and round them to exactly 100. */
export function settleWeights<K extends string>(base: Record<K, number>, mult: Record<K, number>): Record<K, number> {
  const keys = Object.keys(base) as K[];
  const raw = keys.map((k) => base[k] * mult[k]);
  const total = raw.reduce((s, x) => s + x, 0) || 1;
  const exact = raw.map((x) => (x / total) * 100);
  const floor = exact.map(Math.floor);
  let left = 100 - floor.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (left <= 0) break;
    floor[i] += 1;
    left -= 1;
  }
  return Object.fromEntries(keys.map((k, i) => [k, floor[i]])) as Record<K, number>;
}

type Key = "syllabus" | "revision" | "mocks" | "accuracy" | "practice" | "chapters" | "consistency" | "wellbeing";

export function computeReadiness(i: ReadinessInput): Readiness {
  const s = i.syllabus;
  // 0 while the exam is 8+ months out, 1 in the final two months.
  const phase = clamp((240 - i.daysToExam) / 180);
  const build = 1.15 - 0.5 * phase;
  const test = 0.9 + 0.35 * phase;
  const w = settleWeights<Key>(
    { syllabus: 18, revision: 13, mocks: 20, accuracy: 11, practice: 10, chapters: 10, consistency: 14, wellbeing: 4 },
    { syllabus: build, chapters: build, revision: test, mocks: test, accuracy: test, practice: test, consistency: 1, wellbeing: 1 },
  );

  const parts: ReadinessPart[] = [
    {
      key: "syllabus",
      label: "Syllabus done",
      weight: w.syllabus,
      score: clamp(s.marksShare),
      value: `~${Math.round(s.marksDone)}/720 marks of chapters done`,
      note: `weighted by how often NEET asks each chapter · ${s.done}/${s.topics} topics ticked`,
      href: `/subjects/${[...s.subjects].sort((a, b) => a.marksDone / Math.max(1, a.marksTotal) - b.marksDone / Math.max(1, b.marksTotal))[0]?.slug ?? "physics"}`,
      evidence: s.done > 0,
    },
    {
      key: "revision",
      label: "Revision",
      weight: w.revision,
      // Marks-weighted share of the paper revised at least once (60% is full
      // marks), plus how much of it is still fresh (last 14 days).
      score: clamp(0.7 * clamp(s.marksRevised / 720 / 0.6) + 0.3 * (s.revised ? s.fresh / s.revised : 0)),
      value: `${s.revised} topics revised · ~${Math.round(s.marksRevised)} marks`,
      note: `${s.fresh} revised in the last 14 days · aim: 60% of the paper's marks revised`,
      href: "/reviews",
      evidence: s.revised > 0,
    },
    {
      key: "mocks",
      label: "Mock scores",
      weight: w.mocks,
      // Against the AIIMS Rishikesh-tier score; a handful of tests counts for
      // less until there are six.
      score: i.mockLevel === null ? 0 : clamp(i.mockLevel / i.targetScore) * (0.5 + 0.5 * clamp(i.testCount / 6)),
      value: i.mockLevel === null ? "no tests logged" : `~${Math.round(i.mockLevel)}/720 recent level`,
      note: `AIIMS Rishikesh ~${i.targetScore} · AIIMS Delhi ~${i.aiimsScore} · govt floor ~${i.floorScore} · full weight at 6 tests`,
      href: "/tests",
      evidence: i.mockLevel !== null,
    },
    {
      key: "accuracy",
      label: "Accuracy",
      weight: w.accuracy,
      // At +4/−1, an AIIMS score leaves room for only a handful of errors:
      // 70% earns nothing here, 97% is full marks.
      score: i.accuracy === null ? 0 : clamp((i.accuracy - 0.7) / 0.27),
      value: i.accuracy === null ? "not measured" : `${pct(i.accuracy)} right`,
      note: "AIIMS-level papers need ~97% of attempts right",
      href: "/tests/error-log",
      evidence: i.accuracy !== null,
    },
    {
      key: "practice",
      label: "MCQ practice",
      weight: w.practice,
      score: clamp(0.65 * clamp(i.questionsPerDay28 / 200) + 0.35 * clamp(i.mocks28 / 6)),
      value: `${Math.round(i.questionsPerDay28)} a day · ${i.mocks28} full mocks in 4 weeks`,
      note: "AIIMS pace: 200 MCQs a day and 6 full mocks a month",
      href: "/practice",
      evidence: i.questionsPerDay28 > 0 || i.mocks28 > 0,
    },
    {
      key: "chapters",
      label: "Chapter strength",
      weight: w.chapters,
      score: clamp(i.chapterMarks / i.targetScore),
      value: `~${Math.round(i.chapterMarks)}/720 from chapter mastery`,
      note: "marks your chapters can hold today, against the AIIMS Rishikesh score",
      href: `/subjects/${i.weakestSlug}`,
      evidence: i.chapterMarks > 0,
    },
    {
      key: "consistency",
      label: "Consistency",
      weight: w.consistency,
      score: clamp(0.55 * clamp(i.hoursPerDay28 / 12) + 0.45 * clamp(i.loggedDays28 / 28)),
      value: `${i.hoursPerDay28.toFixed(1)}h a day · ${i.loggedDays28}/28 days`,
      note: "push-hard benchmark: 12h a day, every day logged",
      href: "/daily-goals",
      evidence: i.loggedDays28 > 0,
    },
    {
      key: "wellbeing",
      label: "Energy & calm",
      weight: w.wellbeing,
      score: i.mood === null ? 0 : clamp(0.35 * (i.mood.energy / 10) + 0.35 * (i.mood.focus / 10) + 0.3 * (1 - i.mood.stress / 10)),
      value: i.mood === null ? "not logged" : `energy ${Math.round(i.mood.energy)} · focus ${Math.round(i.mood.focus)} · stress ${Math.round(i.mood.stress)}`,
      note: "from recent mood check-ins, out of 10",
      href: "/mood",
      evidence: i.mood !== null,
    },
  ];
  const score = Math.round(parts.reduce((sum, p) => sum + p.weight * p.score, 0));
  const top = [...parts].sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score))[0];
  return {
    score,
    band: bandFor(score),
    parts,
    lever: top ? { key: top.key, label: top.label, points: Math.round(top.weight * (1 - top.score)) } : null,
    basis:
      phase < 0.5
        ? "Measured against AIIMS. Building the syllabus still carries extra weight; mocks and revision take over as May nears."
        : "Measured against AIIMS. In the final stretch, mocks, accuracy and revision carry most of the score.",
  };
}
