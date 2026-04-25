import { db } from "@/lib/db";
import { chatWithAI } from "@/lib/openrouter";

export type SeverityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ErrorLogQuestionLike {
  questionNumber: number;
  questionSummary?: string | null;
  subject: string;
  chapter?: string | null;
  topic?: string | null;
  attemptStatus: string;
  outcome: string;
  correctAnswer?: string | null;
  whyCorrect?: string | null;
  whereLacked?: string | null;
  contentStatus: string;
  outOfSyllabus: boolean;
  notStudied: boolean;
  difficulty?: string | null;
  confidence?: number | null;
  timeSpentSeconds?: number | null;
  reasonTags?: unknown;
  actionFix?: string | null;
  notes?: string | null;
}

type ErrorLogWithQuestions = {
  id: string;
  testName: string;
  testType: string;
  questionCount: number;
  takenAt: Date;
  notes: string | null;
  questions: ErrorLogQuestionLike[];
};

const severeReasonTags = new Set([
  "Panic",
  "Anxiety",
  "Forgotten",
  "Confused",
  "Silly mistake",
  "Calculation",
  "Formula gap",
  "Concept gap",
  "Time pressure",
  "Misread question",
  "Option trap",
  "Not studied",
  "Weak revision",
  "Low confidence",
]);

function tags(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function percent(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

export function scoreErrorSeverity(question: ErrorLogQuestionLike) {
  let score = 0;
  const reasons: string[] = [];
  const missed = question.outcome === "WRONG" || question.attemptStatus === "SKIPPED";

  if (question.outcome === "WRONG") {
    score += 30;
    reasons.push("wrong answer");
  }
  if (question.attemptStatus === "SKIPPED") {
    score += 18;
    reasons.push("skipped");
  }
  if (missed && question.contentStatus === "HAD_CONTENT") {
    score += 18;
    reasons.push("studied but missed");
  }
  if (question.contentStatus === "WEAK_CONTENT") {
    score += 16;
    reasons.push("weak content");
  }
  if (question.contentStatus === "NOT_STUDIED" || question.notStudied) {
    score += 18;
    reasons.push("not studied");
  }
  if (question.contentStatus === "OUT_OF_SYLLABUS" || question.outOfSyllabus) {
    score += 8;
    reasons.push("out of syllabus");
  }
  if (question.difficulty === "HARD" && missed) {
    score += 6;
    reasons.push("hard question");
  }
  if ((question.confidence ?? 3) <= 2 && missed) {
    score += 7;
    reasons.push("low confidence");
  }

  const signalTags = tags(question.reasonTags).filter((tag) => severeReasonTags.has(tag));
  if (signalTags.length) {
    score += Math.min(18, signalTags.length * 5);
    reasons.push(...signalTags.map((tag) => tag.toLowerCase()));
  }

  const capped = Math.min(100, score);
  const severity: SeverityLevel =
    capped >= 72 ? "CRITICAL" : capped >= 48 ? "HIGH" : capped >= 24 ? "MEDIUM" : "LOW";

  return { score: capped, severity, reasons: [...new Set(reasons)] };
}

export function buildErrorLogAnalytics(questions: ErrorLogQuestionLike[]) {
  const sorted = [...questions].sort((a, b) => a.questionNumber - b.questionNumber);
  const total = sorted.length;
  const correct = sorted.filter((q) => q.outcome === "CORRECT").length;
  const wrong = sorted.filter((q) => q.outcome === "WRONG").length;
  const skipped = sorted.filter((q) => q.attemptStatus === "SKIPPED").length;
  const attempted = total - skipped;
  const weakContent = sorted.filter((q) => q.contentStatus === "WEAK_CONTENT").length;
  const notStudied = sorted.filter((q) => q.contentStatus === "NOT_STUDIED" || q.notStudied).length;
  const outOfSyllabus = sorted.filter((q) => q.contentStatus === "OUT_OF_SYLLABUS" || q.outOfSyllabus).length;
  const totalSeconds = sorted.reduce((sum, q) => sum + (q.timeSpentSeconds ?? 0), 0);

  let runningAttempted = 0;
  let runningCorrect = 0;
  const timeline = sorted.map((q) => {
    if (q.attemptStatus !== "SKIPPED") runningAttempted += 1;
    if (q.outcome === "CORRECT") runningCorrect += 1;
    const severity = scoreErrorSeverity(q);
    return {
      question: q.questionNumber,
      accuracy: percent(runningCorrect, Math.max(runningAttempted, 1)),
      attempted: runningAttempted,
      correct: runningCorrect,
      outcome: q.outcome,
      severity: severity.score,
    };
  });

  const q1Count = Math.max(1, Math.floor(sorted.length * 0.25));
  const q1 = sorted.slice(0, q1Count);
  const q4 = sorted.slice(-q1Count);
  const getAcc = (arr: ErrorLogQuestionLike[]) => {
    const att = arr.filter(q => q.attemptStatus !== "SKIPPED").length;
    const corr = arr.filter(q => q.outcome === "CORRECT").length;
    return percent(corr, att);
  };
  const staminaDropoff = sorted.length >= 10 ? Number((getAcc(q1) - getAcc(q4)).toFixed(1)) : 0;

  const subjectMap = new Map<
    string,
    { total: number; correct: number; wrong: number; skipped: number; weak: number; severity: number }
  >();
  for (const q of sorted) {
    const key = q.subject || "Unmapped";
    const current = subjectMap.get(key) ?? { total: 0, correct: 0, wrong: 0, skipped: 0, weak: 0, severity: 0 };
    const severity = scoreErrorSeverity(q);
    current.total += 1;
    current.severity += severity.score;
    if (q.outcome === "CORRECT") current.correct += 1;
    if (q.outcome === "WRONG") current.wrong += 1;
    if (q.attemptStatus === "SKIPPED") current.skipped += 1;
    if (q.contentStatus !== "HAD_CONTENT") current.weak += 1;
    subjectMap.set(key, current);
  }

  const tagCounts = new Map<string, number>();
  const chapterCounts = new Map<string, number>();
  for (const q of sorted) {
    if (q.outcome === "WRONG" || q.attemptStatus === "SKIPPED") {
      const chapter = q.chapter || "Unmapped";
      chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
    }
    for (const tag of tags(q.reasonTags)) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }

  const severities = sorted.map((q) => ({
    questionNumber: q.questionNumber,
    subject: q.subject || "Unmapped",
    chapter: q.chapter || "Unmapped",
    topic: q.topic || "Unmapped",
    outcome: q.outcome,
    ...scoreErrorSeverity(q),
  }));

  return {
    total,
    correct,
    wrong,
    skipped,
    attempted,
    accuracy: percent(correct, attempted),
    skipRate: percent(skipped, total),
    weakContentRate: percent(weakContent + notStudied, total),
    weakContent,
    notStudied,
    outOfSyllabus,
    avgSeconds: total ? Math.round(totalSeconds / total) : 0,
    staminaDropoff,
    subjects: Array.from(subjectMap.entries())
      .map(([subject, value]) => ({
        subject,
        ...value,
        accuracy: percent(value.correct, value.total - value.skipped),
        errorRate: percent(value.wrong + value.skipped, value.total),
        avgSeverity: value.total ? Math.round(value.severity / value.total) : 0,
      }))
      .sort((a, b) => b.total - a.total),
    reasonTags: Array.from(tagCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    chapters: Array.from(chapterCounts.entries())
      .map(([chapter, count]) => ({ chapter, count }))
      .sort((a, b) => b.count - a.count),
    severity: {
      avgScore: severities.length
        ? Math.round(severities.reduce((sum, item) => sum + item.score, 0) / severities.length)
        : 0,
      critical: severities.filter((item) => item.severity === "CRITICAL").length,
      high: severities.filter((item) => item.severity === "HIGH").length,
      medium: severities.filter((item) => item.severity === "MEDIUM").length,
      low: severities.filter((item) => item.severity === "LOW").length,
      byQuestion: severities,
      top: severities
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    },
    timeline,
  };
}

function buildPatternMemoryFromLogs(logs: ErrorLogWithQuestions[]) {
  const ordered = [...logs].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  const buckets = new Map<
    string,
    {
      subject: string;
      chapter: string;
      topic: string;
      reason: string;
      events: Array<{
        testId: string;
        testName: string;
        takenAt: string;
        outcome: string;
        severityScore: number;
        severity: SeverityLevel;
      }>;
    }
  >();

  for (const log of ordered) {
    for (const question of log.questions) {
      const signal = question.outcome !== "CORRECT" || question.attemptStatus === "SKIPPED" || question.contentStatus !== "HAD_CONTENT";
      if (!signal) continue;

      const subject = question.subject || "Unmapped";
      const chapter = question.chapter || "Unmapped";
      const topic = question.topic || chapter;
      const reason = tags(question.reasonTags)[0] || question.contentStatus || "NONE";
      const key = `${subject.toLowerCase()}::${chapter.toLowerCase()}::${topic.toLowerCase()}::${reason.toLowerCase()}`;
      const current = buckets.get(key) ?? { subject, chapter, topic, reason, events: [] };
      const severity = scoreErrorSeverity(question);
      current.events.push({
        testId: log.id,
        testName: log.testName,
        takenAt: log.takenAt.toISOString(),
        outcome: question.outcome,
        severityScore: severity.score,
        severity: severity.severity,
      });
      buckets.set(key, current);
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const mistakes = bucket.events.filter((event) => event.outcome !== "CORRECT");
      const latest = bucket.events[bucket.events.length - 1];
      const earlierMistake = bucket.events.slice(0, -1).some((event) => event.outcome !== "CORRECT");
      const recovered = earlierMistake && latest?.outcome === "CORRECT";
      const repeated = mistakes.length >= 2 && latest?.outcome !== "CORRECT";
      const avgSeverity = bucket.events.length
        ? Math.round(bucket.events.reduce((sum, event) => sum + event.severityScore, 0) / bucket.events.length)
        : 0;
      const severity: SeverityLevel =
        avgSeverity >= 72 ? "CRITICAL" : avgSeverity >= 48 ? "HIGH" : avgSeverity >= 24 ? "MEDIUM" : "LOW";
      const status = recovered ? "RECOVERED" : repeated ? "ACTIVE_LOOP" : "WATCH";

      return {
        subject: bucket.subject,
        chapter: bucket.chapter,
        topic: bucket.topic,
        reason: bucket.reason,
        attempts: bucket.events.length,
        mistakes: mistakes.length,
        status,
        avgSeverity,
        severity,
        firstSeen: bucket.events[0]?.takenAt ?? null,
        lastSeen: latest?.takenAt ?? null,
        latestTest: latest?.testName ?? null,
        quickNote:
          status === "RECOVERED"
            ? "Recovery visible. Keep this in light revision rotation."
            : status === "ACTIVE_LOOP"
              ? "Repeated miss. Make a one-page error note and test this again before the next mock."
              : "Single signal. Watch this area in the next two tests.",
        recommendation:
          bucket.reason === "Formula gap"
            ? "Write formula, condition, units, and one trap example on the same card."
            : bucket.reason === "Not studied" || bucket.reason === "NOT_STUDIED"
              ? "Schedule first learning before more tests. Testing this again without content will only create noise."
              : bucket.reason === "Silly mistake"
                ? "Create a 15-second verification ritual for signs, units, options, and question wording."
                : "Revise the concept, write the exact trap, and solve 8 to 12 targeted questions.",
      };
    })
    .sort((a, b) => b.mistakes - a.mistakes || b.avgSeverity - a.avgSeverity);
}

export async function getErrorLogMemory() {
  const prisma = db as unknown as {
    errorLogTest: {
      findMany: (args: unknown) => Promise<ErrorLogWithQuestions[]>;
    };
  };
  const logs = await prisma.errorLogTest.findMany({
    orderBy: { takenAt: "desc" },
    take: 40,
    include: { questions: { orderBy: { questionNumber: "asc" } } },
  });

  const patterns = buildPatternMemoryFromLogs(logs);
  const [latest, previous] = logs;
  const latestAnalytics = latest ? buildErrorLogAnalytics(latest.questions) : null;
  const previousAnalytics = previous ? buildErrorLogAnalytics(previous.questions) : null;

  return {
    patterns: patterns.slice(0, 14),
    activeLoops: patterns.filter((pattern) => pattern.status === "ACTIVE_LOOP").slice(0, 8),
    recovered: patterns.filter((pattern) => pattern.status === "RECOVERED").slice(0, 8),
    watch: patterns.filter((pattern) => pattern.status === "WATCH").slice(0, 6),
    comparison:
      latestAnalytics && previousAnalytics && latest && previous
        ? {
            latestTitle: latest.testName,
            previousTitle: previous.testName,
            accuracyDelta: Number((latestAnalytics.accuracy - previousAnalytics.accuracy).toFixed(1)),
            skipDelta: Number((latestAnalytics.skipRate - previousAnalytics.skipRate).toFixed(1)),
            weakContentDelta: Number((latestAnalytics.weakContentRate - previousAnalytics.weakContentRate).toFixed(1)),
            severityDelta: latestAnalytics.severity.avgScore - previousAnalytics.severity.avgScore,
            latestLogged: latestAnalytics.total,
            previousLogged: previousAnalytics.total,
          }
        : null,
  };
}

export async function generateErrorLogReport(testId: string) {
  const prisma = db as unknown as {
    errorLogTest: {
      findUnique: (args: unknown) => Promise<(ErrorLogWithQuestions & { analyses: unknown[] }) | null>;
    };
    errorLogAnalysis: {
      create: (args: unknown) => Promise<unknown>;
    };
    task: {
      create: (args: unknown) => Promise<unknown>;
    };
  };
  const log = await prisma.errorLogTest.findUnique({
    where: { id: testId },
    include: {
      questions: { orderBy: { questionNumber: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  if (!log) throw new Error("Error log not found.");

  const analytics = buildErrorLogAnalytics(log.questions);
  const memory = await getErrorLogMemory();
  const ai = await chatWithAI(
    [
      {
        role: "system",
        content:
          "You are NEET-GURU's Error Log Intelligence module. Be precise, data-driven, warm but strict. Use clean Markdown tables. Never invent data.",
      },
      {
        role: "user",
        content: `Generate an on-demand NEET question-error report for one test.

Rules:
Use only the supplied tracker data.
Use clean ASCII punctuation.
Use tables for scorecard, subject damage, repeated patterns, and recovery plan.
Mention incomplete logging if important fields are blank.

Test:
${JSON.stringify(
  {
    id: log.id,
    testName: log.testName,
    testType: log.testType,
    questionCount: log.questionCount,
    takenAt: log.takenAt,
    notes: log.notes,
  },
  null,
  2
)}

Question-level logs:
${JSON.stringify(log.questions, null, 2)}

Computed analytics:
${JSON.stringify(analytics, null, 2)}

Cross-test memory:
${JSON.stringify(memory, null, 2)}

Return this structure:
# Test Error Report
## Verdict
## Structured Scorecard
## Subject-Wise Damage
## Repeated Mistake Patterns
## Severity Ranking
## Recovery Or Repetition Signal
## Content And Revision Gaps
## Next 72 Hours Correction Plan
## What To Log In The Next Test`,
      },
    ],
    5000,
    0.35,
    35000
  );

  const analysis = await prisma.errorLogAnalysis.create({
    data: {
      testId,
      response: ai.content,
      model: ai.model,
      summaryJson: {
        accuracy: analytics.accuracy,
        skipRate: analytics.skipRate,
        severity: analytics.severity.avgScore,
        topReasons: analytics.reasonTags.slice(0, 5),
      },
    },
  });

  if (memory.activeLoops.length > 0) {
    for (const loop of memory.activeLoops) {
      await prisma.task.create({
        data: {
          title: `Revise ${loop.topic} - ${loop.reason}`,
          description: `**Error Pattern Detected (Active Loop)**\nSubject: ${loop.subject}\nChapter: ${loop.chapter}\nReason: ${loop.reason}\n\n**Quick Note:** ${loop.quickNote}\n\n**Recommendation:** ${loop.recommendation}`,
          priority: "CRITICAL",
          source: "AI",
          status: "TODO",
        },
      }).catch(console.error);
    }
  }

  return analysis;
}

export async function generateGlobalErrorLogReport() {
  const prisma = db as unknown as {
    errorLogTest: {
      findMany: (args: unknown) => Promise<ErrorLogWithQuestions[]>;
    };
    errorLogGlobalAnalysis: {
      create: (args: unknown) => Promise<unknown>;
    };
  };
  const [logs, memory] = await Promise.all([
    prisma.errorLogTest.findMany({
      orderBy: { takenAt: "desc" },
      take: 40,
      include: { questions: { orderBy: { questionNumber: "asc" } } },
    }),
    getErrorLogMemory(),
  ]);
  const allQuestions = logs.flatMap((log) =>
    log.questions.map((question) => ({
      ...question,
      testName: log.testName,
      testType: log.testType,
      takenAt: log.takenAt.toISOString(),
    }))
  );
  const analytics = buildErrorLogAnalytics(allQuestions);

  const ai = await chatWithAI(
    [
      {
        role: "system",
        content:
          "You are NEET-GURU's longitudinal Error Log Intelligence module. Be strict, evidence-based, table-heavy, and useful for NEET recovery.",
      },
      {
        role: "user",
        content: `Generate an all-test NEET error-pattern audit.

Rules:
Use only supplied tracker data.
Use clean Markdown and ASCII punctuation.
Do not invent live trends or scores.
Provide quick notes, memory hooks, and prevention rules for repeated mistakes.

Recent test logs:
${JSON.stringify(logs, null, 2)}

Computed cross-test analytics:
${JSON.stringify(analytics, null, 2)}

Deterministic pattern memory:
${JSON.stringify(memory, null, 2)}

Return this structure:
# All-Test Error Pattern Audit
## Executive Verdict
## Structured Scorecard
## Repeated Subject And Chapter Damage
## Same Mistake Pattern Loop
## Severity Ranking
## Recovery Versus Repetition
## Content Coverage Diagnosis
## Attempt Strategy Diagnosis
## 14-Day Correction Protocol
## Quick Notes And Memory Hooks
## Rules For The Next 5 Tests`,
      },
    ],
    6000,
    0.35,
    35000
  );

  return prisma.errorLogGlobalAnalysis.create({
    data: {
      response: ai.content,
      model: ai.model,
      summaryJson: {
        generatedFromTests: logs.length,
        generatedFromQuestions: allQuestions.length,
        accuracy: analytics.accuracy,
        severity: analytics.severity.avgScore,
      },
    },
  });
}
