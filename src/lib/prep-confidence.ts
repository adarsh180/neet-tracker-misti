import { db } from "@/lib/db";

type ComponentScore = {
  label: string;
  value: number;
  weight: number;
};

export type PrepConfidencePayload = {
  exam: "NEET UG 2027";
  score: number;
  label: string;
  reliability: number;
  updatedAt: string;
  source: "live-database";
  formulaVersion: "neet-confidence-v1";
  components: ComponentScore[];
  signals: string[];
};

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function labelFor(score: number) {
  if (score >= 84) return "selection-grade";
  if (score >= 70) return "high-confidence build";
  if (score >= 55) return "competitive but unstable";
  if (score >= 38) return "foundation still forming";
  return "needs evidence";
}

export async function getNeetPrepConfidence(): Promise<PrepConfidencePayload> {
  const now = new Date();
  const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [subjects, dailyGoals, allGoals, testRecords] = await Promise.all([
    db.subject.findMany({
      include: {
        topics: {
          include: {
            revisions: {
              orderBy: { revisedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    db.dailyGoal.findMany({
      where: { date: { gte: thirtyAgo } },
      orderBy: { date: "desc" },
    }),
    db.dailyGoal.findMany({ orderBy: { date: "desc" } }),
    db.testRecord.findMany({
      orderBy: { takenAt: "desc" },
      take: 20,
    }),
  ]);

  const topics = subjects.flatMap((subject) => subject.topics);
  const totalTopics = topics.length;
  const completedTopics = topics.filter((topic) => topic.isCompleted).length;
  const syllabusScore = totalTopics ? (completedTopics / totalTopics) * 100 : 0;

  const completedWithRecentRevision = topics.filter(
    (topic) => topic.isCompleted && topic.revisions.some((revision) => revision.revisedAt >= sevenAgo),
  ).length;
  const revisionHealth = completedTopics ? (completedWithRecentRevision / completedTopics) * 100 : syllabusScore;

  const rawTestAverage = average(testRecords.map((test) => test.percentage));
  const testReliability = testRecords.length / (testRecords.length + 5);
  const testScore = rawTestAverage * testReliability + syllabusScore * (1 - testReliability);

  const recentGoals7 = allGoals.filter((goal) => goal.date >= sevenAgo);
  const recentGoals14 = allGoals.filter((goal) => goal.date >= fourteenAgo);
  const activeDays14 = new Set(recentGoals14.map((goal) => goal.date.toISOString().slice(0, 10))).size;
  const recentHours7 = recentGoals7.reduce((sum, goal) => sum + goal.hoursStudied, 0);
  const recentQuestions7 = recentGoals7.reduce((sum, goal) => sum + goal.questionsSolved, 0);

  const allDates = [...new Set(allGoals.map((goal) => goal.date.toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  for (let i = 0; i < allDates.length; i += 1) {
    const expected = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (allDates[i] === expected) streak += 1;
    else break;
  }

  const consistencyScore = Math.min(activeDays14 / 10, 1) * 65 + Math.min(streak / 7, 1) * 35;
  const hoursScore = Math.min(recentHours7 / 42, 1) * 100;
  const questionScore = Math.min(recentQuestions7 / 1400, 1) * 100;

  const components: ComponentScore[] = [
    { label: "Syllabus coverage", value: clampPct(syllabusScore), weight: 0.28 },
    { label: "Test performance, shrinkage-adjusted", value: clampPct(testScore), weight: 0.3 },
    { label: "14-day consistency", value: clampPct(consistencyScore), weight: 0.16 },
    { label: "7-day study hours", value: clampPct(hoursScore), weight: 0.12 },
    { label: "7-day question practice", value: clampPct(questionScore), weight: 0.08 },
    { label: "Recent revision health", value: clampPct(revisionHealth), weight: 0.06 },
  ];

  const score = clampPct(components.reduce((sum, item) => sum + item.value * item.weight, 0));
  const reliability = clampPct(
    35 +
      testReliability * 25 +
      Math.min(completedTopics / 100, 1) * 15 +
      Math.min(activeDays14 / 10, 1) * 15 +
      Math.min(dailyGoals.length / 20, 1) * 10,
  );

  return {
    exam: "NEET UG 2027",
    score,
    label: labelFor(score),
    reliability,
    updatedAt: now.toISOString(),
    source: "live-database",
    formulaVersion: "neet-confidence-v1",
    components,
    signals: [
      `${completedTopics}/${totalTopics || 0} topics completed`,
      `${rawTestAverage.toFixed(1)}% recent test average across ${testRecords.length} tests`,
      `${recentHours7.toFixed(1)}h and ${recentQuestions7} questions in 7 days`,
      `${activeDays14}/14 active days, ${streak} day streak`,
    ],
  };
}
