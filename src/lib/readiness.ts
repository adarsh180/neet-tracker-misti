/**
 * NEET readiness today — a 0–100 index of how prepared Misti is right now
 * (not a projection). Each part is scored 0..1 from live records and carries a
 * fixed weight; a part with no evidence scores zero and says so.
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
};

export type SyllabusSubject = { key: string; slug: string; topics: number; done: number; revised: number };
export type SyllabusCompletion = {
  topics: number;
  done: number;
  revised: number; // topics revised at least once
  fresh: number; // topics revised in the last 14 days
  completion: number; // done / topics
  revisedShare: number; // revised / topics
  subjects: SyllabusSubject[];
};

export type ReadinessInput = {
  syllabus: SyllabusCompletion;
  mockLevel: number | null; // recency-weighted score out of 720
  testCount: number;
  govtThreshold: number; // score that usually lands a govt MBBS seat
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

export function computeReadiness(i: ReadinessInput): Readiness {
  const s = i.syllabus;
  const parts: ReadinessPart[] = [
    {
      key: "syllabus",
      label: "Syllabus done",
      weight: 22,
      score: clamp(s.completion),
      value: `${pct(s.completion)} of topics`,
      note: `${s.done} of ${s.topics} topics ticked across all four subjects`,
      href: `/subjects/${[...s.subjects].sort((a, b) => a.done / Math.max(1, a.topics) - b.done / Math.max(1, b.topics))[0]?.slug ?? "physics"}`,
      evidence: s.done > 0,
    },
    {
      key: "revision",
      label: "Revision",
      weight: 13,
      // Share of the whole syllabus revised at least once (60% is full marks),
      // plus how much of that revision is still fresh (last 14 days).
      score: clamp(0.7 * clamp(s.revisedShare / 0.6) + 0.3 * (s.revised ? s.fresh / s.revised : 0)),
      value: `${s.revised} topics revised`,
      note: `${pct(s.revisedShare)} of the syllabus · ${s.fresh} revised in the last 14 days · aim 60%`,
      href: "/reviews",
      evidence: s.revised > 0,
    },
    {
      key: "mocks",
      label: "Mock scores",
      weight: 18,
      // Against the score that usually lands a government seat; a handful of
      // tests counts for less until there are six.
      score: i.mockLevel === null ? 0 : clamp(i.mockLevel / i.govtThreshold) * (0.5 + 0.5 * clamp(i.testCount / 6)),
      value: i.mockLevel === null ? "no tests logged" : `~${Math.round(i.mockLevel)}/720 recent level`,
      note: `Govt MBBS needs ~${i.govtThreshold} · from ${i.testCount} test${i.testCount === 1 ? "" : "s"}, full weight at 6`,
      href: "/tests",
      evidence: i.mockLevel !== null,
    },
    {
      key: "accuracy",
      label: "Accuracy",
      weight: 9,
      // NEET punishes guessing: 60% earns nothing here, 95% is full marks.
      score: i.accuracy === null ? 0 : clamp((i.accuracy - 0.6) / 0.35),
      value: i.accuracy === null ? "not measured" : `${pct(i.accuracy)} right`,
      note: "60% scores nothing, 95%+ is full marks",
      href: "/tests/error-log",
      evidence: i.accuracy !== null,
    },
    {
      key: "practice",
      label: "MCQ practice",
      weight: 9,
      score: clamp(0.7 * clamp(i.questionsPerDay28 / 150) + 0.3 * clamp(i.mocks28 / 4)),
      value: `${Math.round(i.questionsPerDay28)} a day · ${i.mocks28} full mocks in 4 weeks`,
      note: "150 MCQs a day and a full mock every week",
      href: "/practice",
      evidence: i.questionsPerDay28 > 0 || i.mocks28 > 0,
    },
    {
      key: "chapters",
      label: "Chapter strength",
      weight: 9,
      score: clamp(i.chapterMarks / i.govtThreshold),
      value: `~${Math.round(i.chapterMarks)}/720 from chapter mastery`,
      note: "marks your chapters can hold today, against the govt seat score",
      href: `/subjects/${i.weakestSlug}`,
      evidence: i.chapterMarks > 0,
    },
    {
      key: "consistency",
      label: "Consistency",
      weight: 15,
      score: clamp(0.55 * clamp(i.hoursPerDay28 / 8) + 0.45 * clamp(i.loggedDays28 / 28)),
      value: `${i.hoursPerDay28.toFixed(1)}h a day · ${i.loggedDays28}/28 days`,
      note: "8h a day, every day logged",
      href: "/daily-goals",
      evidence: i.loggedDays28 > 0,
    },
    {
      key: "wellbeing",
      label: "Energy & calm",
      weight: 5,
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
  };
}
