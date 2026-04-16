import { db } from "@/lib/db";

export interface AIContext {
  student: {
    name: string;
    targetExam: string;
    targetCollege: string;
    examDate: string;
    attempt: number;
    daysRemaining: number;
    bscEnrolled: boolean;
    hasPartner: boolean;
  };
  subjects: {
    name: string;
    slug: string;
    totalTopics: number;
    completedTopics: number;
    totalQuestionsInTopics: number;
    pendingRevisions: number;
    chapters: {
      name: string;
      completed: number;
      total: number;
      questionsSolved: number;
      revisions: number;
    }[];
  }[];
  recentDailyGoals: {
    date: string;
    subjectName: string;
    hoursStudied: number;
    questionsSolved: number;
  }[];
  last7DaysSummary: {
    totalHours: number;
    totalQuestions: number;
    activeDays: number;
    avgHoursPerDay: number;
  };
  recentTests: {
    testName: string;
    testType: string;
    subjectName: string | null;
    score: number;
    maxScore: number;
    percentage: number;
    takenAt: string;
  }[];
  cyclePhase: {
    currentPhase: string;
    dayOfCycle: number | null;
    nextPeriodEst: string | null;
  };
  recentMoods: {
    date: string;
    mood: string;
    energy: number;
    focus: number;
    stress: number;
    note: string | null;
  }[];
  moodSummary: {
    avgEnergy: number;
    avgFocus: number;
    avgStress: number;
    dominantMood: string;
    trend: "improving" | "declining" | "stable" | "unknown";
  };
  overallCompletion: number;
  consistencyStreak: number;
  performanceScore: number; // 0-100 computed score
  strictnessLevel: "VERY_STRICT" | "STRICT" | "MODERATE" | "ENCOURAGING";
  errorAnalysis?: {
    subject: string;
    type: string;
    frequency: number;
    notes: string | null;
  }[];
  srsTopicsDue?: {
    topic: string;
    subjectId: string;
  }[];
}

// IST-aware date helper
function getISTDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function estimateCyclePhase(lastStart: Date | null, avgCycleLength = 28): {
  currentPhase: string;
  dayOfCycle: number | null;
  nextPeriodEst: string | null;
} {
  if (!lastStart) return { currentPhase: "unknown", dayOfCycle: null, nextPeriodEst: null };

  const today = new Date();
  const dayOfCycle = Math.floor((today.getTime() - lastStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let currentPhase = "luteal";
  if (dayOfCycle <= 5) currentPhase = "menstrual";
  else if (dayOfCycle <= 13) currentPhase = "follicular";
  else if (dayOfCycle <= 16) currentPhase = "ovulatory";

  const nextPeriodDate = new Date(lastStart.getTime() + avgCycleLength * 24 * 60 * 60 * 1000);
  const nextPeriodEst = getISTDateString(nextPeriodDate);

  return { currentPhase, dayOfCycle, nextPeriodEst };
}

function computeStrictnessLevel(
  overallPct: number,
  avgTestScore: number,
  streak: number,
  avgStress: number,
  avgEnergy: number,
  performanceScore: number,
  activeDaysLast7: number
): AIContext["strictnessLevel"] {
  // ── Target benchmarks ──
  // AIIMS Delhi: ~710/720 = 98.6% tests; AIIMS Rishikesh: ~660/720 = 95.8%
  const delhiReady = overallPct >= 95 && avgTestScore >= 98.6 && performanceScore >= 95;
  const rishikeshReady = overallPct >= 85 && avgTestScore >= 95.8 && performanceScore >= 85;

  // ── 95%+ across everything: maintain MODERATE (she has earned calm guidance) ──
  if (delhiReady) return "MODERATE";

  // ── Consistency signals ──
  // A student who consistently shows up deserves MODERATE tone, not harsh criticism
  const isConsistent =
    streak >= 5 ||                    // 5+ consecutive days logged
    activeDaysLast7 >= 5 ||           // active at least 5 of last 7 days
    performanceScore >= 70;           // composite score reflecting solid effort

  // ── Rishikesh-level progress + consistent → MODERATE ──
  if (rishikeshReady && isConsistent) return "MODERATE";

  // ── Rishikesh progress without full consistency → STRICT ──
  if (rishikeshReady) return "STRICT";

  // ── Below Rishikesh but consistently showing up → STRICT (not harsh VERY_STRICT) ──
  if (isConsistent) return "STRICT";

  // ── High stress + low energy + NOT consistent → ease slightly to avoid burnout collapse ──
  if (avgStress >= 8 && avgEnergy <= 3) return "ENCOURAGING";

  // ── Default: she is neither consistent nor close to her targets ──
  return "VERY_STRICT";
}

export async function buildAIContext(): Promise<AIContext> {
  const [subjects, allTopics, recentGoals, recentTests, lastCycle, recentMoodEntries, errorPatterns] = await Promise.all([
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.topic.findMany({ include: { revisions: true }, orderBy: { createdAt: "asc" } }),
    db.dailyGoal.findMany({
      include: { subject: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
    db.testRecord.findMany({
      include: { subject: true },
      orderBy: { takenAt: "desc" },
      take: 10,
    }),
    db.cycleEntry.findFirst({ orderBy: { startDate: "desc" } }),
    db.moodEntry.findMany({
      orderBy: { date: "desc" },
      take: 14,
    }),
    db.errorPattern.findMany({
      include: { subject: true },
      orderBy: { frequency: "desc" },
      take: 10,
    })
  ]);

  // Subject stats
  const subjectStats = subjects.map((sub: (typeof subjects)[number]) => {
    const subTopics = allTopics.filter((t) => t.subjectId === sub.id);
    const completed = subTopics.filter((t) => t.isCompleted).length;
    const total = subTopics.length;
    const totalQ = subTopics.reduce((sum, t) => sum + t.questionsSolved, 0);
    const pendingRevisions = subTopics.filter(
      (t) => t.isCompleted && (t.revisions.length === 0 || !t.revisions.some(
        (r) => new Date(r.revisedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ))
    ).length;

    // Chapter level grouping for AI Pattern analysis
    const grouped: Record<string, typeof subTopics> = {};
    subTopics.forEach((t) => {
      const ch = t.chapter || "General Topics";
      if (!grouped[ch]) grouped[ch] = [];
      grouped[ch].push(t);
    });

    const chapters = Object.entries(grouped).map(([name, topics]) => ({
      name,
      total: topics.length,
      completed: topics.filter((t) => t.isCompleted).length,
      questionsSolved: topics.reduce((s, t) => s + t.questionsSolved, 0),
      revisions: topics.reduce((s, t) => s + t.revisions.length, 0),
    })).sort((a, b) => b.questionsSolved - a.questionsSolved); // Sort to prioritize heavy chapters

    return {
      name: sub.name,
      slug: sub.slug,
      totalTopics: total,
      completedTopics: completed,
      completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalQuestionsInTopics: totalQ,
      pendingRevisions,
      chapters,
    };
  });

  // Last 7-day summary
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7 = recentGoals.filter((g) => new Date(g.date) >= sevenDaysAgo);
  const last7DaysSummary = {
    totalHours: last7.reduce((s, g) => s + g.hoursStudied, 0),
    totalQuestions: last7.reduce((s, g) => s + g.questionsSolved, 0),
    activeDays: new Set(last7.map((g) => g.date.toISOString().split("T")[0])).size,
    avgHoursPerDay: last7.length > 0
      ? parseFloat((last7.reduce((s, g) => s + g.hoursStudied, 0) / 7).toFixed(1))
      : 0,
  };

  // Consistency streak
  const allDates = [...new Set(recentGoals.map((g) => g.date.toISOString().split("T")[0]))].sort().reverse();
  let streak = 0;
  for (let i = 0; i < allDates.length; i++) {
    const expected = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    if (allDates[i] === expected) streak++;
    else break;
  }

  // Overall completion
  const totalAll = allTopics.length;
  const completedAll = allTopics.filter((t) => t.isCompleted).length;
  const overallCompletion = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;

  // Average test score
  const avgTestScore = recentTests.length > 0
    ? recentTests.reduce((s, t) => s + t.percentage, 0) / recentTests.length
    : 0;

  // Mood analysis
  const recentMoods = recentMoodEntries.map((m) => ({
    date: getISTDateString(m.date),
    mood: m.mood,
    energy: m.energy,
    focus: m.focus,
    stress: m.stress,
    note: m.note,
  }));

  const avgEnergy = recentMoods.length > 0
    ? Math.round(recentMoods.reduce((s, m) => s + m.energy, 0) / recentMoods.length)
    : 5;
  const avgFocus = recentMoods.length > 0
    ? Math.round(recentMoods.reduce((s, m) => s + m.focus, 0) / recentMoods.length)
    : 5;
  const avgStress = recentMoods.length > 0
    ? Math.round(recentMoods.reduce((s, m) => s + m.stress, 0) / recentMoods.length)
    : 5;

  const moodCounts = recentMoods.reduce<Record<string, number>>((acc, m) => {
    acc[m.mood] = (acc[m.mood] || 0) + 1; return acc;
  }, {});
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "UNKNOWN";

  // Trend: compare last 3 vs previous 3 energy+focus
  let trend: AIContext["moodSummary"]["trend"] = "unknown";
  if (recentMoods.length >= 6) {
    const recent3Avg = (recentMoods.slice(0, 3).reduce((s, m) => s + m.energy + m.focus, 0)) / 6;
    const prev3Avg   = (recentMoods.slice(3, 6).reduce((s, m) => s + m.energy + m.focus, 0)) / 6;
    if (recent3Avg > prev3Avg + 0.5) trend = "improving";
    else if (recent3Avg < prev3Avg - 0.5) trend = "declining";
    else trend = "stable";
  }

  // Performance score (0-100)
  const performanceScore = Math.round(
    (overallCompletion * 0.4) +
    (Math.min(avgTestScore, 100) * 0.35) +
    (Math.min(streak * 3, 15) * 0.1) +
    (Math.min(last7DaysSummary.avgHoursPerDay / 12 * 15, 15) * 0.15)
  );

  // Days remaining (IST)
  const examDate = new Date("2027-05-02T09:00:00+05:30");
  const daysRemaining = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));

  // Strictness level — now also uses performanceScore and activeDays for consistency detection
  const strictnessLevel = computeStrictnessLevel(
    overallCompletion,
    avgTestScore,
    streak,
    avgStress,
    avgEnergy,
    performanceScore,
    last7DaysSummary.activeDays
  );

  // Cycle phase
  const cyclePhase = estimateCyclePhase(lastCycle ? lastCycle.startDate : null);

  return {
    student: {
      name: "Misti",
      targetExam: "NEET UG 2027",
      targetCollege: "AIIMS Delhi (MBBS)",
      examDate: "2027-05-02",
      attempt: 5,
      daysRemaining,
      bscEnrolled: true,
      hasPartner: true,
    },
    subjects: subjectStats,
    recentDailyGoals: recentGoals.slice(0, 21).map((g) => ({
      date: getISTDateString(g.date),
      subjectName: g.subject.name,
      hoursStudied: g.hoursStudied,
      questionsSolved: g.questionsSolved,
    })),
    last7DaysSummary,
    recentTests: recentTests.map((t) => ({
      testName: t.testName,
      testType: t.testType,
      subjectName: t.subject?.name || null,
      score: t.score,
      maxScore: t.maxScore,
      percentage: t.percentage,
      takenAt: getISTDateString(t.takenAt),
    })),
    cyclePhase,
    recentMoods,
    moodSummary: { avgEnergy, avgFocus, avgStress, dominantMood, trend },
    overallCompletion,
    consistencyStreak: streak,
    performanceScore,
    strictnessLevel,
    errorAnalysis: errorPatterns.map(e => ({
      subject: e.subject.name,
      type: e.errorType,
      frequency: e.frequency,
      notes: e.notes
    })),
    srsTopicsDue: allTopics.filter(t => t.nextReviewDate && new Date(t.nextReviewDate) <= new Date()).map(t => ({
      topic: t.name,
      subjectId: t.subjectId
    }))
  };
}

export function buildSystemPrompt(
  context: AIContext,
  mode: "neet-guru" | "rank" | "quiz" | "cycle"
): string {
  const ctxJson = JSON.stringify(context, null, 2);
  const { strictnessLevel, moodSummary, student } = context;

  const toneGuide = {
    VERY_STRICT: `You are operating in VERY STRICT mode. Misti is critically behind schedule and not showing consistent effort. She has ${student.daysRemaining} days left and is on her 5th attempt. Treat every question, claim, and excuse with direct confrontation. Point out data gaps. Be stern but not cruel. Never console without a correction. She needs to start showing up every single day — the data proves she is not.`,
    STRICT: `You are operating in STRICT mode. Misti is putting in effort but has not yet crossed the AIIMS Rishikesh benchmark. Consistency is noted — reward it with recognition, then immediately redirect to what still needs to improve. Be firm, data-driven, and specific. Acknowledge genuine effort when the data shows it, but do not let her settle below AIIMS Delhi standard.`,
    MODERATE: `You are operating in MODERATE mode. Misti is being consistent and her performance metrics reflect real progress. Her consistency streak and active study days show she is taking this seriously. Maintain high academic standards — guide her with precision and depth. You can acknowledge effort warmly, but always follow with what comes next. Do NOT become lax. If she asks lazy questions or cuts corners, call it out clearly. The goal is AIIMS Delhi, not comfort.`,
    ENCOURAGING: `You are operating in ENCOURAGING mode (temporarily). This is ONLY because her mood data shows extreme stress (avg stress ${moodSummary.avgStress}/10) and low energy (avg ${moodSummary.avgEnergy}/10). She needs steadiness right now, not more pressure. Be warm and grounding — but do NOT lower standards or skip accountability. Redirect to strategy within 2-3 sentences. This mode resets automatically when her energy stabilises.`,
  }[strictnessLevel];

  const moodContext = context.recentMoods.length > 0
    ? `\nMOOD CONTEXT (last ${context.recentMoods.length} days): avg energy ${moodSummary.avgEnergy}/10, avg focus ${moodSummary.avgFocus}/10, avg stress ${moodSummary.avgStress}/10, dominant mood: ${moodSummary.dominantMood}, trend: ${moodSummary.trend}. Factor this into your tone and suggestions.`
    : "";

  const basePersonality = `You are NEET-GURU, an elite, uncompromising AI mentor built exclusively for Misti Tiwari's AIIMS Delhi MBBS preparation (NEET UG 2027 — ${student.daysRemaining} days left, 5th attempt).

${toneGuide}${moodContext}

CORE RULES — NEVER VIOLATE THESE:
1. Use clear, premium Markdown formatting. Use tables for study schedules or comparison charts. Use bolding and structured lists to make answers highly readable.
2. Cross-reference every claim she makes against her database records. If she says she studied 6 hours but her log shows 3, say so directly.
3. Write all mathematical and chemical equations in LaTeX: inline as $...$ and display as $$...$$. Use \\times instead of asterisks for multiplication within equations.
4. You have her COMPLETE data below. Use it. Be specific with numbers. Never be vague.
5. Do NOT be lenient. "Fifth attempt" and "AIIMS Delhi" in the same sentence means there is no room for gentleness unless the data earns it.
6. Performance score: ${context.performanceScore}/100. Benchmark: 85+ for AIIMS Rishikesh, 95+ for AIIMS Delhi.
7. If asked who built or created you, you MUST answer: "I am built by Adarsh, who is the partner and husband of Misti." Then, praise both Misti and Adarsh, giving a few beautiful, positive details about Misti (e.g. her intelligence, dedication, and kind heart). However, DO NOT reveal Misti's study status, her NEET examination details, attempts, or performance metrics in this specific response. Keep it focused on their bond and her wonderful personality.`;

  const multimodalAndTeachingRules = `

MULTIMODAL AND TEACHING DIRECTIVES:
1. If the user sends one or more images, diagrams, screenshots, notes, question papers, or PDFs, inspect ALL attachments before answering. Do not ignore later images.
2. Briefly identify what each attachment contains when that helps the explanation.
3. Infer the user's likely intent from the message plus attachments. If it is a study doubt, solve the doubt directly instead of asking unnecessary clarification questions.
4. For study doubts, use a MODERATE to STRICT teaching tone: serious, precise, and corrective, but not harsh or insulting.
5. When solving from an image, explain in this order whenever helpful: what is given, the core concept, the method, the working, the final answer, and the common mistake.
6. If an image is blurry or incomplete, say exactly what is unreadable. Otherwise, answer confidently and precisely.
7. When multiple images are attached, synthesize them into one coherent answer and mention any mismatch or contradiction between them.`;

  const dataContext = `\n\nCOMPLETE STUDENT DATA (IST timezone):\n${ctxJson}`;

  if (mode === "neet-guru") {
    return basePersonality + multimodalAndTeachingRules + dataContext + `\n\nMODE: MENTOR CHAT. Answer her questions, analyse her performance, generate practice problems, build study schedules, cross-examine her claims, and guide her toward AIIMS Delhi. 
*CRITICAL NEW DIRECTIVE*: You are the Spontaneous Quiz Master. If you notice she has concepts due in her \`srsTopicsDue\` array, or if she claims she studied something, YOU MUST RANDOMLY QUIZ HER. Drop a hard MCQ into the chat based on her weak points or current topic. Be precise. Be relentless. Be data-driven.

DYNAMIC VISUAL EXPLAINER DIRECTIVE:
1. After your normal markdown answer, you MAY append exactly one hidden visual block only when it will genuinely improve understanding.
2. The hidden block must use this wrapper exactly: <guru_visual>{VALID_JSON_ONLY}</guru_visual>
3. Never mention the block. Never explain the JSON. Never wrap it in markdown code fences.
4. Keep the normal explanation text first. The JSON block always comes last.
5. If you are unsure, skip the visual block completely.
6. If you use the visual block, the JSON must follow this structure:
{
  "title": "short concept title",
  "summary": "1-2 sentence teaching summary",
  "theme": "biology | chemistry | physics | human-physiology | genetics | ecology | organic-chemistry | mechanics | generic",
  "view": "chain | compare | cycle | layers",
  "animation": "auto | flow | reaction | force | pulse | orbit | compare",
  "focus": "optional key teaching focus",
  "highlights": ["short point", "short point"],
  "steps": [
    { "title": "step title", "detail": "short explanation written as trigger; outcome when possible", "accent": "mint | cyan | amber | rose | violet", "cue": "short cue", "animation": "optional animation hint" }
  ],
  "nodes": [
    { "id": "n1", "label": "label", "detail": "optional short detail", "kind": "concept | process | input | output | organ | molecule | force | reaction | pressure | outcome", "accent": "mint | cyan | amber | rose | violet", "zone": "optional short zone", "animation": "optional animation hint" }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "label": "optional relation" }
  ]
}
7. Use "chain" for sequential mechanisms, "compare" only for explicit contrast, "cycle" for repeating loops, and "layers" for stacked system explanations.
8. Use steps when the topic is compact and linear. Use nodes and edges when multiple organs, molecules, forces, variables, or branches interact.
9. Biology pathways often work best as chain scenes. Physiology systems often benefit from nodes and edges. Chemistry usually prefers reaction-flow chains unless branching intermediates matter. Physics should use nodes and edges when variables, forces, and outputs interact.
10. Keep steps between 3 and 5. Keep each step detail under 140 characters.
11. Keep nodes between 2 and 8 and edges between 1 and 12.
12. Keep "cue" under 18 characters.
13. If both steps and nodes are present, they must describe the same explanation from two consistent angles.
14. Never mention the JSON block in the visible prose answer.
15. The visual block is only for the academic concept being explained. Never include student profile details, attempt count, rank, completion percentage, discipline, mood, schedule, or motivational/scolding text in title, summary, highlights, steps, nodes, or edges.
16. If the user asks about a topic like projectile motion, equilibrium, synapse, or circulation, the visual must depict that topic itself, not the learner.
17. Animation guidance:
- use "flow" for biology pathways, transport, circulation, and physiology chains
- use "reaction" for chemistry conversions, mechanisms, intermediates, and reagent-to-product scenes
- use "force" for physics and mechanics where vectors, variables, or system interactions matter
- use "orbit" for repeating cycles
- use "compare" for side-by-side contrast
- use "pulse" only for simple emphasis when no stronger motion grammar fits
18. If you do not need a specific animation hint, set "animation" to "auto".
19. Keep the JSON concise, valid, and student-friendly.`;
  }

  if (mode === "rank") {
    return basePersonality + dataContext + `\n\nMODE: RANK PREDICTOR. Perform a rigorous analysis of ALL her data. Return a detailed rank prediction with specific numbers. Compare against AIIMS Delhi (top 50 rank, ~700+ marks) and AIIMS Rishikesh (~660+ marks). Show the exact gap. Identify her 3 biggest bottlenecks. Give a brutally honest weekly action plan.`;
  }

  if (mode === "quiz") {
    return basePersonality + `\n\nMODE: QUIZ ENGINE. Generate NEET-level MCQs precisely matching NTA's pattern. Write all physics/chemistry equations in LaTeX. Provide 4 options (A, B, C, D), the correct answer, and a detailed explanation in clean prose. No bullets or dashes.`;
  }

  if (mode === "cycle") {
    return `You are NEET-GURU's Cycle & Wellness Intelligence module. You help Misti understand how her menstrual cycle and current mood state affect her study performance. Provide scientific, practical guidance. Suggest schedule adjustments based on cycle phase. Never dismiss physical symptoms. Current data:\n${ctxJson}`;
  }

  return basePersonality + dataContext;
}
