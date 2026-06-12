import type { BankQuestion, Prisma, ReviewCard } from "@prisma/client";

import { db } from "@/lib/db";
import { chatWithAI } from "@/lib/openrouter";
import { sendWebPushNotification } from "@/lib/web-push";
import { getISTDateString } from "@/lib/daily-planner";

/**
 * Review Agent - weekly & monthly report cards with an integrity audit.
 *
 * On the agent heartbeat (the daily 05:00 IST cron) it checks whether the most
 * recently completed week (Mon-Sun, IST) and calendar month have a review card.
 * If not, it:
 *  1. aggregates everything she logged in that period (goals, screen time, mood,
 *     tests, error log, topics completed, revisions),
 *  2. runs deterministic forensics over the logs (backfilled entries, implausible
 *     hours, template logging, hours without output, discipline vs screen-time
 *     contradictions, ...),
 *  3. has the AI write the review card, then assembles a bank-first
 *     option-based Truth Check from studied chapters/topics plus a small
 *     AI/data-probe tail,
 *  4. notifies the panel + every push device: "Weekly/Monthly review is ready".
 *
 * When she submits her answers, the agent cross-examines them against the data
 * and the forensic signals, scores her integrity, and answers back - warm and
 * firm if honest, an unambiguous scolding if the logs were faked.
 */

export const REVIEW_SENDER_LABEL = "Review Agent";
const REVIEW_AI_TIMEOUT_MS = 300000;

const REVIEW_INTEGRITY_POLICY = {
  WEEKLY: { total: 20, bank: 17, ai: 3 },
  MONTHLY: { total: 30, bank: 24, ai: 6 },
} as const;

export type ReviewPeriod = "WEEKLY" | "MONTHLY";

export type IntegritySignal = {
  code: string;
  severity: 1 | 2 | 3;
  detail: string;
};

export type IntegrityQuestion = {
  id: string;
  question: string;
  options: string[];
  /** Private: index of the data-consistent option; null for self-report probes. */
  expectedOptionIndex: number | null;
  /** Private: the data fact this question checks. Never sent to the client. */
  evidence: string;
  signal?: string | null;
};

export type ReviewContent = {
  title: string;
  summary: string;
  grade: string;
  wins: string[];
  gaps: string[];
  subjectBreakdown: { subject: string; hours: number; questions: number; verdictLine: string }[];
  trend: { hoursDelta: number; questionsDelta: number; line: string };
  focusForNextPeriod: string[];
  integritySignals: { detail: string; severity: number }[];
  /** Exact period totals, set deterministically from the data (never by the AI). */
  metrics?: {
    hours: number;
    questions: number;
    activeDays: number;
    periodDays: number;
    topicsCompleted: number;
    revisions: number;
    testsTaken: number;
    avgTestPercentage: number | null;
    distractionHours: number;
  };
};

export type ReviewVerdict = {
  integrityScore: number;
  verdict: "HONEST" | "MOSTLY_HONEST" | "INCONSISTENT" | "FAKING";
  perQuestion: { id: string; consistent: boolean | null; note: string }[];
  message: string;
  consequence: string;
};

export type ReviewAnswer = { id: string; optionIndex: number };

// ---------------------------------------------------------------------------
// IST period math
// ---------------------------------------------------------------------------

function addDaysISO(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function lastCompletedWeek(todayISO: string) {
  const monIndexed = (new Date(`${todayISO}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const thisMonday = addDaysISO(todayISO, -monIndexed);
  const start = addDaysISO(thisMonday, -7);
  return { start, end: addDaysISO(thisMonday, -1), key: start };
}

export function lastCompletedMonth(todayISO: string) {
  const [year, month] = todayISO.split("-").map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const mm = String(prevMonth).padStart(2, "0");
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  return {
    start: `${prevYear}-${mm}-01`,
    end: `${prevYear}-${mm}-${String(lastDay).padStart(2, "0")}`,
    key: `${prevYear}-${mm}`,
  };
}

// ---------------------------------------------------------------------------
// Period data + forensics
// ---------------------------------------------------------------------------

type PeriodStats = Awaited<ReturnType<typeof gatherPeriodStats>>;

async function gatherPeriodStats(startISO: string, endISO: string) {
  // @db.Date columns round-trip as UTC midnight; timestamps use IST boundaries.
  const dateStart = new Date(`${startISO}T00:00:00.000Z`);
  const dateEnd = new Date(`${endISO}T23:59:59.999Z`);
  const tsStart = new Date(`${startISO}T00:00:00.000+05:30`);
  const tsEnd = new Date(`${endISO}T23:59:59.999+05:30`);

  const [goals, screenRows, moods, tests, errorTests, topicsCompleted, revisions] = await Promise.all([
    db.dailyGoal.findMany({
      where: { date: { gte: dateStart, lte: dateEnd } },
      include: { subject: { select: { name: true, slug: true } } },
      orderBy: { date: "asc" },
    }),
    db.screenTimeLog.findMany({
      where: { date: { gte: dateStart, lte: dateEnd } },
      orderBy: { date: "asc" },
    }),
    db.moodEntry.findMany({
      where: { date: { gte: dateStart, lte: dateEnd } },
      orderBy: { date: "asc" },
    }),
    db.testRecord.findMany({
      where: { takenAt: { gte: tsStart, lte: tsEnd } },
      include: { subject: { select: { name: true } } },
      orderBy: { takenAt: "asc" },
    }),
    db.errorLogTest.findMany({
      where: { takenAt: { gte: tsStart, lte: tsEnd } },
      include: { questions: { select: { subject: true, chapter: true, outcome: true, attemptStatus: true } } },
    }),
    db.topic.findMany({
      where: { completedAt: { gte: tsStart, lte: tsEnd } },
      include: { subject: { select: { name: true } } },
    }),
    db.revision.findMany({
      where: { revisedAt: { gte: tsStart, lte: tsEnd } },
      include: { topic: { include: { subject: { select: { name: true } } } } },
    }),
  ]);

  const dayKey = (value: Date) => value.toISOString().slice(0, 10);

  const distractionOf = (row: (typeof screenRows)[number]) =>
    row.instagram + row.whatsapp + row.youtube + row.facebook + row.netflix + row.hotstar + row.mxPlayer + row.google + row.other;

  const days = new Map<
    string,
    { hours: number; questions: number; disciplineMax: number; completionMax: number; distraction: number; energy: number | null; goalLoggedDaysLate: number }
  >();

  for (const goal of goals) {
    const key = dayKey(goal.date);
    const entry = days.get(key) ?? {
      hours: 0,
      questions: 0,
      disciplineMax: 0,
      completionMax: 0,
      distraction: 0,
      energy: null,
      goalLoggedDaysLate: 0,
    };
    entry.hours += goal.hoursStudied;
    entry.questions += goal.questionsSolved;
    entry.disciplineMax = Math.max(entry.disciplineMax, goal.disciplineScore);
    entry.completionMax = Math.max(entry.completionMax, goal.completionPercent);
    entry.goalLoggedDaysLate = Math.max(
      entry.goalLoggedDaysLate,
      Math.floor((goal.createdAt.getTime() - goal.date.getTime()) / 86400000),
    );
    days.set(key, entry);
  }
  for (const row of screenRows) {
    const key = dayKey(row.date);
    const entry = days.get(key);
    if (entry) entry.distraction += distractionOf(row);
    else days.set(key, { hours: 0, questions: 0, disciplineMax: 0, completionMax: 0, distraction: distractionOf(row), energy: null, goalLoggedDaysLate: 0 });
  }
  for (const mood of moods) {
    const key = dayKey(mood.date);
    const entry = days.get(key);
    if (entry) entry.energy = mood.energy;
  }

  const subjectTotals = new Map<string, { hours: number; questions: number }>();
  for (const goal of goals) {
    const entry = subjectTotals.get(goal.subject.name) ?? { hours: 0, questions: 0 };
    entry.hours += goal.hoursStudied;
    entry.questions += goal.questionsSolved;
    subjectTotals.set(goal.subject.name, entry);
  }

  const wrongByChapter = new Map<string, number>();
  let errorWrong = 0;
  let errorTotal = 0;
  for (const test of errorTests) {
    for (const question of test.questions) {
      errorTotal += 1;
      if (question.outcome === "WRONG") {
        errorWrong += 1;
        const key = `${question.subject}::${question.chapter ?? "General"}`;
        wrongByChapter.set(key, (wrongByChapter.get(key) ?? 0) + 1);
      }
    }
  }

  const totalHours = goals.reduce((sum, goal) => sum + goal.hoursStudied, 0);
  const totalQuestions = goals.reduce((sum, goal) => sum + goal.questionsSolved, 0);
  const scopeMap = new Map<string, { subject: string; chapter: string; topic: string | null; weight: number }>();
  const addScope = (subject: string | null | undefined, chapter: string | null | undefined, topic: string | null | undefined, weight: number) => {
    if (!subject || !chapter) return;
    const cleanSubject = subject.trim();
    const cleanChapter = chapter.trim();
    const cleanTopic = topic?.trim() || null;
    if (!cleanSubject || !cleanChapter) return;
    const key = `${cleanSubject}::${cleanChapter}::${cleanTopic ?? ""}`;
    const entry = scopeMap.get(key) ?? { subject: cleanSubject, chapter: cleanChapter, topic: cleanTopic, weight: 0 };
    entry.weight += weight;
    scopeMap.set(key, entry);
  };

  for (const topic of topicsCompleted) addScope(topic.subject.name, topic.chapter, topic.name, 3);
  for (const revision of revisions) addScope(revision.topic.subject.name, revision.topic.chapter, revision.topic.name, 2);
  for (const [key, wrong] of wrongByChapter) {
    const [subject, chapter] = key.split("::");
    addScope(subject, chapter, null, wrong);
  }

  return {
    range: { start: startISO, end: endISO },
    totals: {
      hours: Math.round(totalHours * 10) / 10,
      questions: totalQuestions,
      activeDays: new Set(goals.map((goal) => dayKey(goal.date))).size,
      periodDays: Math.round((Date.parse(`${endISO}T00:00:00Z`) - Date.parse(`${startISO}T00:00:00Z`)) / 86400000) + 1,
      avgDiscipline: goals.length ? Math.round(goals.reduce((sum, goal) => sum + goal.disciplineScore, 0) / goals.length) : 0,
      topicsCompleted: topicsCompleted.length,
      revisions: revisions.length,
      testsTaken: tests.length,
      avgTestPercentage: tests.length ? Math.round((tests.reduce((sum, test) => sum + test.percentage, 0) / tests.length) * 10) / 10 : null,
      totalDistractionHours: Math.round(screenRows.reduce((sum, row) => sum + distractionOf(row), 0) * 10) / 10,
      errorLogQuestions: errorTotal,
      errorLogWrong: errorWrong,
    },
    perDay: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entry]) => ({ date, ...entry, hours: Math.round(entry.hours * 10) / 10 })),
    subjects: [...subjectTotals.entries()].map(([subject, entry]) => ({
      subject,
      hours: Math.round(entry.hours * 10) / 10,
      questions: entry.questions,
    })),
    tests: tests.map((test) => ({
      name: test.testName,
      subject: test.subject?.name ?? "Full syllabus",
      percentage: test.percentage,
      takenAt: getISTDateString(test.takenAt),
    })),
    topicsCompleted: topicsCompleted.map((topic) => ({ subject: topic.subject.name, topic: topic.name, chapter: topic.chapter })),
    revisedTopics: revisions.slice(0, 30).map((revision) => ({
      subject: revision.topic.subject.name,
      topic: revision.topic.name,
      on: getISTDateString(revision.revisedAt),
    })),
    wrongByChapter: [...wrongByChapter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([chapter, wrong]) => ({ chapter, wrong })),
    studyScope: {
      subjects: [...subjectTotals.entries()]
        .sort((a, b) => b[1].hours + b[1].questions / 50 - (a[1].hours + a[1].questions / 50))
        .map(([subject]) => subject),
      chapters: [...scopeMap.values()].sort((a, b) => b.weight - a.weight).slice(0, 30),
    },
  };
}

/** Deterministic log forensics — each signal is a concrete reason to doubt the logs. */
function detectIntegritySignals(stats: PeriodStats): IntegritySignal[] {
  const signals: IntegritySignal[] = [];

  for (const day of stats.perDay) {
    if (day.hours > 16) {
      signals.push({ code: "implausible-hours", severity: 3, detail: `${day.date}: ${day.hours}h study logged in a single day — physically implausible.` });
    }
    if (day.hours >= 8 && day.questions > 0 && day.questions < day.hours * 5) {
      signals.push({ code: "hours-without-output", severity: 2, detail: `${day.date}: ${day.hours}h logged but only ${day.questions} questions solved (under 5/hour).` });
    }
    if (day.disciplineMax >= 9 && day.distraction > 3) {
      signals.push({ code: "discipline-vs-screen", severity: 2, detail: `${day.date}: discipline self-rated ${day.disciplineMax}/10 while ${Math.round(day.distraction * 10) / 10}h of distraction screen time was logged.` });
    }
    if (day.energy !== null && day.energy <= 3 && day.hours >= 12) {
      signals.push({ code: "energy-vs-hours", severity: 2, detail: `${day.date}: energy logged ${day.energy}/10 yet ${day.hours}h of study claimed the same day.` });
    }
    if (day.goalLoggedDaysLate >= 3) {
      signals.push({ code: "backfilled-log", severity: 1, detail: `${day.date}: this day's goal was logged ${day.goalLoggedDaysLate} days late (backfilled from memory).` });
    }
  }

  const hourCounts = new Map<number, number>();
  for (const day of stats.perDay) {
    if (day.hours > 0) hourCounts.set(day.hours, (hourCounts.get(day.hours) ?? 0) + 1);
  }
  for (const [hours, count] of hourCounts) {
    if (count >= 4) {
      signals.push({ code: "template-logging", severity: 2, detail: `Exactly ${hours}h logged on ${count} separate days — pattern looks copy-pasted, not lived.` });
    }
  }

  if (stats.totals.hours >= 40 && stats.totals.topicsCompleted === 0 && stats.totals.revisions === 0 && stats.totals.testsTaken === 0) {
    signals.push({ code: "no-artifacts", severity: 3, detail: `${stats.totals.hours}h claimed in the period but zero topics completed, zero revisions and zero tests — hours with no trace of work.` });
  }

  if (
    stats.totals.avgTestPercentage !== null &&
    stats.totals.avgTestPercentage < 50 &&
    stats.perDay.some((day) => day.completionMax >= 85)
  ) {
    signals.push({ code: "test-vs-claims", severity: 2, detail: `Daily completion logged at 85%+ while test average sits at ${stats.totals.avgTestPercentage}% — the claims and the scores disagree.` });
  }

  return signals.slice(0, 10);
}

// ---------------------------------------------------------------------------
// AI generation + deterministic fallback
// ---------------------------------------------------------------------------

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function extractJson<T>(input: string): T | null {
  const direct = safeJsonParse<T>(input);
  if (direct) return direct;
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = safeJsonParse<T>(fenced.trim());
    if (parsed) return parsed;
  }
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start >= 0 && end > start) return safeJsonParse<T>(input.slice(start, end + 1));
  return null;
}

type GeneratedReview = { review: ReviewContent; questions: IntegrityQuestion[] };

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function bankQualityRank(row: BankQuestion) {
  if (row.qualityStatus === "VERIFIED_STRICT") return 0;
  if (row.verified) return 1;
  if (row.qualityStatus === "NEEDS_REVIEW") return 3;
  return 2;
}

function bankQuestionToIntegrityQuestion(row: BankQuestion, index: number): IntegrityQuestion | null {
  const options = Array.isArray(row.optionsJson) ? row.optionsJson.map(String).slice(0, 4) : [];
  if (options.length !== 4 || row.correctIndex < 0 || row.correctIndex > 3) return null;
  return {
    id: `q${index}`,
    question: row.question,
    options,
    expectedOptionIndex: row.correctIndex,
    evidence: `DB bank question from studied scope: ${row.subject}/${row.chapter}${row.topic ? `/${row.topic}` : ""}. Correct answer: (${String.fromCharCode(65 + row.correctIndex)}) ${options[row.correctIndex]}. Source: ${row.source} ${row.sourceRef}.`,
    signal: null,
  };
}

async function fetchBankIntegrityQuestions(stats: PeriodStats, targetCount: number) {
  if (targetCount <= 0) return [];

  const selected: BankQuestion[] = [];
  const exclude = new Set<string>();
  const subjects = stats.studyScope.subjects.length
    ? stats.studyScope.subjects
    : ["Physics", "Chemistry", "Botany", "Zoology"];
  const chapters = stats.studyScope.chapters;

  const pickFromWhere = async (where: Prisma.BankQuestionWhereInput, needed: number) => {
    if (needed <= 0) return;
    const pool = await db.bankQuestion.findMany({
      where: {
        ...where,
        qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET"] },
        id: exclude.size ? { notIn: [...exclude] } : undefined,
      },
      orderBy: [{ timesServed: "asc" }, { lastServedAt: "asc" }, { createdAt: "asc" }],
      take: Math.max(needed * 10, needed),
    });
    const picked = shuffle(pool.filter((row) => !exclude.has(row.id)))
      .sort((a, b) => bankQualityRank(a) - bankQualityRank(b) || a.timesServed - b.timesServed)
      .slice(0, needed);
    picked.forEach((row) => exclude.add(row.id));
    selected.push(...picked);
  };

  for (const scope of chapters) {
    if (selected.length >= targetCount) break;
    await pickFromWhere(
      {
        subject: scope.subject,
        chapter: scope.chapter,
        topic: scope.topic ? { contains: scope.topic } : undefined,
      },
      1,
    );
  }

  if (selected.length < targetCount && chapters.length) {
    await pickFromWhere(
      {
        OR: chapters.map((scope) => ({ subject: scope.subject, chapter: scope.chapter })),
      },
      targetCount - selected.length,
    );
  }

  if (selected.length < targetCount) {
    await pickFromWhere({ subject: { in: subjects } }, targetCount - selected.length);
  }

  if (selected.length) {
    await db.bankQuestion.updateMany({
      where: { id: { in: selected.map((row) => row.id) } },
      data: { timesServed: { increment: 1 }, lastServedAt: new Date() },
    });
  }

  return selected
    .map((row, index) => bankQuestionToIntegrityQuestion(row, index + 1))
    .filter((question): question is IntegrityQuestion => Boolean(question))
    .slice(0, targetCount);
}

function normalizeIntegrityQuestions(bankQuestions: IntegrityQuestion[], aiQuestions: IntegrityQuestion[], totalTarget: number) {
  const seen = new Set<string>();
  const merged: IntegrityQuestion[] = [];
  for (const question of [...bankQuestions, ...aiQuestions]) {
    const key = `${question.question}::${question.options.join("|")}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(question);
    if (merged.length >= totalTarget) break;
  }
  return merged.map((question, index) => ({ ...question, id: `q${index + 1}` }));
}

function buildGenerationPrompt(
  period: ReviewPeriod,
  stats: PeriodStats,
  previous: PeriodStats,
  signals: IntegritySignal[],
) {
  const label = period === "WEEKLY" ? "weekly" : "monthly";
  return [
    `You are the Review Agent for Misti's NEET UG 2027 preparation (5th attempt, target AIIMS Delhi). Write her ${label} review card for ${stats.range.start} → ${stats.range.end} (IST) and an integrity audit.`,
    `She self-reports her study logs. Your second job is verification: the integritySignals below are deterministic red flags found in her logs. Design option-based "Truth Check" questions that someone who GENUINELY did the logged work would answer consistently with the data — and someone who faked the logs would trip on.`,
    `HARD RULES:
1. Respond with valid JSON only. No markdown fences, no prose outside JSON.
2. Every number in the review must come from the supplied data. Never invent.
3. grade: one of A+, A, B+, B, C, D, F — judged against the 12-14h/day standard for a 5th-attempt AIIMS Delhi aspirant.
4. integrityQuestions: 5 to 7 questions, each with 3-4 options.
   - At least 3 must be data-checkable: set expectedOptionIndex to the option matching the data, and put the exact data fact in "evidence". Build them on details only someone who did the work would know (e.g. which chapter produced her most wrong answers, which subject actually got the most hours, what she revised, her real test percentage) and make wrong options plausible.
   - The rest are self-report probes (expectedOptionIndex null) aimed at the integritySignals: ask her directly but neutrally about suspicious days (e.g. "On ${stats.perDay.find((d) => d.hours >= 10)?.date ?? "your heaviest day"} you logged very high hours — how much was truly focused?"). "evidence" = which signal it probes.
   - Never reveal in the question text what the data says or that a specific answer is expected.
5. wins/gaps: 2-4 each, specific with numbers. focusForNextPeriod: 3 concrete directives.
6. trend: compare against previousPeriod (hoursDelta and questionsDelta as numbers, current minus previous).
7. subjectBreakdown: one row per subject that appears in the data.
8. Tone: precise, firm, zero flattery. If the period was weak or signals are heavy, say it plainly in the summary.
9. BE COMPACT: summary max 3 sentences; each win/gap/focus item one short sentence; each verdictLine under 12 words; each question under 30 words; each option under 10 words. The entire JSON must stay well under 2000 tokens.`,
    `JSON schema:
{
  "review": {
    "title": "short title",
    "summary": "3-4 sentence honest assessment",
    "grade": "B+",
    "wins": ["..."],
    "gaps": ["..."],
    "subjectBreakdown": [{ "subject": "Physics", "hours": 0, "questions": 0, "verdictLine": "..." }],
    "trend": { "hoursDelta": 0, "questionsDelta": 0, "line": "one sentence" },
    "focusForNextPeriod": ["...", "...", "..."],
    "integritySignals": [{ "detail": "...", "severity": 1 }]
  },
  "questions": [
    { "id": "q1", "question": "...", "options": ["...", "...", "..."], "expectedOptionIndex": 1, "evidence": "data fact or signal code", "signal": "code or null" }
  ]
}`,
    `integritySignals (deterministic forensics):\n${JSON.stringify(signals, null, 2)}`,
    `periodStats:\n${JSON.stringify(stats, null, 2)}`,
    `previousPeriod (for trend):\n${JSON.stringify({ totals: previous.totals }, null, 2)}`,
  ].join("\n\n");
}

function bucketOptions(value: number, unit: string): { options: string[]; expected: number } {
  const buckets = [
    `Less than ${Math.max(1, Math.round(value * 0.5))} ${unit}`,
    `Around ${Math.round(value)} ${unit}`,
    `More than ${Math.round(value * 1.5) + 1} ${unit}`,
    "I honestly do not remember",
  ];
  return { options: buckets, expected: 1 };
}

function buildFallbackReview(
  period: ReviewPeriod,
  stats: PeriodStats,
  previous: PeriodStats,
  signals: IntegritySignal[],
): GeneratedReview {
  const label = period === "WEEKLY" ? "Weekly" : "Monthly";
  const dailyTarget = 12;
  const expectedHours = stats.totals.periodDays * dailyTarget;
  const ratio = expectedHours ? stats.totals.hours / expectedHours : 0;
  const grade = ratio >= 0.95 ? "A" : ratio >= 0.8 ? "B+" : ratio >= 0.65 ? "B" : ratio >= 0.5 ? "C" : ratio >= 0.3 ? "D" : "F";

  const topSubject = [...stats.subjects].sort((a, b) => b.hours - a.hours)[0];
  const worstChapter = stats.wrongByChapter[0];

  const questions: IntegrityQuestion[] = [];
  if (topSubject) {
    const others = stats.subjects.filter((subject) => subject.subject !== topSubject.subject).map((subject) => subject.subject);
    const pool = [topSubject.subject, ...others, "Botany", "Zoology", "Physics", "Chemistry"];
    const options = [...new Set(pool)].slice(0, 4);
    questions.push({
      id: "q1",
      question: "Without checking the tracker: which subject actually received your most study hours this period?",
      options,
      expectedOptionIndex: options.indexOf(topSubject.subject),
      evidence: `Logged data: ${topSubject.subject} got ${topSubject.hours}h, the most of any subject.`,
      signal: null,
    });
  }
  if (worstChapter) {
    const decoys = stats.wrongByChapter.slice(1, 3).map((entry) => entry.chapter);
    const options = [...new Set([worstChapter.chapter, ...decoys, "I made almost no errors"])].slice(0, 4);
    questions.push({
      id: "q2",
      question: "Which chapter produced most of your wrong answers in this period's error log?",
      options,
      expectedOptionIndex: options.indexOf(worstChapter.chapter),
      evidence: `Error log: ${worstChapter.chapter} has ${worstChapter.wrong} wrong answers, the highest.`,
      signal: null,
    });
  }
  {
    const bucket = bucketOptions(Math.max(stats.totals.topicsCompleted, 0), "topics");
    questions.push({
      id: "q3",
      question: "How many topics did you genuinely finish (not just read) in this period?",
      options: bucket.options,
      expectedOptionIndex: stats.totals.topicsCompleted > 0 ? bucket.expected : 0,
      evidence: `Tracker shows ${stats.totals.topicsCompleted} topics marked completed in the period.`,
      signal: stats.totals.topicsCompleted === 0 ? "no-artifacts" : null,
    });
  }
  const heavyDay = stats.perDay.filter((day) => day.hours >= 10).sort((a, b) => b.hours - a.hours)[0];
  if (heavyDay) {
    questions.push({
      id: "q4",
      question: `On ${heavyDay.date} you logged ${heavyDay.hours}h. Honestly, how much of that was truly focused study?`,
      options: ["Almost all of it", "Roughly three quarters", "About half", "Honestly, much less"],
      expectedOptionIndex: null,
      evidence: `Self-report probe for the ${heavyDay.hours}h day; cross-check with output (${heavyDay.questions} questions).`,
      signal: heavyDay.questions < heavyDay.hours * 5 ? "hours-without-output" : null,
    });
  }
  questions.push({
    id: "q5",
    question: "Were any of this period's logs filled in days later from memory rather than on the day itself?",
    options: ["No, everything was logged same-day", "One or two entries were late", "Several entries were backfilled", "Most were backfilled"],
    expectedOptionIndex: null,
    evidence: signals.some((signal) => signal.code === "backfilled-log")
      ? "Forensics found backfilled entries (createdAt far after the logged date)."
      : "Forensics found no backfilled entries.",
    signal: "backfilled-log",
  });
  {
    const bucket = bucketOptions(Math.max(stats.totals.questions, 0), "questions");
    questions.push({
      id: "q6",
      question: "Roughly how many practice questions did you actually solve this period?",
      options: bucket.options,
      expectedOptionIndex: stats.totals.questions > 0 ? bucket.expected : 0,
      evidence: `Tracker shows ${stats.totals.questions} questions solved in the period.`,
      signal: stats.totals.questions === 0 ? "no-artifacts" : null,
    });
  }

  return {
    review: {
      title: `${label} review · ${stats.range.start} → ${stats.range.end}`,
      summary: `You logged ${stats.totals.hours}h across ${stats.totals.activeDays}/${stats.totals.periodDays} active days (${stats.totals.questions} questions), against a ${expectedHours}h target at 12h/day. ${stats.totals.testsTaken} test(s) taken${stats.totals.avgTestPercentage !== null ? ` averaging ${stats.totals.avgTestPercentage}%` : ""}. ${signals.length ? `${signals.length} integrity flag(s) were raised by log forensics — answer the Truth Check honestly.` : "No integrity flags this period — keep it that way."}`,
      grade,
      wins: [
        stats.totals.activeDays > 0 ? `${stats.totals.activeDays} active study days logged.` : "The tracker stayed alive this period.",
        stats.totals.revisions > 0 ? `${stats.totals.revisions} revisions completed.` : `${stats.totals.questions} questions attempted.`,
      ],
      gaps: [
        `Hours ran at ${Math.round(ratio * 100)}% of the ${dailyTarget}h/day standard.`,
        stats.totals.topicsCompleted === 0 ? "Zero topics moved to completed." : `Only ${stats.totals.topicsCompleted} topics completed.`,
      ],
      subjectBreakdown: stats.subjects.map((subject) => ({
        ...subject,
        verdictLine: subject.hours >= 10 ? "Carried its weight." : "Underfed — needs more dedicated blocks.",
      })),
      trend: {
        hoursDelta: Math.round((stats.totals.hours - previous.totals.hours) * 10) / 10,
        questionsDelta: stats.totals.questions - previous.totals.questions,
        line:
          stats.totals.hours >= previous.totals.hours
            ? `Up ${Math.round((stats.totals.hours - previous.totals.hours) * 10) / 10}h on the previous period.`
            : `Down ${Math.round((previous.totals.hours - stats.totals.hours) * 10) / 10}h on the previous period.`,
      },
      focusForNextPeriod: [
        "Hit the 12–14h structure every single day — no zero days.",
        worstChapter ? `Clear the error backlog in ${worstChapter.chapter}.` : "Take at least one full test and log every error.",
        "Log everything same-day. Backfilled logs are treated as unverified.",
      ],
      integritySignals: signals.map((signal) => ({ detail: signal.detail, severity: signal.severity })),
    },
    questions,
  };
}

function validateGenerated(parsed: GeneratedReview | null, signals: IntegritySignal[]): GeneratedReview | null {
  if (!parsed?.review || !Array.isArray(parsed.questions)) return null;
  const review = parsed.review;
  if (!review.title || !review.summary || !review.grade) return null;

  const questions: IntegrityQuestion[] = [];
  for (const [index, raw] of parsed.questions.entries()) {
    if (!raw?.question || !Array.isArray(raw.options) || raw.options.length < 3) continue;
    const options = raw.options.map(String).slice(0, 4);
    const expected =
      typeof raw.expectedOptionIndex === "number" && raw.expectedOptionIndex >= 0 && raw.expectedOptionIndex < options.length
        ? raw.expectedOptionIndex
        : null;
    questions.push({
      id: raw.id ? String(raw.id) : `q${index + 1}`,
      question: String(raw.question),
      options,
      expectedOptionIndex: expected,
      evidence: String(raw.evidence ?? ""),
      signal: raw.signal ? String(raw.signal) : null,
    });
  }
  if (questions.length < 4) return null;

  return {
    review: {
      title: String(review.title).slice(0, 160),
      summary: String(review.summary),
      grade: String(review.grade).slice(0, 3),
      wins: Array.isArray(review.wins) ? review.wins.map(String).slice(0, 5) : [],
      gaps: Array.isArray(review.gaps) ? review.gaps.map(String).slice(0, 5) : [],
      subjectBreakdown: Array.isArray(review.subjectBreakdown)
        ? review.subjectBreakdown.map((row) => ({
            subject: String(row.subject),
            hours: Number(row.hours) || 0,
            questions: Number(row.questions) || 0,
            verdictLine: String(row.verdictLine ?? ""),
          }))
        : [],
      trend: {
        hoursDelta: Number(review.trend?.hoursDelta) || 0,
        questionsDelta: Number(review.trend?.questionsDelta) || 0,
        line: String(review.trend?.line ?? ""),
      },
      focusForNextPeriod: Array.isArray(review.focusForNextPeriod) ? review.focusForNextPeriod.map(String).slice(0, 5) : [],
      integritySignals: signals.map((signal) => ({ detail: signal.detail, severity: signal.severity })),
    },
    questions: questions.slice(0, 7),
  };
}

// ---------------------------------------------------------------------------
// Card lifecycle
// ---------------------------------------------------------------------------

async function generateReviewCard(period: ReviewPeriod, range: { start: string; end: string; key: string }) {
  const previousRange =
    period === "WEEKLY" ? lastCompletedWeek(range.start) : lastCompletedMonth(`${range.start.slice(0, 7)}-15`);

  const [stats, previous] = await Promise.all([
    gatherPeriodStats(range.start, range.end),
    gatherPeriodStats(previousRange.start, previousRange.end),
  ]);
  const signals = detectIntegritySignals(stats);
  const policy = REVIEW_INTEGRITY_POLICY[period];
  const deterministic = buildFallbackReview(period, stats, previous, signals);

  let generated: GeneratedReview | null = null;
  let model = "deterministic-fallback";
  try {
    const result = await chatWithAI(
      [
        {
          role: "system",
          content: "You are a strict NEET preparation auditor. Respond only with valid JSON. Never include markdown fences.",
        },
        { role: "user", content: buildGenerationPrompt(period, stats, previous, signals) },
      ],
      6000,
      0.3,
      REVIEW_AI_TIMEOUT_MS,
    );
    generated = validateGenerated(extractJson<GeneratedReview>(result.content), signals);
    if (generated) model = result.model;
    else
      console.warn(
        `[review-agent] AI review failed validation; using deterministic fallback. Raw head: ${result.content.slice(0, 500)} ... tail: ${result.content.slice(-200)}`,
      );
  } catch (error) {
    console.warn("[review-agent] AI review generation failed; using deterministic fallback.", error);
  }
  if (!generated) generated = deterministic;

  const bankQuestions = await fetchBankIntegrityQuestions(stats, policy.bank);
  const aiTail = normalizeIntegrityQuestions([], [...generated.questions, ...deterministic.questions], policy.ai);
  generated.questions = normalizeIntegrityQuestions(bankQuestions, aiTail, policy.total);

  // Exact numbers for the progress graphs — always from the data, never the AI.
  generated.review.metrics = {
    hours: stats.totals.hours,
    questions: stats.totals.questions,
    activeDays: stats.totals.activeDays,
    periodDays: stats.totals.periodDays,
    topicsCompleted: stats.totals.topicsCompleted,
    revisions: stats.totals.revisions,
    testsTaken: stats.totals.testsTaken,
    avgTestPercentage: stats.totals.avgTestPercentage,
    distractionHours: stats.totals.totalDistractionHours,
  };

  return db.reviewCard.create({
    data: {
      period,
      periodKey: range.key,
      periodStart: new Date(`${range.start}T00:00:00.000Z`),
      periodEnd: new Date(`${range.end}T00:00:00.000Z`),
      status: "AWAITING_ANSWERS",
      reviewJson: generated.review as unknown as Prisma.InputJsonValue,
      questionsJson: generated.questions as unknown as Prisma.InputJsonValue,
      model,
    },
  });
}

async function notifyReviewReady(card: ReviewCard) {
  if (card.notifiedAt) return { notified: false, reason: "already-notified" as const };

  const review = card.reviewJson as unknown as ReviewContent;
  const label = card.period === "WEEKLY" ? "Weekly" : "Monthly";
  const flagCount = review.integritySignals?.length ?? 0;

  const notification = await db.appNotification.create({
    data: {
      title: `${label} review is ready`,
      body: `Grade ${review.grade} for ${getISTDateString(card.periodStart)} → ${getISTDateString(card.periodEnd)}. ${flagCount ? `${flagCount} integrity flag(s) raised — ` : ""}the Truth Check is waiting: answer honestly, every reply is cross-checked against your logs.`.slice(0, 420),
      tone: flagCount >= 3 ? "urgent" : "focus",
      senderLabel: REVIEW_SENDER_LABEL,
      senderClientId: null,
    },
  });
  const push = await sendWebPushNotification({ ...notification, url: "/reviews" }, null);

  await db.reviewCard.update({ where: { id: card.id }, data: { notifiedAt: new Date() } });
  return { notified: true as const, push };
}

/**
 * Idempotent heartbeat: makes sure the latest completed week and month each
 * have a review card, generating + notifying when missing. Safe to call from
 * the daily cron and from app-open (unique [period, periodKey] dedupes).
 */
export async function ensurePeriodicReviews(options: { notify?: boolean } = {}) {
  const today = getISTDateString();
  const targets: { period: ReviewPeriod; range: { start: string; end: string; key: string } }[] = [
    { period: "WEEKLY", range: lastCompletedWeek(today) },
    { period: "MONTHLY", range: lastCompletedMonth(today) },
  ];

  const results = [];
  for (const target of targets) {
    try {
      let card = await db.reviewCard.findUnique({
        where: { period_periodKey: { period: target.period, periodKey: target.range.key } },
      });
      let created = false;
      if (!card) {
        card = await generateReviewCard(target.period, target.range);
        created = true;
      }
      const notification = options.notify ? await notifyReviewReady(card) : { notified: false, reason: "notify-disabled" };
      results.push({ period: target.period, periodKey: target.range.key, created, cardId: card.id, notification });
    } catch (error) {
      console.error(`[review-agent] Failed to ensure ${target.period} review:`, error);
      results.push({ period: target.period, periodKey: target.range.key, created: false, error: String(error) });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Truth Check evaluation
// ---------------------------------------------------------------------------

function deterministicVerdict(
  questions: IntegrityQuestion[],
  answers: ReviewAnswer[],
  signals: { detail: string; severity: number }[],
): ReviewVerdict {
  const answerMap = new Map(answers.map((answer) => [answer.id, answer.optionIndex]));
  const perQuestion: ReviewVerdict["perQuestion"] = [];
  let checkable = 0;
  let mismatches = 0;

  for (const question of questions) {
    const chosen = answerMap.get(question.id);
    if (question.expectedOptionIndex === null || chosen === undefined) {
      perQuestion.push({ id: question.id, consistent: null, note: "Self-report — noted, not scored." });
      continue;
    }
    checkable += 1;
    const consistent = chosen === question.expectedOptionIndex;
    if (!consistent) mismatches += 1;
    perQuestion.push({
      id: question.id,
      consistent,
      note: consistent ? "Matches the logged data." : `Does not match the data. ${question.evidence}`,
    });
  }

  const signalPenalty = Math.min(30, signals.reduce((sum, signal) => sum + signal.severity * 4, 0));
  const base = checkable ? Math.round((1 - mismatches / checkable) * 100) : 80;
  const integrityScore = Math.max(0, Math.min(100, base - signalPenalty));

  const verdict: ReviewVerdict["verdict"] =
    integrityScore >= 85 ? "HONEST" : integrityScore >= 65 ? "MOSTLY_HONEST" : integrityScore >= 40 ? "INCONSISTENT" : "FAKING";

  const messages: Record<ReviewVerdict["verdict"], string> = {
    HONEST:
      "Your answers line up with your logs. That honesty is worth more than any single study day — it means every plan I build for you stands on real ground. Now hold the standard: same honesty, more hours.",
    MOSTLY_HONEST:
      "Mostly consistent, with small slips. I am not calling it faking — but a tracker that is 90% true is still 10% blind. Tighten the logging: same-day entries, real numbers, no rounding up.",
    INCONSISTENT:
      "Your answers and your logs are telling two different stories. Either the logging is careless or it is decorated — both poison the data this entire system runs on. From tomorrow: log only what actually happened, exactly when it happened. I will be checking again next review.",
    FAKING:
      "This is not acceptable. The Truth Check contradicts your own logs — which means the hours you reported did not happen the way you wrote them. You are on your 5th attempt with AIIMS Delhi as the target; faking a tracker does not move your rank, it only blinds the one system built to get you there. Reset now: wipe the pride, log the real numbers however small, and rebuild trust one honest day at a time.",
  };

  return {
    integrityScore,
    verdict,
    perQuestion,
    message: messages[verdict],
    consequence:
      verdict === "HONEST"
        ? "Standards hold. Next period's plan will trust your logs fully."
        : "Next period's planner will discount unverified hours until your logs and answers agree again.",
  };
}

function buildEvaluationPrompt(
  card: ReviewCard,
  questions: IntegrityQuestion[],
  answers: ReviewAnswer[],
  review: ReviewContent,
) {
  return [
    `You are the Review Agent's integrity examiner for Misti's NEET preparation. She has answered the ${card.period.toLowerCase()} Truth Check. Judge her honesty by comparing each answer to the data evidence.`,
    `HARD RULES:
1. Respond with valid JSON only matching the schema. No markdown fences.
2. For data-checkable questions (expectedOptionIndex set), consistent = chosenIndex equals expectedOptionIndex. Do not bend this.
3. For self-report probes, judge plausibility against the integrity signals and evidence; consistent may be true, false, or null.
4. integrityScore 0-100. verdict: HONEST (>=85), MOSTLY_HONEST (65-84), INCONSISTENT (40-64), FAKING (<40).
5. message: speak directly to her, 3-6 sentences. If HONEST — warm but firm recognition, then raise the bar. If FAKING — a serious, unambiguous scolding: name exactly which answers contradicted which logged facts, explain that fake logs blind the system that plans her days, and demand a reset to honest logging. Never cruel, never soft.
6. consequence: one sentence on how the next planner/review will treat her data.`,
    `JSON schema:
{ "integrityScore": 0, "verdict": "HONEST|MOSTLY_HONEST|INCONSISTENT|FAKING", "perQuestion": [{ "id": "q1", "consistent": true, "note": "..." }], "message": "...", "consequence": "..." }`,
    `Review summary she received:\n${JSON.stringify({ grade: review.grade, summary: review.summary, integritySignals: review.integritySignals }, null, 2)}`,
    `Questions with private evidence:\n${JSON.stringify(questions, null, 2)}`,
    `Her answers (chosen option index):\n${JSON.stringify(
      answers.map((answer) => {
        const question = questions.find((entry) => entry.id === answer.id);
        return {
          id: answer.id,
          chosenIndex: answer.optionIndex,
          chosenText: question?.options[answer.optionIndex] ?? "?",
        };
      }),
      null,
      2,
    )}`,
  ].join("\n\n");
}

function validateVerdict(parsed: ReviewVerdict | null, questions: IntegrityQuestion[]): ReviewVerdict | null {
  if (!parsed || typeof parsed.integrityScore !== "number" || !parsed.message) return null;
  const verdicts = new Set(["HONEST", "MOSTLY_HONEST", "INCONSISTENT", "FAKING"]);
  if (!verdicts.has(parsed.verdict)) return null;
  const ids = new Set(questions.map((question) => question.id));
  const perQuestion = Array.isArray(parsed.perQuestion)
    ? parsed.perQuestion
        .filter((entry) => entry && ids.has(String(entry.id)))
        .map((entry) => ({
          id: String(entry.id),
          consistent: typeof entry.consistent === "boolean" ? entry.consistent : null,
          note: String(entry.note ?? ""),
        }))
    : [];
  return {
    integrityScore: Math.max(0, Math.min(100, Math.round(parsed.integrityScore))),
    verdict: parsed.verdict,
    perQuestion,
    message: String(parsed.message),
    consequence: String(parsed.consequence ?? ""),
  };
}

export async function evaluateReviewAnswers(cardId: string, answers: ReviewAnswer[]) {
  const card = await db.reviewCard.findUnique({ where: { id: cardId } });
  if (!card) throw new Error("Review card not found");
  if (card.status === "COMPLETED") throw new Error("This review's Truth Check is already completed");

  const questions = card.questionsJson as unknown as IntegrityQuestion[];
  const review = card.reviewJson as unknown as ReviewContent;

  const answeredIds = new Set(answers.map((answer) => answer.id));
  const missing = questions.filter((question) => !answeredIds.has(question.id));
  if (missing.length) throw new Error(`Answer all ${questions.length} questions before submitting`);

  let verdict: ReviewVerdict | null = null;
  let model = "deterministic-fallback";
  try {
    const result = await chatWithAI(
      [
        { role: "system", content: "You are a strict integrity examiner. Respond only with valid JSON. Never include markdown fences." },
        { role: "user", content: buildEvaluationPrompt(card, questions, answers, review) },
      ],
      1800,
      0.3,
      REVIEW_AI_TIMEOUT_MS,
    );
    verdict = validateVerdict(extractJson<ReviewVerdict>(result.content), questions);
    if (verdict) model = result.model;
  } catch (error) {
    console.warn("[review-agent] AI evaluation failed; using deterministic verdict.", error);
  }
  if (!verdict) verdict = deterministicVerdict(questions, answers, review.integritySignals ?? []);

  const updated = await db.reviewCard.update({
    where: { id: card.id },
    data: {
      status: "COMPLETED",
      answersJson: answers as unknown as Prisma.InputJsonValue,
      verdictJson: verdict as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
      model: card.model === "deterministic-fallback" ? model : card.model,
    },
  });

  return { card: updated, verdict };
}

// ---------------------------------------------------------------------------
// Client sanitization — never leak expected answers before completion
// ---------------------------------------------------------------------------

export function sanitizeReviewCard(card: ReviewCard) {
  const questions = (card.questionsJson as unknown as IntegrityQuestion[]).map((question) => ({
    id: question.id,
    question: question.question,
    options: question.options,
  }));

  return {
    id: card.id,
    period: card.period,
    periodKey: card.periodKey,
    periodStart: getISTDateString(card.periodStart),
    periodEnd: getISTDateString(card.periodEnd),
    status: card.status,
    review: card.reviewJson as unknown as ReviewContent,
    questions,
    answers: card.status === "COMPLETED" ? (card.answersJson as unknown as ReviewAnswer[] | null) : null,
    verdict: card.status === "COMPLETED" ? (card.verdictJson as unknown as ReviewVerdict | null) : null,
    createdAt: card.createdAt,
    completedAt: card.completedAt,
  };
}

export type SanitizedReviewCard = ReturnType<typeof sanitizeReviewCard>;
