import "server-only";

import { buildAIContext } from "@/lib/ai-context-builder";
import { db } from "@/lib/db";
import { MISTI_PREVIOUS_ATTEMPTS } from "@/lib/neet-rank-calibration";
import { buildChapterRankIntelligence } from "@/lib/neet-rank-intelligence";
import type { SeatInputs, SeatLevers, SubjectKey } from "@/lib/seat-model";

/**
 * Everything the Pulse dashboard draws, computed from live records. Plain JSON
 * so client instruments can take it straight from /api/insights/pulse.
 */

const DAY = 86_400_000;
const EXAM = "2027-05-02T09:00:00+05:30";
const SUBJECTS: SubjectKey[] = ["Physics", "Chemistry", "Botany", "Zoology"];

export type PulseDay = { date: string; hours: number; questions: number; discipline: number };
export type PulseTest = {
  id: string;
  name: string;
  type: string;
  date: string;
  score720: number;
  pct: number;
  correct: number | null;
  wrong: number | null;
  skipped: number | null;
  negLost: number;
  stamina: number | null;
  subjects: Partial<Record<SubjectKey, number>>;
};
export type PulseRisk = { id: string; severity: "high" | "medium" | "low"; title: string; detail: string; href: string };
export type PulseChapter = { subject: SubjectKey; chapter: string; damage: number; mastery: number; completion: number; priority: string };

export type PulseInsights = {
  generatedAt: string;
  exam: string;
  daysToExam: number;
  student: string;
  model: { inputs: SeatInputs; observed: SeatLevers };
  attempts: Array<{ year: number; score: number }>;
  days: PulseDay[];
  tests: PulseTest[];
  today: { hours: number; questions: number; streak: number };
  totals: { hours: number; questions: number; loggedDays: number; avgHours28: number; avgQuestions28: number };
  subjects: Array<{ key: SubjectKey; slug: string; completion: number; expected: number; damage: number; pendingRevisions: number; topics: number; done: number }>;
  chapters: PulseChapter[];
  risks: PulseRisk[];
  wins: string[];
  dataHealthy: boolean;
};

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function getPulseInsights(): Promise<PulseInsights> {
  const now = new Date();
  const [context, goals, tests] = await Promise.all([
    buildAIContext("misti"),
    db.dailyGoal.findMany({ select: { date: true, hoursStudied: true, questionsSolved: true, disciplineScore: true }, orderBy: { date: "asc" } }),
    db.testRecord.findMany({ orderBy: { takenAt: "asc" } }),
  ]);
  const intel = buildChapterRankIntelligence(context);
  const daysToExam = Math.max(0, Math.ceil((new Date(EXAM).getTime() - now.getTime()) / DAY));

  /* ── Days (subject rows rolled up per date) ─────────────────────── */
  const byDay = new Map<string, PulseDay>();
  for (const g of goals) {
    const key = dateKey(g.date);
    const d = byDay.get(key) ?? { date: key, hours: 0, questions: 0, discipline: 0 };
    d.hours += g.hoursStudied;
    d.questions += g.questionsSolved;
    d.discipline = Math.max(d.discipline, g.disciplineScore);
    byDay.set(key, d);
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, hours: Math.round(d.hours * 100) / 100 }));
  const today = istToday();
  const window = (len: number, from = 0) => {
    let h = 0;
    let q = 0;
    for (let i = from; i < from + len; i++) {
      const d = byDay.get(shiftKey(today, -i));
      h += d?.hours ?? 0;
      q += d?.questions ?? 0;
    }
    return { h: h / len, q: q / len };
  };
  const w28 = window(28);
  let streak = 0;
  for (let i = byDay.has(today) ? 0 : 1; byDay.has(shiftKey(today, -i)) && (byDay.get(shiftKey(today, -i))!.hours > 0); i++) streak++;

  /* ── Tests ──────────────────────────────────────────────────────── */
  const pulseTests: PulseTest[] = tests.map((t) => ({
    id: t.id,
    name: t.testName,
    type: t.testType,
    date: dateKey(t.takenAt),
    score720: t.maxScore > 0 ? Math.round((t.score / t.maxScore) * 720) : 0,
    pct: t.maxScore > 0 ? t.score / t.maxScore : 0,
    correct: t.correctCount,
    wrong: t.wrongCount,
    skipped: t.skippedCount,
    negLost: t.negativeMarksLost ?? (t.wrongCount ?? 0),
    stamina: t.staminaDecay,
    subjects: {
      Physics: t.physicsScore ?? undefined,
      Chemistry: t.chemistryScore ?? undefined,
      Botany: t.botanyScore ?? undefined,
      Zoology: t.zoologyScore ?? undefined,
    },
  }));
  const fulls = tests.filter((t) => t.testType === "FULL_LENGTH" || t.testType === "AITS" || t.maxScore >= 700);
  let wSum = 0;
  let wScore = 0;
  fulls.forEach((t, i) => {
    const w = Math.pow(0.7, fulls.length - 1 - i);
    wSum += w;
    wScore += w * (t.score / Math.max(1, t.maxScore)) * 720;
  });
  const mockLevel = wSum ? wScore / wSum : null;
  const chapterLevel = intel.smartScore;
  const lastReal = MISTI_PREVIOUS_ATTEMPTS.at(-1)?.score ?? null;
  let currentScore: number;
  let currentBasis: SeatInputs["currentBasis"];
  if (mockLevel !== null) {
    const w = fulls.length / (fulls.length + 3);
    currentScore = w * mockLevel + (1 - w) * Math.max(chapterLevel, lastReal ?? 0);
    currentBasis = "mocks";
  } else if (chapterLevel > 0) {
    currentScore = 0.5 * chapterLevel + 0.5 * (lastReal ?? chapterLevel);
    currentBasis = "chapters";
  } else {
    currentScore = lastReal ?? 0;
    currentBasis = "last-attempt";
  }
  const withCounts = tests.filter((t) => (t.correctCount ?? 0) + (t.wrongCount ?? 0) > 0);
  const right = withCounts.reduce((s, t) => s + (t.correctCount ?? 0), 0);
  const wrong = withCounts.reduce((s, t) => s + (t.wrongCount ?? 0), 0);
  const skipped = withCounts.reduce((s, t) => s + (t.skippedCount ?? 0), 0);
  const observedAccuracy = right + wrong ? right / (right + wrong) : null;
  const observedAttemptRate = right + wrong + skipped ? (right + wrong) / (right + wrong + skipped) : null;
  const mocks28 = fulls.filter((t) => t.takenAt.getTime() >= now.getTime() - 28 * DAY).length;

  /* ── Subjects ───────────────────────────────────────────────────── */
  const completedTopics = context.subjects.reduce((s, x) => s + x.completedTopics, 0);
  const pending = context.subjects.reduce((s, x) => s + x.pendingRevisions, 0);
  const revisionHealth = completedTopics ? Math.max(0, 1 - pending / completedTopics) : 0;
  const subjects = SUBJECTS.map((key) => {
    const s = context.subjects.find((x) => x.name === key);
    const sig = intel.subjectSignals.find((x) => x.subject === key);
    return {
      key,
      slug: s?.slug ?? key.toLowerCase(),
      completion: s && s.totalTopics ? s.completedTopics / s.totalTopics : 0,
      expected: sig?.expectedMarks ?? 0,
      damage: sig?.damageMarks ?? 0,
      pendingRevisions: s?.pendingRevisions ?? 0,
      topics: s?.totalTopics ?? 0,
      done: s?.completedTopics ?? 0,
    };
  });

  const inputs: SeatInputs = {
    daysToExam,
    currentScore: Math.round(currentScore),
    currentBasis,
    lastRealScore: lastReal,
    mockCount: fulls.length,
    observedAccuracy,
    observedAttemptRate,
    revisionHealth,
    subjectExpected: Object.fromEntries(subjects.map((s) => [s.key, s.expected])) as Record<SubjectKey, number>,
  };
  const observed: SeatLevers = {
    hoursPerDay: Math.round(w28.h * 4) / 4,
    questionsPerDay: Math.round(w28.q / 5) * 5,
    mocksPerWeek: Math.round((mocks28 / 4) * 2) / 2,
    accuracy: Math.round((observedAccuracy ?? 0.72) * 100) / 100,
    revision: Math.round(revisionHealth * 100) / 100,
  };

  /* ── Risk register (NEET-specific) ──────────────────────────────── */
  const risks: PulseRisk[] = [];
  if (observedAccuracy !== null && observedAccuracy < 0.85) {
    const lost = wrong * 5; // −1 each, plus the +4 not earned
    risks.push({
      id: "accuracy",
      severity: observedAccuracy < 0.75 ? "high" : "medium",
      title: "Wrong answers cost you five marks each",
      detail: `${Math.round(observedAccuracy * 100)}% accuracy across logged tests — ${wrong} wrong answers swung ${Math.round(lost)} marks (−1 each and the +4 you didn't get). Below 90% accuracy, skipping beats guessing.`,
      href: "/tests/error-log",
    });
  }
  const weakest = [...subjects].sort((a, b) => b.damage - a.damage)[0];
  if (weakest && weakest.damage >= 14) {
    risks.push({
      id: "leak",
      severity: weakest.damage >= 28 ? "high" : "medium",
      title: `${weakest.key} is leaking marks`,
      detail: `About ${weakest.damage} of ${weakest.key}'s 180 marks are at risk from weak chapters. Fixing the top chapters below gives the fastest rank movement.`,
      href: `/subjects/${weakest.slug}`,
    });
  }
  if (mocks28 < 4) {
    risks.push({
      id: "mocks",
      severity: daysToExam < 150 ? "high" : "medium",
      title: "Not enough full-length mocks",
      detail: `${mocks28} full-length test${mocks28 === 1 ? "" : "s"} in the last four weeks. NEET is three hours of stamina — aim for one a week now and two a week from February.`,
      href: "/practice",
    });
  }
  const completion = context.overallCompletion / 100;
  const neededPerDay = daysToExam ? (1 - completion) / daysToExam : 0;
  if (completion < 0.9 && neededPerDay > 0.0015) {
    risks.push({
      id: "syllabus",
      severity: completion < 0.5 ? "high" : "medium",
      title: "Syllabus still has gaps",
      detail: `${Math.round(completion * 100)}% of topics complete with ${daysToExam} days left. Keep at least ${Math.max(1, Math.ceil((neededPerDay * subjects.reduce((s, x) => s + x.topics, 0)) * 7))} topics a week moving to finish with a revision buffer.`,
      href: `/subjects/${(([...subjects].sort((a, b) => a.completion - b.completion)[0]) ?? subjects[0]).slug}`,
    });
  }
  if (pending > 10) {
    risks.push({
      id: "revision",
      severity: pending > 40 ? "high" : "medium",
      title: "Revision debt is piling up",
      detail: `${pending} topic revisions are due. NCERT lines fade fast — clear the review queue before adding new chapters.`,
      href: "/reviews",
    });
  }
  if (w28.q < 120) {
    risks.push({
      id: "questions",
      severity: "medium",
      title: "Question practice is light",
      detail: `${Math.round(w28.q)} questions a day over the last four weeks. Toppers live at 150–250 MCQs a day.`,
      href: "/practice",
    });
  }
  const last7 = window(7);
  const prev7 = window(7, 7);
  if (prev7.h > 0 && last7.h < prev7.h * 0.8) {
    risks.push({ id: "dip", severity: "low", title: "Hours dipped this week", detail: `${last7.h.toFixed(1)}h a day this week against ${prev7.h.toFixed(1)}h the week before.`, href: "/daily-goals" });
  }
  if (context.screenTimeSummary.avgDistractionPerDay >= 2) {
    risks.push({ id: "screen", severity: context.screenTimeSummary.avgDistractionPerDay >= 3.5 ? "high" : "medium", title: "Phone time is eating study time", detail: `${context.screenTimeSummary.avgDistractionPerDay}h a day on distractions${context.screenTimeSummary.topApp ? `, mostly ${context.screenTimeSummary.topApp}` : ""}.`, href: "/daily-goals" });
  }
  const tired = tests.filter((t) => (t.staminaDecay ?? 0) >= 7).length;
  if (tired >= 2) {
    risks.push({ id: "stamina", severity: "low", title: "Stamina fades late in tests", detail: `${tired} tests logged with heavy fatigue. Practise the last hour — Biology is where tired minds drop easy marks.`, href: "/tests" });
  }
  if (context.moodSummary.avgStress >= 7) {
    risks.push({ id: "stress", severity: "medium", title: "Stress is running high", detail: `Average stress ${context.moodSummary.avgStress}/10 in recent check-ins. Protect sleep before adding hours.`, href: "/mood" });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  risks.sort((a, b) => order[a.severity] - order[b.severity]);

  const wins: string[] = [];
  const best = [...subjects].sort((a, b) => b.expected - a.expected)[0];
  if (best && best.expected > 0) wins.push(`${best.key} is your strongest paper — about ${best.expected}/180 today.`);
  if (lastReal !== null && MISTI_PREVIOUS_ATTEMPTS.length > 1) {
    const first = MISTI_PREVIOUS_ATTEMPTS[0].score;
    wins.push(`Real NEET scores climbed ${first} → ${lastReal} across ${MISTI_PREVIOUS_ATTEMPTS.length} attempts.`);
  }
  if (w28.h >= 7) wins.push(`${w28.h.toFixed(1)} hours a day across the last four weeks.`);
  if (streak >= 3) wins.push(`${streak}-day logging streak — keep the line unbroken.`);

  return {
    generatedAt: now.toISOString(),
    exam: EXAM,
    daysToExam,
    student: context.student.name || "Misti",
    model: { inputs, observed },
    attempts: MISTI_PREVIOUS_ATTEMPTS.map((a) => ({ year: a.year, score: a.score })),
    days,
    tests: pulseTests,
    today: { hours: byDay.get(today)?.hours ?? 0, questions: byDay.get(today)?.questions ?? 0, streak },
    totals: {
      hours: days.reduce((s, d) => s + d.hours, 0),
      questions: days.reduce((s, d) => s + d.questions, 0),
      loggedDays: days.length,
      avgHours28: w28.h,
      avgQuestions28: w28.q,
    },
    subjects,
    chapters: intel.chapterSignals.slice(0, 8).map((c) => ({
      subject: c.subject,
      chapter: c.chapter,
      damage: c.damageMarks,
      mastery: c.mastery,
      completion: c.completionPct,
      priority: c.priority,
    })),
    risks,
    wins,
    dataHealthy: context.dataHealth?.databaseAvailable !== false,
  };
}

export const pulseAvg = avg;
