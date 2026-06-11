import type { Prisma, TaskPriority } from "@prisma/client";
import { format, parseISO } from "date-fns";

import { db } from "@/lib/db";
import { buildAIContext, type AIContext } from "@/lib/ai-context-builder";
import { chatWithAI } from "@/lib/openrouter";
import { sendWebPushNotification } from "@/lib/web-push";
import { startOfLocalDay } from "@/lib/tasks";
import { buildTaskDescriptionWithReason } from "@/lib/todo-workspace";

/**
 * Morning Command — the autonomous daily planner agent.
 *
 * Every morning at 05:00 IST (from the launch date below) it:
 *  1. reads the live tracker state (goals, tests, completion, error log, SRS, mood, cycle),
 *  2. composes a 12–14 hour study plan (≈50% Botany+Zoology / ≈50% Physics+Chemistry)
 *     with revision blocks drawn from what was actually studied in the last week/month,
 *  3. persists it as a MissionSession + executable Tasks on the todo board,
 *  4. drops an AppNotification and pushes it to every subscribed PWA device.
 *
 * If the AI is unreachable or returns garbage, a deterministic planner built from the
 * same live data takes over — the 05:00 notification must never be missed.
 */

export const PLANNER_LAUNCH_DATE_IST = "2026-06-22";
export const PLANNER_SENDER_LABEL = "Morning Command";
const PLANNER_GOAL_PREFIX = "auto-daily-planner:";
const IST_TIME_ZONE = "Asia/Kolkata";

const PLANNER_SUBJECTS = ["Botany", "Zoology", "Physics", "Chemistry"] as const;
type PlannerSubject = (typeof PLANNER_SUBJECTS)[number] | "Mixed" | "Break";
type PlannerBlockKind = "STUDY" | "PRACTICE" | "REVISION" | "MOCK" | "BREAK";

export type PlannerBlock = {
  start: string; // "HH:MM" 24h IST
  end: string;
  subject: PlannerSubject;
  kind: PlannerBlockKind;
  focus: string;
  detail?: string | null;
};

export type PlannerRevisionItem = {
  subject: string;
  topic: string;
  reason: string;
  lastTouched?: string | null;
};

type PlannerTaskSuggestion = {
  title: string;
  description: string;
  priority: TaskPriority;
  subjectSlug?: string | null;
  plannedMinutes?: number | null;
  rationale: string;
};

export type DailyPlannerPayload = {
  title: string;
  summary: string;
  insights: string[];
  totals: {
    studyHours: number;
    biologyHours: number;
    physicsChemistryHours: number;
    revisionHours: number;
  };
  schedule: PlannerBlock[];
  revisionTodo: PlannerRevisionItem[];
  dailyCommand: {
    primaryOutcome: string;
    questionTarget: number | null;
    revisionTarget: string | null;
    studyMinutes: number | null;
    shutdownRule: string;
  };
  taskSuggestions: PlannerTaskSuggestion[];
};

export type RevisionCandidate = {
  subject: string;
  subjectSlug: string | null;
  chapter: string | null;
  topic: string;
  lastTouched: string | null;
  source: "srs-due" | "revised-last-week" | "studied-last-week" | "studied-last-month";
};

export function getISTDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function plannerGoalMarker(dateIST: string) {
  return `${PLANNER_GOAL_PREFIX}${dateIST}`;
}

function istDayStart(dateIST: string) {
  return new Date(`${dateIST}T00:00:00+05:30`);
}

function humanDate(dateIST: string) {
  try {
    return format(parseISO(`${dateIST}T12:00:00`), "EEE, d MMM");
  } catch {
    return dateIST;
  }
}

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function blockMinutes(block: PlannerBlock): number {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function computeTotals(schedule: PlannerBlock[]): DailyPlannerPayload["totals"] {
  let study = 0;
  let bio = 0;
  let pc = 0;
  let revision = 0;

  for (const block of schedule) {
    if (block.kind === "BREAK" || block.subject === "Break") continue;
    const minutes = blockMinutes(block);
    study += minutes;
    if (block.kind === "REVISION") revision += minutes;
    if (block.subject === "Botany" || block.subject === "Zoology") bio += minutes;
    else if (block.subject === "Physics" || block.subject === "Chemistry") pc += minutes;
    else {
      // Mixed/mock blocks count half-half across the two streams.
      bio += minutes / 2;
      pc += minutes / 2;
    }
  }

  return {
    studyHours: round1(study / 60),
    biologyHours: round1(bio / 60),
    physicsChemistryHours: round1(pc / 60),
    revisionHours: round1(revision / 60),
  };
}

const SUBJECT_ALIASES: Record<string, PlannerSubject> = {
  botany: "Botany",
  zoology: "Zoology",
  biology: "Mixed",
  physics: "Physics",
  chemistry: "Chemistry",
  mixed: "Mixed",
  "full syllabus": "Mixed",
  break: "Break",
};

function normalizeSubject(value: unknown): PlannerSubject | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = PLANNER_SUBJECTS.find((subject) => subject.toLowerCase() === raw.toLowerCase());
  if (direct) return direct;
  return SUBJECT_ALIASES[raw.toLowerCase()] ?? null;
}

const BLOCK_KINDS = new Set<PlannerBlockKind>(["STUDY", "PRACTICE", "REVISION", "MOCK", "BREAK"]);
const TASK_PRIORITIES = new Set<TaskPriority>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function parsePlannerPayload(input: string): DailyPlannerPayload | null {
  const direct = safeJsonParse<DailyPlannerPayload>(input);
  if (direct) return direct;

  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = safeJsonParse<DailyPlannerPayload>(fenced.trim());
    if (parsed) return parsed;
  }

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return safeJsonParse<DailyPlannerPayload>(input.slice(start, end + 1));
  }

  return null;
}

/**
 * Strict validation: structure, time math (11–14.5h), and the bio vs phys+chem
 * split (each side 40–60%). Anything off → deterministic fallback.
 */
function validatePlannerPayload(payload: DailyPlannerPayload | null): DailyPlannerPayload | null {
  if (!payload || typeof payload !== "object") return null;
  if (!payload.title || !payload.summary) return null;
  if (!Array.isArray(payload.schedule) || payload.schedule.length < 6) return null;
  if (!Array.isArray(payload.taskSuggestions) || !payload.taskSuggestions.length) return null;

  const schedule: PlannerBlock[] = [];
  for (const raw of payload.schedule) {
    if (!raw || typeof raw !== "object") return null;
    const subject = normalizeSubject(raw.subject);
    const kind = String(raw.kind ?? "").toUpperCase() as PlannerBlockKind;
    if (!subject || !BLOCK_KINDS.has(kind)) return null;
    if (toMinutes(String(raw.start ?? "")) === null || toMinutes(String(raw.end ?? "")) === null) return null;
    schedule.push({
      start: String(raw.start),
      end: String(raw.end),
      subject,
      kind,
      focus: String(raw.focus ?? "").trim() || "Focused work",
      detail: raw.detail ? String(raw.detail) : null,
    });
  }

  schedule.sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0));
  const totals = computeTotals(schedule);
  if (totals.studyHours < 11 || totals.studyHours > 14.5) return null;
  const split = totals.biologyHours / Math.max(totals.studyHours, 0.1);
  if (split < 0.4 || split > 0.6) return null;

  const revisionTodo: PlannerRevisionItem[] = Array.isArray(payload.revisionTodo)
    ? payload.revisionTodo
        .filter((item) => item && item.topic)
        .map((item) => ({
          subject: String(item.subject ?? "General"),
          topic: String(item.topic),
          reason: String(item.reason ?? "Scheduled revision"),
          lastTouched: item.lastTouched ? String(item.lastTouched) : null,
        }))
        .slice(0, 8)
    : [];

  const taskSuggestions: PlannerTaskSuggestion[] = payload.taskSuggestions
    .filter((task) => task && task.title)
    .map((task) => ({
      title: String(task.title).slice(0, 180),
      description: String(task.description ?? task.title),
      priority: TASK_PRIORITIES.has(task.priority) ? task.priority : "MEDIUM",
      subjectSlug: task.subjectSlug ? String(task.subjectSlug).toLowerCase() : null,
      plannedMinutes:
        typeof task.plannedMinutes === "number" && task.plannedMinutes > 0
          ? Math.min(Math.round(task.plannedMinutes), 360)
          : null,
      rationale: String(task.rationale ?? "Part of today's command plan"),
    }))
    .slice(0, 9);
  if (!taskSuggestions.length) return null;

  return {
    title: String(payload.title).slice(0, 140),
    summary: String(payload.summary),
    insights: Array.isArray(payload.insights) ? payload.insights.map(String).slice(0, 6) : [],
    totals,
    schedule,
    revisionTodo,
    dailyCommand: {
      primaryOutcome: String(payload.dailyCommand?.primaryOutcome ?? "Execute today's full command plan."),
      questionTarget:
        typeof payload.dailyCommand?.questionTarget === "number" ? payload.dailyCommand.questionTarget : null,
      revisionTarget: payload.dailyCommand?.revisionTarget ? String(payload.dailyCommand.revisionTarget) : null,
      studyMinutes: Math.round(totals.studyHours * 60),
      shutdownRule: String(
        payload.dailyCommand?.shutdownRule ?? "The day ends only after every scheduled block is either done or consciously skipped.",
      ),
    },
    taskSuggestions,
  };
}

/**
 * What was actually studied/revised recently + what spaced repetition says is due.
 * This is the raw material for the revision half of the plan.
 */
export async function buildRevisionIntel(now = new Date()): Promise<RevisionCandidate[]> {
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);

  const [dueTopics, recentRevisions, recentlyCompleted] = await Promise.all([
    db.topic.findMany({
      where: { nextReviewDate: { lte: now } },
      include: { subject: { select: { name: true, slug: true } } },
      orderBy: { nextReviewDate: "asc" },
      take: 30,
    }),
    db.revision.findMany({
      where: { revisedAt: { gte: monthAgo } },
      include: { topic: { include: { subject: { select: { name: true, slug: true } } } } },
      orderBy: { revisedAt: "desc" },
      take: 60,
    }),
    db.topic.findMany({
      where: { completedAt: { gte: monthAgo } },
      include: { subject: { select: { name: true, slug: true } } },
      orderBy: { completedAt: "desc" },
      take: 60,
    }),
  ]);

  const seen = new Set<string>();
  const candidates: RevisionCandidate[] = [];

  const push = (candidate: RevisionCandidate) => {
    const key = `${candidate.subjectSlug}::${candidate.topic}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const topic of dueTopics) {
    push({
      subject: topic.subject.name,
      subjectSlug: topic.subject.slug,
      chapter: topic.chapter,
      topic: topic.name,
      lastTouched: topic.completedAt ? getISTDateString(topic.completedAt) : null,
      source: "srs-due",
    });
  }

  for (const revision of recentRevisions) {
    push({
      subject: revision.topic.subject.name,
      subjectSlug: revision.topic.subject.slug,
      chapter: revision.topic.chapter,
      topic: revision.topic.name,
      lastTouched: getISTDateString(revision.revisedAt),
      source: revision.revisedAt >= weekAgo ? "revised-last-week" : "studied-last-month",
    });
  }

  for (const topic of recentlyCompleted) {
    push({
      subject: topic.subject.name,
      subjectSlug: topic.subject.slug,
      chapter: topic.chapter,
      topic: topic.name,
      lastTouched: topic.completedAt ? getISTDateString(topic.completedAt) : null,
      source: topic.completedAt && topic.completedAt >= weekAgo ? "studied-last-week" : "studied-last-month",
    });
  }

  return candidates.slice(0, 60);
}

function candidatesForSubject(candidates: RevisionCandidate[], slug: string) {
  return candidates.filter((candidate) => candidate.subjectSlug === slug);
}

function pickStudyFocus(context: AIContext, slug: string): string {
  const subject = context.subjects.find((entry) => entry.slug === slug);
  const weakZone = context.errorTopicAnalysis?.find(
    (entry) => entry.subject.toLowerCase().includes(slug) && (entry.chapter || entry.topic),
  );
  if (weakZone) {
    return `Weak zone repair: ${weakZone.topic ?? weakZone.chapter} (${weakZone.wrong} wrong in error log)`;
  }
  const pendingChapter = subject?.chapters.find((chapter) => chapter.completed < chapter.total);
  if (pendingChapter) {
    return `Advance ${pendingChapter.name} (${pendingChapter.completed}/${pendingChapter.total} topics done)`;
  }
  return "High-yield NCERT line-by-line + previous-year questions";
}

function pickRevisionFocus(candidates: RevisionCandidate[], slug: string, fallback: string): string {
  const pool = candidatesForSubject(candidates, slug);
  const due = pool.find((candidate) => candidate.source === "srs-due") ?? pool[0];
  if (due) {
    const when = due.lastTouched ? ` (last touched ${due.lastTouched})` : "";
    return `Revise ${due.topic}${due.chapter ? ` — ${due.chapter}` : ""}${when}`;
  }
  return fallback;
}

function reasonForCandidate(candidate: RevisionCandidate) {
  switch (candidate.source) {
    case "srs-due":
      return "Spaced-repetition review is due — memory is about to decay.";
    case "revised-last-week":
      return "Revised in the last 7 days — lock it in with active recall.";
    case "studied-last-week":
      return "Completed this week — first consolidation pass is due.";
    default:
      return "Studied in the last month — schedule a retention check.";
  }
}

/**
 * Deterministic plan built directly from live data. 14h, perfectly split
 * 7h Botany+Zoology / 7h Physics+Chemistry. Used whenever the AI plan fails
 * validation so the morning push always carries a real, data-grounded plan.
 */
function buildFallbackPlannerPayload(
  dateIST: string,
  context: AIContext,
  candidates: RevisionCandidate[],
): DailyPlannerPayload {
  const focus = {
    botany: pickStudyFocus(context, "botany"),
    zoology: pickStudyFocus(context, "zoology"),
    physics: pickStudyFocus(context, "physics"),
    chemistry: pickStudyFocus(context, "chemistry"),
  };

  const schedule: PlannerBlock[] = [
    { start: "05:30", end: "07:30", subject: "Botany", kind: "STUDY", focus: focus.botany },
    { start: "07:30", end: "08:00", subject: "Break", kind: "BREAK", focus: "Breakfast + reset" },
    { start: "08:00", end: "10:00", subject: "Physics", kind: "STUDY", focus: focus.physics },
    { start: "10:00", end: "10:15", subject: "Break", kind: "BREAK", focus: "Short walk, water" },
    { start: "10:15", end: "12:15", subject: "Zoology", kind: "STUDY", focus: focus.zoology },
    { start: "12:15", end: "13:00", subject: "Break", kind: "BREAK", focus: "Lunch" },
    { start: "13:00", end: "15:00", subject: "Chemistry", kind: "STUDY", focus: focus.chemistry },
    { start: "15:00", end: "15:20", subject: "Break", kind: "BREAK", focus: "Power nap / stretch" },
    {
      start: "15:20",
      end: "16:50",
      subject: "Physics",
      kind: "PRACTICE",
      focus: "Timed PYQ set on today's physics chapter — log every miss",
    },
    { start: "16:50", end: "17:05", subject: "Break", kind: "BREAK", focus: "Snack" },
    {
      start: "17:05",
      end: "18:35",
      subject: "Botany",
      kind: "REVISION",
      focus: pickRevisionFocus(candidates, "botany", "Active recall on this week's botany chapters"),
    },
    { start: "18:35", end: "19:15", subject: "Break", kind: "BREAK", focus: "Dinner + walk" },
    {
      start: "19:15",
      end: "20:45",
      subject: "Chemistry",
      kind: "PRACTICE",
      focus: "NCERT-based MCQ drill + reaction recall on today's chemistry chapter",
    },
    { start: "20:45", end: "21:00", subject: "Break", kind: "BREAK", focus: "Reset" },
    {
      start: "21:00",
      end: "22:30",
      subject: "Zoology",
      kind: "REVISION",
      focus: pickRevisionFocus(candidates, "zoology", "Recall-first revision of this week's zoology topics"),
    },
  ];

  const totals = computeTotals(schedule);

  const revisionTodo: PlannerRevisionItem[] = candidates.slice(0, 6).map((candidate) => ({
    subject: candidate.subject,
    topic: candidate.chapter ? `${candidate.topic} (${candidate.chapter})` : candidate.topic,
    reason: reasonForCandidate(candidate),
    lastTouched: candidate.lastTouched,
  }));

  const slugByName: Record<string, string> = { Botany: "botany", Zoology: "zoology", Physics: "physics", Chemistry: "chemistry" };
  const taskSuggestions: PlannerTaskSuggestion[] = schedule
    .filter((block) => block.kind !== "BREAK")
    .map((block) => ({
      title: `${block.start} ${block.subject} ${block.kind === "STUDY" ? "deep work" : block.kind.toLowerCase()}: ${block.focus.slice(0, 110)}`,
      description: `${block.start}–${block.end} · ${block.subject} · ${block.focus}`,
      priority: (block.kind === "REVISION" ? "HIGH" : "CRITICAL") as TaskPriority,
      subjectSlug: slugByName[block.subject] ?? null,
      plannedMinutes: blockMinutes(block),
      rationale: "Auto-generated from today's Morning Command schedule.",
    }))
    .slice(0, 8);

  return {
    title: `Morning Command — ${humanDate(dateIST)}`,
    summary: `A ${totals.studyHours}h execution day built from the live tracker: ${totals.biologyHours}h Biology and ${totals.physicsChemistryHours}h Physics+Chemistry, with ${totals.revisionHours}h of revision targeted at what was studied in the last week and month.`,
    insights: [
      `Overall syllabus completion stands at ${context.overallCompletion}% with ${context.student.daysRemaining} days to NEET UG 2027.`,
      `Last 7 days: ${context.last7DaysSummary.totalHours}h studied across ${context.last7DaysSummary.activeDays} active days (target is 12–14h daily).`,
      candidates.length
        ? `${candidates.length} revision candidates detected from recent study history and spaced-repetition dues.`
        : "No recent revision candidates found — today seeds the revision pipeline.",
    ],
    totals,
    schedule,
    revisionTodo,
    dailyCommand: {
      primaryOutcome: "Complete all four subject blocks and both revision lanes without skipping the practice sets.",
      questionTarget: 120,
      revisionTarget: revisionTodo[0]?.topic ?? "One overdue topic per biology stream",
      studyMinutes: Math.round(totals.studyHours * 60),
      shutdownRule: "Lights out only after the error log for today's practice sets is filled.",
    },
    taskSuggestions,
  };
}

function buildPlannerPrompt(
  dateIST: string,
  context: AIContext,
  candidates: RevisionCandidate[],
): string {
  return [
    `You are "Morning Command", the autonomous daily study planner for Misti's NEET UG 2027 preparation (5th attempt, target AIIMS Delhi).`,
    `Plan date: ${dateIST} (${humanDate(dateIST)}). All times are IST.`,
    "Build today's complete battle plan from the live tracker data below. Every focus line must name real chapters/topics from the data — never invent syllabus state.",
    `HARD RULES:
1. Respond with valid JSON only. No markdown fences, no prose outside JSON.
2. Total focused time (STUDY + PRACTICE + REVISION + MOCK) must be between 12.0 and 14.0 hours.
3. Biology (Botany + Zoology together) gets one half of study time; Physics + Chemistry the other half. Each side must be 45–55% of the total.
4. Day runs from 05:30 to at latest 23:00. Insert BREAK blocks for meals/rest (they do not count as study). Blocks must be contiguous, non-overlapping, "HH:MM" 24-hour format.
5. Include 2 to 4 REVISION blocks. Their focus MUST come from revisionCandidates (topics actually studied in the last week/month or due for spaced review) and the weakest entries of errorTopicAnalysis. Use exact topic and chapter names.
6. STUDY/PRACTICE focus must target incomplete chapters, weak test areas, and error-log weak zones from the data — name them precisely.
7. Put the weakest/heaviest subject in the freshest slots (early morning, post-breakfast). Alternate biology with physics/chemistry to manage fatigue.
8. Respect mood/energy/stress and cycle phase: if energy is low or stress is high, keep late-evening work recall-based instead of heavy new theory.
9. Provide 5 to 8 taskSuggestions: concrete, checkable todos that mirror the schedule (include the revision items). priority is one of LOW|MEDIUM|HIGH|CRITICAL, subjectSlug is botany|zoology|physics|chemistry or null.
10. insights: 3-5 sharp, data-grounded observations with real numbers.`,
    `JSON schema:
{
  "title": "short plan title",
  "summary": "3-4 sentence overview of the day strategy",
  "insights": ["...", "...", "..."],
  "schedule": [
    { "start": "05:30", "end": "07:30", "subject": "Botany|Zoology|Physics|Chemistry|Mixed|Break", "kind": "STUDY|PRACTICE|REVISION|MOCK|BREAK", "focus": "exact chapter/topic focus", "detail": "optional execution note" }
  ],
  "revisionTodo": [
    { "subject": "Physics", "topic": "exact topic (chapter)", "reason": "why today", "lastTouched": "YYYY-MM-DD or null" }
  ],
  "dailyCommand": {
    "primaryOutcome": "single sentence",
    "questionTarget": 120,
    "revisionTarget": "string",
    "studyMinutes": 780,
    "shutdownRule": "single sentence"
  },
  "taskSuggestions": [
    { "title": "...", "description": "...", "priority": "HIGH", "subjectSlug": "physics", "plannedMinutes": 90, "rationale": "..." }
  ]
}`,
    `revisionCandidates (what she actually studied recently + spaced-repetition dues):\n${JSON.stringify(candidates, null, 2)}`,
    `Live student context JSON:\n${JSON.stringify(context, null, 2)}`,
  ].join("\n\n");
}

function buildPlannerMarkdown(dateIST: string, payload: DailyPlannerPayload) {
  const scheduleRows = payload.schedule
    .map((block) => `| ${block.start}–${block.end} | ${block.subject} | ${block.kind} | ${block.focus} |`)
    .join("\n");

  const sections = [
    `## ${payload.title}`,
    payload.summary,
    `**Totals:** ${payload.totals.studyHours}h study · Biology ${payload.totals.biologyHours}h · Physics+Chemistry ${payload.totals.physicsChemistryHours}h · Revision ${payload.totals.revisionHours}h`,
    "## Schedule",
    `| Time | Subject | Mode | Focus |\n| --- | --- | --- | --- |\n${scheduleRows}`,
  ];

  if (payload.revisionTodo.length) {
    sections.push(
      "## Revision targets",
      payload.revisionTodo
        .map((item) => `- **${item.subject}** — ${item.topic}: ${item.reason}${item.lastTouched ? ` (last touched ${item.lastTouched})` : ""}`)
        .join("\n"),
    );
  }

  if (payload.insights.length) {
    sections.push("## Signals", payload.insights.map((insight) => `- ${insight}`).join("\n"));
  }

  sections.push(
    "## Daily command",
    [
      `- Primary outcome: ${payload.dailyCommand.primaryOutcome}`,
      payload.dailyCommand.questionTarget ? `- Question target: ${payload.dailyCommand.questionTarget}` : "",
      payload.dailyCommand.revisionTarget ? `- Revision target: ${payload.dailyCommand.revisionTarget}` : "",
      `- Shutdown rule: ${payload.dailyCommand.shutdownRule}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return sections.join("\n\n");
}

async function createPlannerTasks(sessionId: string, dateIST: string, suggestions: PlannerTaskSuggestion[]) {
  if (!suggestions.length) return 0;

  const subjects = await db.subject.findMany({ select: { id: true, slug: true } });
  const slugMap = new Map(subjects.map((subject) => [subject.slug, subject.id]));
  const lastTask = await db.task.findFirst({
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  let orderIndex = (lastTask?.orderIndex ?? -1) + 1;

  let created = 0;
  for (const suggestion of suggestions) {
    await db.task.create({
      data: {
        missionId: sessionId,
        source: "AI",
        title: suggestion.title,
        description: buildTaskDescriptionWithReason(suggestion.description, suggestion.rationale),
        priority: suggestion.priority,
        subjectId: suggestion.subjectSlug ? (slugMap.get(suggestion.subjectSlug) ?? null) : null,
        dueDate: startOfLocalDay(dateIST),
        plannedMinutes: suggestion.plannedMinutes ?? null,
        aiAssistEnabled: true,
        orderIndex: orderIndex++,
        timelineEvents: {
          create: {
            type: "CREATED",
            label: "Morning Command task created",
            detail: `Daily planner for ${dateIST}`,
          },
        },
      },
    });
    created += 1;
  }
  return created;
}

function buildNotificationBody(payload: DailyPlannerPayload): string {
  const firstBlock = payload.schedule.find((block) => block.kind !== "BREAK");
  const revisionNames = payload.revisionTodo
    .slice(0, 2)
    .map((item) => item.topic)
    .join("; ");

  const parts = [
    `${payload.totals.studyHours}h locked: Biology ${payload.totals.biologyHours}h · Phy+Chem ${payload.totals.physicsChemistryHours}h.`,
    firstBlock ? `First block ${firstBlock.start} — ${firstBlock.subject}: ${firstBlock.focus}.` : "",
    revisionNames ? `Revision targets: ${revisionNames}.` : "",
    "Open the planner for the full schedule.",
  ].filter(Boolean);

  return parts.join(" ").slice(0, 420);
}

async function notifyPlanner(dateIST: string, payload: DailyPlannerPayload) {
  // One morning push per IST day, no matter how many times generation is retried.
  const existing = await db.appNotification.findFirst({
    where: {
      senderLabel: PLANNER_SENDER_LABEL,
      createdAt: { gte: istDayStart(dateIST) },
    },
    select: { id: true },
  });
  if (existing) return { notified: false, reason: "already-notified" as const };

  const notification = await db.appNotification.create({
    data: {
      title: `Today's plan · ${humanDate(dateIST)}`,
      body: buildNotificationBody(payload),
      tone: "focus",
      senderLabel: PLANNER_SENDER_LABEL,
      senderClientId: null,
    },
  });

  const push = await sendWebPushNotification({ ...notification, url: "/planner" }, null);
  return { notified: true as const, push };
}

export type EnsurePlannerResult = {
  date: string;
  created: boolean;
  sessionId: string;
  model: string | null;
  payload: DailyPlannerPayload;
  markdown: string;
  createdAt: Date;
  tasksCreated: number;
  notification: { notified: boolean; reason?: string; push?: { sent: number; failed: number } };
};

export async function findPlannerSession(dateIST: string) {
  return db.missionSession.findFirst({
    where: { kind: "DAILY_COMMAND", goal: plannerGoalMarker(dateIST) },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Idempotent entry point used by both the 05:00 IST cron and the self-healing
 * app path. Generates today's plan if missing, then (optionally) sends the
 * once-per-day notification to the panel + every push-subscribed device.
 */
export async function ensureDailyPlanner(options: { notify?: boolean; force?: boolean } = {}): Promise<EnsurePlannerResult> {
  const dateIST = getISTDateString();
  const marker = plannerGoalMarker(dateIST);

  let session = await findPlannerSession(dateIST);

  if (session && options.force) {
    // Admin/testing path: drop today's auto-created, untouched tasks and rebuild.
    await db.task.deleteMany({
      where: { missionId: session.id, source: "AI", status: "TODO" },
    });
    await db.missionSession.delete({ where: { id: session.id } }).catch(() => {});
    session = null;
  }

  let created = false;
  let tasksCreated = 0;

  if (!session) {
    const [context, candidates] = await Promise.all([buildAIContext(), buildRevisionIntel()]);

    let payload: DailyPlannerPayload | null = null;
    let model = "deterministic-fallback";

    try {
      const result = await chatWithAI(
        [
          {
            role: "system",
            content:
              "You are a highly constrained NEET daily-planning engine. Respond only with valid JSON. Never include markdown fences.",
          },
          { role: "user", content: buildPlannerPrompt(dateIST, context, candidates) },
        ],
        3200,
        0.25,
        150000,
      );
      payload = validatePlannerPayload(parsePlannerPayload(result.content));
      if (payload) model = result.model;
      else console.warn("[daily-planner] AI payload failed validation; using deterministic fallback.");
    } catch (error) {
      console.warn("[daily-planner] AI generation failed; using deterministic fallback.", error);
    }

    if (!payload) {
      payload = buildFallbackPlannerPayload(dateIST, context, candidates);
    }

    const markdown = buildPlannerMarkdown(dateIST, payload);
    session = await db.missionSession.create({
      data: {
        kind: "DAILY_COMMAND",
        status: "APPLIED",
        title: payload.title,
        goal: marker,
        summary: payload.summary,
        responseMarkdown: markdown,
        responseJson: payload as unknown as Prisma.InputJsonValue,
        model,
      },
    });
    tasksCreated = await createPlannerTasks(session.id, dateIST, payload.taskSuggestions);
    created = true;
  }

  const payload = session.responseJson as unknown as DailyPlannerPayload;
  const notification = options.notify
    ? await notifyPlanner(dateIST, payload)
    : { notified: false, reason: "notify-disabled" };

  return {
    date: dateIST,
    created,
    sessionId: session.id,
    model: session.model,
    payload,
    markdown: session.responseMarkdown,
    createdAt: session.createdAt,
    tasksCreated,
    notification,
  };
}
