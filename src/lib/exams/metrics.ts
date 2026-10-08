import { NEET_PG_RANK_ANCHORS, NEET_PG_TARGETS } from "@/data/exams/neet-pg";
import { zoneTree, type ExamKey, type ExamTree, type TreeSubject } from "@/lib/exams/syllabus";

/**
 * Readiness, coverage and projections for the PG / SS workspaces. Pure and
 * deterministic, safe on the client: switching the zone (subject or chapter)
 * recomputes every figure for that zone. Targets come from exam data, never
 * from your own history.
 */

export type ProgressRow = { itemKey: string; status: string; revisions: number; lastRevisedAt: string | null; questions: number };
export type LogRow = { id: string; logDate: string; subjectKey: string; minutes: number; questions: number; correct: number | null; note: string | null };
export type TestRow = { id: string; name: string; kind: string; takenAt: string; score: number; maxScore: number; correct: number | null; wrong: number | null; skipped: number | null; note: string | null };
export type ErrorRow = { id: string; subjectKey: string; topic: string; reason: string; note: string | null; resolved: boolean; createdAt: string };
export type MoodRow = { energy: number; focus: number; stress: number };
export type Records = { progress: ProgressRow[]; logs: LogRow[]; tests: TestRow[]; errors: ErrorRow[]; moods: MoodRow[] };

export type Part = { key: string; label: string; weight: number; score: number; value: string; note: string; evidence: boolean };

const DAY = 86_400_000;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/* ── Rank model (PG): log-interpolated over share-of-max anchors ─────── */
export function rankForShare(share: number) {
  const a = NEET_PG_RANK_ANCHORS;
  if (share >= a[0].share) return 1;
  for (let i = 0; i < a.length - 1; i++) {
    if (share <= a[i].share && share >= a[i + 1].share) {
      const t = (a[i].share - share) / (a[i].share - a[i + 1].share);
      return Math.round(Math.exp(Math.log(a[i].rank) + t * (Math.log(a[i + 1].rank) - Math.log(a[i].rank))));
    }
  }
  return Math.round(a.at(-1)!.rank * (1 + (a.at(-1)!.share - share) * 6));
}
export function shareForRank(rank: number) {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (rankForShare(mid) > rank) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** What each workspace aims at. SS has no public rank tables, so its bar is a planning prior. */
export function targetsFor(exam: ExamKey) {
  if (exam === "pg") {
    return NEET_PG_TARGETS.map((t) => ({ ...t, share: shareForRank(t.rank) }));
  }
  return [
    { key: "ss-seat", label: "DM/MCh govt seat (planning bar)", rank: 0, share: 0.62, note: "NBEMS publishes no SS rank table — 62% of max is a planning bar, revise when your group's data is in" },
    { key: "ss-top", label: "Top institute (planning bar)", rank: 0, share: 0.72, note: "AIIMS/PGI-level seats need a clear margin" },
  ];
}

export function settleWeights<K extends string>(base: Record<K, number>, mult: Record<K, number>): Record<K, number> {
  const keys = Object.keys(base) as K[];
  const raw = keys.map((k) => base[k] * mult[k]);
  const total = raw.reduce((s, x) => s + x, 0) || 1;
  const exact = raw.map((x) => (x / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((s, x) => s + x, 0);
  for (const { i } of exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)) {
    if (left-- <= 0) break;
    out[i] += 1;
  }
  return Object.fromEntries(keys.map((k, i) => [k, out[i]])) as Record<K, number>;
}

type Key = "syllabus" | "revision" | "tests" | "accuracy" | "practice" | "consistency" | "errors" | "wellbeing";

export function computeWorkspace(input: {
  tree: ExamTree;
  records: Records;
  zone?: { subject?: string | null; chapter?: string | null };
  targetDate?: string | null;
  hoursTarget?: number | null;
  today?: Date;
}) {
  const today = input.today ?? new Date();
  const { tree, records } = input;
  const p = new Map(records.progress.map((r) => [r.itemKey, r]));
  const zoneSubjects = zoneTree(tree, input.zone ?? {});
  const zoneKeys = new Set(zoneSubjects.map((s) => s.key));
  const inZone = (subjectKey: string) => !input.zone?.subject || zoneKeys.has(subjectKey);
  const hoursTarget = input.hoursTarget ?? 12;

  /* ── Coverage by marks ─────────────────────────────────────────────── */
  const subjectStats = (s: TreeSubject) => {
    let marks = 0;
    let done = 0;
    let revised = 0;
    let twice = 0;
    let items = 0;
    let doneItems = 0;
    let revisedItems = 0;
    for (const c of s.chapters)
      for (const it of c.items) {
        const row = p.get(it.key);
        marks += it.marks;
        items += 1;
        if (row?.status === "done") {
          done += it.marks;
          doneItems += 1;
        }
        if ((row?.revisions ?? 0) >= 1) {
          revised += it.marks;
          revisedItems += 1;
        }
        if ((row?.revisions ?? 0) >= 2) twice += it.marks;
      }
    return { key: s.key, name: s.name, group: s.group, hue: s.hue, marks, done, revised, twice, items, doneItems, revisedItems };
  };
  const subjects = zoneSubjects.map(subjectStats);
  const totalMarks = subjects.reduce((s, x) => s + x.marks, 0) || 1;
  const coverage = subjects.reduce((s, x) => s + x.done, 0) / totalMarks;
  const revisedShare = subjects.reduce((s, x) => s + x.revised, 0) / totalMarks;
  const twiceShare = subjects.reduce((s, x) => s + x.twice, 0) / totalMarks;
  const allSubjects = tree.subjects.map(subjectStats);

  /* ── Time & practice ───────────────────────────────────────────────── */
  const logs = records.logs.filter((l) => inZone(l.subjectKey));
  const within = (days: number) => logs.filter((l) => today.getTime() - new Date(`${l.logDate}T00:00:00Z`).getTime() < days * DAY);
  const l28 = within(28);
  const hoursPerDay = l28.reduce((s, l) => s + l.minutes, 0) / 60 / 28;
  const questionsPerDay = l28.reduce((s, l) => s + l.questions, 0) / 28;
  const loggedDays28 = new Set(l28.map((l) => l.logDate)).size;
  const qAttempted = logs.filter((l) => l.correct !== null && l.questions > 0);
  const practiceAccuracy = qAttempted.length ? qAttempted.reduce((s, l) => s + (l.correct ?? 0), 0) / Math.max(1, qAttempted.reduce((s, l) => s + l.questions, 0)) : null;

  /* ── Tests ─────────────────────────────────────────────────────────── */
  const tests = [...records.tests].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  let tw = 0;
  let tv = 0;
  tests.forEach((t, i) => {
    const w = Math.pow(0.75, tests.length - 1 - i);
    tw += w;
    tv += w * (t.maxScore > 0 ? t.score / t.maxScore : 0);
  });
  const testShare = tw ? tv / tw : null;
  const withCounts = tests.filter((t) => (t.correct ?? 0) + (t.wrong ?? 0) > 0);
  const right = withCounts.reduce((s, t) => s + (t.correct ?? 0), 0);
  const wrong = withCounts.reduce((s, t) => s + (t.wrong ?? 0), 0);
  const testAccuracy = right + wrong ? right / (right + wrong) : null;
  const accuracy = testAccuracy ?? practiceAccuracy;
  const tests28 = tests.filter((t) => today.getTime() - new Date(`${t.takenAt}T00:00:00Z`).getTime() < 28 * DAY).length;

  /* ── Errors ────────────────────────────────────────────────────────── */
  const errors = records.errors.filter((e) => inZone(e.subjectKey));
  const resolvedShare = errors.length ? errors.filter((e) => e.resolved).length / errors.length : 0;
  const reasons = Object.entries(
    errors.reduce<Record<string, number>>((m, e) => {
      m[e.reason] = (m[e.reason] ?? 0) + 1;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  /* ── Mood (shared across exams) ────────────────────────────────────── */
  const mood = records.moods.length ? { energy: avg(records.moods.map((m) => m.energy)), focus: avg(records.moods.map((m) => m.focus)), stress: avg(records.moods.map((m) => m.stress)) } : null;

  /* ── Targets ───────────────────────────────────────────────────────── */
  const targets = targetsFor(tree.exam);
  const primary = targets[0];
  const daysToExam = input.targetDate ? Math.max(0, Math.ceil((new Date(`${input.targetDate}T09:00:00+05:30`).getTime() - today.getTime()) / DAY)) : null;

  /* ── Readiness (0–100) ─────────────────────────────────────────────── */
  const phase = daysToExam === null ? 0.3 : clamp((240 - daysToExam) / 180);
  const build = 1.15 - 0.5 * phase;
  const testMult = 0.9 + 0.35 * phase;
  const w = settleWeights<Key>(
    { syllabus: 20, revision: 13, tests: 20, accuracy: 10, practice: 10, consistency: 15, errors: 6, wellbeing: 6 },
    { syllabus: build, revision: testMult, tests: testMult, accuracy: testMult, practice: testMult, consistency: 1, errors: 1, wellbeing: 1 },
  );
  const parts: Part[] = [
    { key: "syllabus", label: "Syllabus covered", weight: w.syllabus, score: clamp(coverage), value: `${Math.round(coverage * 100)}% of the marks`, note: "weighted by subject share of the paper, not topic count", evidence: coverage > 0 },
    { key: "revision", label: "Revision", weight: w.revision, score: clamp(0.65 * clamp(revisedShare / 0.7) + 0.35 * clamp(twiceShare / 0.5)), value: `${Math.round(revisedShare * 100)}% revised · ${Math.round(twiceShare * 100)}% twice`, note: "PG/SS are won on the 2nd and 3rd revision — aim 70% once, 50% twice", evidence: revisedShare > 0 },
    { key: "tests", label: "Test scores", weight: w.tests, score: testShare === null ? 0 : clamp(testShare / primary.share) * (0.5 + 0.5 * clamp(tests.length / 6)), value: testShare === null ? "no tests logged" : `${Math.round(testShare * 100)}% recent level`, note: `${primary.label}: ~${Math.round(primary.share * 100)}% of max · full weight at 6 tests`, evidence: testShare !== null },
    { key: "accuracy", label: "Accuracy", weight: w.accuracy, score: accuracy === null ? 0 : clamp((accuracy - 0.55) / 0.3), value: accuracy === null ? "not measured" : `${Math.round(accuracy * 100)}% right`, note: "+4/−1: 55% earns nothing here, 85% is full marks", evidence: accuracy !== null },
    { key: "practice", label: "MCQ practice", weight: w.practice, score: clamp(0.65 * clamp(questionsPerDay / 200) + 0.35 * clamp(tests28 / 4)), value: `${Math.round(questionsPerDay)} a day · ${tests28} tests in 4 weeks`, note: "200 MCQs a day and a grand test every week", evidence: questionsPerDay > 0 || tests28 > 0 },
    { key: "consistency", label: "Consistency", weight: w.consistency, score: clamp(0.55 * clamp(hoursPerDay / hoursTarget) + 0.45 * clamp(loggedDays28 / 28)), value: `${hoursPerDay.toFixed(1)}h a day · ${loggedDays28}/28 days`, note: `push-hard benchmark: ${hoursTarget}h a day, every day logged`, evidence: loggedDays28 > 0 },
    { key: "errors", label: "Error closure", weight: w.errors, score: resolvedShare, value: errors.length ? `${errors.filter((e) => e.resolved).length}/${errors.length} mistakes closed` : "no mistakes logged", note: "log every wrong answer, close it with a fix", evidence: errors.length > 0 },
    { key: "wellbeing", label: "Energy & calm", weight: w.wellbeing, score: mood ? clamp(0.35 * (mood.energy / 10) + 0.35 * (mood.focus / 10) + 0.3 * (1 - mood.stress / 10)) : 0, value: mood ? `energy ${Math.round(mood.energy)} · focus ${Math.round(mood.focus)} · stress ${Math.round(mood.stress)}` : "not logged", note: "shared with your mood tracker", evidence: mood !== null },
  ];
  const readiness = Math.round(parts.reduce((s, x) => s + x.weight * x.score, 0));
  const lever = [...parts].sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score))[0];

  /* ── Heatmap (last 26 weeks) & weekly series ───────────────────────── */
  const minutesByDay = new Map<string, number>();
  for (const l of logs) minutesByDay.set(l.logDate, (minutesByDay.get(l.logDate) ?? 0) + l.minutes);
  const calendar = Array.from({ length: 26 * 7 }, (_, i) => {
    const d = new Date(today.getTime() - (26 * 7 - 1 - i) * DAY);
    const k = dayKey(d);
    return { date: k, minutes: minutesByDay.get(k) ?? 0 };
  });

  return {
    readiness,
    band: readiness >= 85 ? "Exam-ready" : readiness >= 70 ? "Strong" : readiness >= 50 ? "Competitive" : readiness >= 30 ? "Building" : "Foundation",
    parts,
    lever: lever ? { label: lever.label, points: Math.round(lever.weight * (1 - lever.score)) } : null,
    coverage,
    revisedShare,
    twiceShare,
    subjects,
    allSubjects,
    hoursPerDay,
    questionsPerDay,
    loggedDays28,
    accuracy,
    testShare,
    tests,
    tests28,
    errors,
    reasons,
    targets,
    daysToExam,
    calendar,
    projectedRank: tree.exam === "pg" && testShare !== null ? rankForShare(testShare) : null,
  };
}

export type WorkspaceMetrics = ReturnType<typeof computeWorkspace>;

/* ── What-if: levers → projected share, rank and target odds ─────────── */
export type Levers = { hoursPerDay: number; questionsPerDay: number; testsPerWeek: number; accuracy: number; revision: number };

function phi(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function runExamWhatIf(exam: ExamKey, levers: Levers, state: { currentShare: number; daysToExam: number | null; tests: number }) {
  const months = (state.daysToExam ?? 240) / 30.4;
  const effort =
    0.4 * clamp(levers.hoursPerDay / 12, 0, 1.25) +
    0.3 * clamp(levers.questionsPerDay / 200, 0, 1.25) +
    0.15 * clamp(levers.testsPerWeek / 1.5, 0, 1.25) +
    0.15 * clamp(levers.revision, 0, 1);
  const growth = 1 - Math.exp(-0.11 * effort * months);
  const ceiling = 0.95 * (5 * clamp(levers.accuracy, 0.2, 1) - 1) / 4;
  const raw = state.currentShare + (Math.max(state.currentShare, ceiling) - state.currentShare) * growth;
  const projected = Math.min(raw, ceiling - 0.03 * Math.exp(-(ceiling - raw) / 0.03));
  const sigma = 0.035 + 0.06 * (1 - clamp(state.tests / 8)) + 0.02 * clamp(months / 8);
  const targets = targetsFor(exam).map((t) => ({ ...t, p: clamp(phi((projected - t.share) / sigma), 0.001, 0.995) }));
  return { projected: Math.max(0, projected), ceiling, sigma, rank: exam === "pg" ? rankForShare(projected) : null, targets };
}
