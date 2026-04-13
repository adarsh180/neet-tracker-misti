import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { AIContext } from "@/lib/ai-context-builder";

const MEMORY_VERSION = 1;
const DEFAULT_USER_ID = "misti";
const LEGACY_MEMORY_DIR = path.join(process.cwd(), ".data", "ai-memory");

type MemoryMode = "neet-guru" | "rank" | "quiz" | "cycle";

interface MemoryFact {
  key: string;
  subject?: string;
  topic?: string;
  detail: string;
  score: number;
  count: number;
  lastUpdated: string;
}

interface MemorySnapshot {
  id: string;
  conversationId: string;
  mode: MemoryMode;
  createdAt: string;
  topics: string[];
  subjects: string[];
  summary: string;
  importance: number;
  signals: string[];
}

interface MemoryPreferences {
  explanationStyle: string[];
  responseStyle: string[];
  practiceMode: string[];
  tone: string[];
}

interface MemoryStats {
  totalConversations: number;
  totalUpdates: number;
}

export interface AIMemoryProfile {
  version: number;
  userId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  stats: MemoryStats;
  preferences: MemoryPreferences;
  strengths: MemoryFact[];
  weaknesses: MemoryFact[];
  misconceptions: MemoryFact[];
  behavioralPatterns: MemoryFact[];
  conversationSnapshots: MemorySnapshot[];
  rollingSummary: string;
}

interface ExchangeInput {
  userId?: string;
  displayName?: string;
  conversationId: string;
  mode: MemoryMode;
  userMessage: string;
  assistantMessage: string;
  context: AIContext;
}

interface RelevantSignals {
  subjects: string[];
  topics: string[];
  strengths: MemoryFact[];
  weaknesses: MemoryFact[];
  misconceptions: MemoryFact[];
  behavioralPatterns: MemoryFact[];
  preferences: MemoryPreferences;
  snapshots: MemorySnapshot[];
}

const EMPTY_PREFERENCES: MemoryPreferences = {
  explanationStyle: [],
  responseStyle: [],
  practiceMode: [],
  tone: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, "-") || DEFAULT_USER_ID;
}

function buildLegacyMemoryPath(userId: string) {
  return path.join(LEGACY_MEMORY_DIR, `${slugify(userId)}.json`);
}

function createEmptyProfile(userId: string, displayName: string): AIMemoryProfile {
  const timestamp = nowIso();
  return {
    version: MEMORY_VERSION,
    userId,
    displayName,
    createdAt: timestamp,
    updatedAt: timestamp,
    stats: {
      totalConversations: 0,
      totalUpdates: 0,
    },
    preferences: { ...EMPTY_PREFERENCES },
    strengths: [],
    weaknesses: [],
    misconceptions: [],
    behavioralPatterns: [],
    conversationSnapshots: [],
    rollingSummary: "",
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isMemoryFactArray(value: unknown): value is MemoryFact[] {
  return Array.isArray(value);
}

function isMemorySnapshotArray(value: unknown): value is MemorySnapshot[] {
  return Array.isArray(value);
}

function isMemoryStats(value: unknown): value is MemoryStats {
  return typeof value === "object" && value !== null;
}

function isMemoryPreferences(value: unknown): value is MemoryPreferences {
  return typeof value === "object" && value !== null;
}

function coerceStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseProfileRow(
  row: {
    userId: string;
    displayName: string;
    version: number;
    stats: Prisma.JsonValue;
    preferences: Prisma.JsonValue;
    strengths: Prisma.JsonValue;
    weaknesses: Prisma.JsonValue;
    misconceptions: Prisma.JsonValue;
    behavioralPatterns: Prisma.JsonValue;
    conversationSnapshots: Prisma.JsonValue;
    rollingSummary: string;
    createdAt: Date;
    updatedAt: Date;
  },
  fallbackDisplayName: string
): AIMemoryProfile {
  const base = createEmptyProfile(row.userId, row.displayName || fallbackDisplayName);

  return {
    ...base,
    version: row.version || MEMORY_VERSION,
    displayName: row.displayName || fallbackDisplayName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stats: isMemoryStats(row.stats) ? (row.stats as MemoryStats) : base.stats,
    preferences: isMemoryPreferences(row.preferences)
      ? {
          explanationStyle: coerceStringArray((row.preferences as MemoryPreferences).explanationStyle),
          responseStyle: coerceStringArray((row.preferences as MemoryPreferences).responseStyle),
          practiceMode: coerceStringArray((row.preferences as MemoryPreferences).practiceMode),
          tone: coerceStringArray((row.preferences as MemoryPreferences).tone),
        }
      : base.preferences,
    strengths: isMemoryFactArray(row.strengths) ? row.strengths : base.strengths,
    weaknesses: isMemoryFactArray(row.weaknesses) ? row.weaknesses : base.weaknesses,
    misconceptions: isMemoryFactArray(row.misconceptions) ? row.misconceptions : base.misconceptions,
    behavioralPatterns: isMemoryFactArray(row.behavioralPatterns) ? row.behavioralPatterns : base.behavioralPatterns,
    conversationSnapshots: isMemorySnapshotArray(row.conversationSnapshots) ? row.conversationSnapshots : base.conversationSnapshots,
    rollingSummary: row.rollingSummary || "",
  };
}

async function loadLegacyProfile(userId: string, displayName: string): Promise<AIMemoryProfile | null> {
  try {
    const raw = await readFile(buildLegacyMemoryPath(userId), "utf8");
    const parsed = JSON.parse(raw) as AIMemoryProfile;
    return {
      ...createEmptyProfile(userId, displayName),
      ...parsed,
      userId,
      displayName: parsed.displayName || displayName,
    };
  } catch {
    return null;
  }
}

async function persistProfile(profile: AIMemoryProfile) {
  await db.aiMemoryProfile.upsert({
    where: { userId: profile.userId },
    update: {
      displayName: profile.displayName,
      version: profile.version,
      stats: toJsonValue(profile.stats),
      preferences: toJsonValue(profile.preferences),
      strengths: toJsonValue(profile.strengths),
      weaknesses: toJsonValue(profile.weaknesses),
      misconceptions: toJsonValue(profile.misconceptions),
      behavioralPatterns: toJsonValue(profile.behavioralPatterns),
      conversationSnapshots: toJsonValue(profile.conversationSnapshots),
      rollingSummary: profile.rollingSummary,
    },
    create: {
      userId: profile.userId,
      displayName: profile.displayName,
      version: profile.version,
      stats: toJsonValue(profile.stats),
      preferences: toJsonValue(profile.preferences),
      strengths: toJsonValue(profile.strengths),
      weaknesses: toJsonValue(profile.weaknesses),
      misconceptions: toJsonValue(profile.misconceptions),
      behavioralPatterns: toJsonValue(profile.behavioralPatterns),
      conversationSnapshots: toJsonValue(profile.conversationSnapshots),
      rollingSummary: profile.rollingSummary,
    },
  });
}

export async function loadMemoryProfile(userId = DEFAULT_USER_ID, displayName = "Misti"): Promise<AIMemoryProfile> {
  const normalizedUserId = slugify(userId);
  const row = await db.aiMemoryProfile.findUnique({ where: { userId: normalizedUserId } });

  if (row) {
    return parseProfileRow(row, displayName);
  }

  const legacy = await loadLegacyProfile(normalizedUserId, displayName);
  if (legacy) {
    await persistProfile(legacy);
    return legacy;
  }

  return createEmptyProfile(normalizedUserId, displayName);
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2);
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function limitList(values: string[], size = 5) {
  return uniqueValues(values).slice(0, size);
}

function scoreRecency(dateIso: string) {
  const ageMs = Math.max(0, Date.now() - new Date(dateIso).getTime());
  const ageDays = ageMs / 86400000;
  if (ageDays <= 3) return 3;
  if (ageDays <= 10) return 2;
  if (ageDays <= 30) return 1;
  return 0;
}

function computeOverlapScore(text: string, candidates: string[]) {
  const normalized = normalizeText(text);
  return candidates.reduce((score, candidate) => {
    if (!candidate) return score;
    return normalized.includes(normalizeText(candidate)) ? score + 1 : score;
  }, 0);
}

function getSubjectAndTopicSignals(text: string, context: AIContext) {
  const normalized = normalizeText(text);
  const subjects = context.subjects
    .filter((subject) => normalized.includes(normalizeText(subject.name)) || normalized.includes(normalizeText(subject.slug)))
    .map((subject) => subject.name);

  const chapterCandidates = context.subjects.flatMap((subject) =>
    subject.chapters
      .map((chapter) => ({
        subject: subject.name,
        topic: chapter.name,
      }))
      .filter((chapter) => normalizeText(chapter.topic).length > 3)
  );

  const topics = chapterCandidates
    .filter((chapter) => normalized.includes(normalizeText(chapter.topic)))
    .map((chapter) => `${chapter.subject}: ${chapter.topic}`);

  return {
    subjects: uniqueValues(subjects),
    topics: uniqueValues(topics),
  };
}

function extractPreferenceSignals(text: string) {
  const normalized = normalizeText(text);

  const explanationStyle = [
    /step by step|stepwise|break it down/.test(normalized) ? "step-by-step explanations" : "",
    /simple|easy language|beginner/.test(normalized) ? "simple explanations" : "",
    /detailed|deep|in depth|elaborate/.test(normalized) ? "detailed explanations" : "",
  ];

  const responseStyle = [
    /table|tabular|compare|comparison/.test(normalized) ? "comparison tables when useful" : "",
    /short|brief|concise|quick answer/.test(normalized) ? "concise summaries first" : "",
    /plan|schedule|roadmap/.test(normalized) ? "actionable study planning" : "",
  ];

  const practiceMode = [
    /quiz|mcq|test me|ask me questions/.test(normalized) ? "frequent MCQ-based reinforcement" : "",
    /revise|revision|recall/.test(normalized) ? "retrieval-based revision prompts" : "",
  ];

  const tone = [
    /strict|brutal|honest|push me|relentless/.test(normalized) ? "strict accountability" : "",
    /gentle|calm|encourage|supportive/.test(normalized) ? "supportive framing when stressed" : "",
  ];

  return {
    explanationStyle: limitList(explanationStyle),
    responseStyle: limitList(responseStyle),
    practiceMode: limitList(practiceMode),
    tone: limitList(tone),
  };
}

function makeFactKey(type: string, subject: string | undefined, topic: string | undefined, detail: string) {
  return `${type}:${normalizeText(subject || "general")}:${normalizeText(topic || "general")}:${normalizeText(detail)}`;
}

function createFact(
  type: string,
  detail: string,
  timestamp: string,
  opts?: {
    subject?: string;
    topic?: string;
    score?: number;
  }
): MemoryFact {
  return {
    key: makeFactKey(type, opts?.subject, opts?.topic, detail),
    subject: opts?.subject,
    topic: opts?.topic,
    detail,
    score: opts?.score ?? 1,
    count: 1,
    lastUpdated: timestamp,
  };
}

function extractLearningSignals(text: string, context: AIContext, assistantMessage: string) {
  const timestamp = nowIso();
  const { subjects, topics } = getSubjectAndTopicSignals(text, context);
  const normalized = normalizeText(text);
  const assistantNormalized = normalizeText(assistantMessage);

  const firstSubject = subjects[0];
  const firstTopic = topics[0];
  const focusLabel = firstTopic || firstSubject || "current topic";

  const weaknesses: MemoryFact[] = [];
  const strengths: MemoryFact[] = [];
  const misconceptions: MemoryFact[] = [];
  const behavioralPatterns: MemoryFact[] = [];

  if (/weak|struggle|hard for me|difficult|can t solve|cannot solve|confused|not sure|don t understand|forgot/.test(normalized)) {
    weaknesses.push(
      createFact("weakness", `Needs reinforcement in ${focusLabel}.`, timestamp, {
        subject: firstSubject,
        topic: firstTopic,
        score: 3,
      })
    );
  }

  if (/mistake|wrong|incorrect|mixed up|mixing up|misconception|confuse between|thought that/.test(normalized)) {
    misconceptions.push(
      createFact("misconception", `Recurring confusion detected in ${focusLabel}.`, timestamp, {
        subject: firstSubject,
        topic: firstTopic,
        score: 3,
      })
    );
  }

  if (/strong in|good at|comfortable with|confident in|easy for me/.test(normalized) || /you are strong|solid foundation/.test(assistantNormalized)) {
    strengths.push(
      createFact("strength", `Shows confidence in ${focusLabel}.`, timestamp, {
        subject: firstSubject,
        topic: firstTopic,
        score: 2,
      })
    );
  }

  if (/not sure|maybe|i think|guess|probably/.test(normalized)) {
    behavioralPatterns.push(
      createFact("behavior", `Often shows hesitation before committing to an answer.`, timestamp, {
        subject: firstSubject,
        topic: firstTopic,
        score: 2,
      })
    );
  }

  if (/panic|stressed|overwhelmed|anxious|scared/.test(normalized)) {
    behavioralPatterns.push(
      createFact("behavior", `Stress spikes around ${focusLabel}.`, timestamp, {
        subject: firstSubject,
        topic: firstTopic,
        score: 3,
      })
    );
  }

  if (/procrastinat|avoid|delay|skip/.test(normalized)) {
    behavioralPatterns.push(
      createFact("behavior", `Tends to avoid or delay work when facing resistance.`, timestamp, {
        subject: firstSubject,
        topic: firstTopic,
        score: 2,
      })
    );
  }

  return {
    subjects,
    topics,
    strengths,
    weaknesses,
    misconceptions,
    behavioralPatterns,
  };
}

function mergePreferenceBucket(existing: string[], incoming: string[]) {
  return limitList([...existing, ...incoming], 6);
}

function upsertFacts(existing: MemoryFact[], incoming: MemoryFact[]) {
  const map = new Map(existing.map((fact) => [fact.key, { ...fact }]));

  for (const fact of incoming) {
    const current = map.get(fact.key);
    if (current) {
      current.count += fact.count;
      current.score += fact.score;
      current.lastUpdated = fact.lastUpdated;
      map.set(fact.key, current);
    } else {
      map.set(fact.key, { ...fact });
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    })
    .slice(0, 30);
}

function buildSnapshot(input: ExchangeInput, signals: ReturnType<typeof extractLearningSignals>) {
  const summaryParts = [
    signals.subjects.length > 0 ? `Discussed ${signals.subjects.join(", ")}` : "Discussed a general mentoring question",
    signals.topics.length > 0 ? `focused on ${signals.topics.join(", ")}` : "",
    signals.weaknesses.length > 0 ? "with weakness signals noted" : "",
    signals.misconceptions.length > 0 ? "and misconception correction needed" : "",
  ].filter(Boolean);

  const importance = 1 + signals.weaknesses.length * 2 + signals.misconceptions.length * 2 + signals.behavioralPatterns.length + signals.topics.length;

  return {
    id: randomUUID(),
    conversationId: input.conversationId,
    mode: input.mode,
    createdAt: nowIso(),
    topics: signals.topics,
    subjects: signals.subjects,
    summary: `${summaryParts.join(" ")}. User asked: ${input.userMessage.slice(0, 160).trim()}`,
    importance,
    signals: [
      ...signals.weaknesses.map((item) => item.detail),
      ...signals.misconceptions.map((item) => item.detail),
      ...signals.behavioralPatterns.map((item) => item.detail),
    ].slice(0, 6),
  } satisfies MemorySnapshot;
}

function rebuildRollingSummary(profile: AIMemoryProfile) {
  const weaknessText = profile.weaknesses.slice(0, 4).map((fact) => fact.detail);
  const strengthText = profile.strengths.slice(0, 3).map((fact) => fact.detail);
  const behaviorText = profile.behavioralPatterns.slice(0, 3).map((fact) => fact.detail);

  return [
    weaknessText.length > 0 ? `Recurring weak points: ${weaknessText.join(" | ")}` : "",
    strengthText.length > 0 ? `Trusted strengths: ${strengthText.join(" | ")}` : "",
    behaviorText.length > 0 ? `Behavioral patterns: ${behaviorText.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function compactSnapshots(profile: AIMemoryProfile) {
  const snapshots = [...profile.conversationSnapshots].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  profile.conversationSnapshots = snapshots.slice(0, 40);
}

function getRelevantSignals(profile: AIMemoryProfile, message: string, context: AIContext): RelevantSignals {
  const textTokens = tokenize(message);
  const subjectSignals = getSubjectAndTopicSignals(message, context);
  const overlapCandidates = [...subjectSignals.subjects, ...subjectSignals.topics, ...textTokens];

  const rankFacts = (facts: MemoryFact[]) =>
    [...facts]
      .map((fact) => ({
        fact,
        score:
          fact.score +
          scoreRecency(fact.lastUpdated) +
          computeOverlapScore(`${fact.detail} ${fact.subject || ""} ${fact.topic || ""}`, overlapCandidates) * 2,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.fact);

  const rankSnapshots = (snapshots: MemorySnapshot[]) =>
    [...snapshots]
      .map((snapshot) => ({
        snapshot,
        score:
          snapshot.importance +
          scoreRecency(snapshot.createdAt) +
          computeOverlapScore(`${snapshot.summary} ${snapshot.subjects.join(" ")} ${snapshot.topics.join(" ")}`, overlapCandidates) * 2,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.snapshot);

  return {
    subjects: subjectSignals.subjects,
    topics: subjectSignals.topics,
    strengths: rankFacts(profile.strengths).slice(0, 3),
    weaknesses: rankFacts(profile.weaknesses).slice(0, 4),
    misconceptions: rankFacts(profile.misconceptions).slice(0, 3),
    behavioralPatterns: rankFacts(profile.behavioralPatterns).slice(0, 3),
    preferences: profile.preferences,
    snapshots: rankSnapshots(profile.conversationSnapshots).slice(0, 4),
  };
}

function buildAdaptiveDirectives(relevant: RelevantSignals) {
  const directives: string[] = [];

  if (relevant.preferences.explanationStyle.length > 0) {
    directives.push(`Preferred explanation style: ${relevant.preferences.explanationStyle.join(", ")}.`);
  }
  if (relevant.preferences.responseStyle.length > 0) {
    directives.push(`Preferred response format: ${relevant.preferences.responseStyle.join(", ")}.`);
  }
  if (relevant.preferences.practiceMode.length > 0) {
    directives.push(`Preferred practice mode: ${relevant.preferences.practiceMode.join(", ")}.`);
  }
  if (relevant.preferences.tone.length > 0) {
    directives.push(`Preferred mentor tone: ${relevant.preferences.tone.join(", ")}.`);
  }
  if (relevant.weaknesses.length > 0) {
    directives.push(`Automatically reinforce weak areas when they appear, especially ${relevant.weaknesses[0].detail}`);
  }
  if (relevant.misconceptions.length > 0) {
    directives.push("Correct recurring misconceptions directly before moving on.");
  }
  if (relevant.strengths.length > 0) {
    directives.push("Increase difficulty slightly on proven strengths instead of repeating easy explanations.");
  }
  if (relevant.behavioralPatterns.some((pattern) => pattern.detail.includes("hesitation"))) {
    directives.push("Ask for commitment and direct answers when the user hesitates.");
  }

  return directives.slice(0, 5);
}

export async function buildMemoryContextForPrompt(input: {
  userId?: string;
  displayName?: string;
  latestMessage: string;
  context: AIContext;
}) {
  const userId = slugify(input.userId || input.context.student.name || DEFAULT_USER_ID);
  const profile = await loadMemoryProfile(userId, input.displayName || input.context.student.name || "Misti");
  const relevant = getRelevantSignals(profile, input.latestMessage, input.context);
  const adaptiveDirectives = buildAdaptiveDirectives(relevant);

  const sections = [
    `PERSISTENT MEMORY PROFILE FOR ${profile.displayName.toUpperCase()} (long-term, cross-session). Use this to personalize guidance without changing your existing role.`,
    profile.rollingSummary ? `Rolling summary:\n${profile.rollingSummary}` : "",
    relevant.weaknesses.length > 0 ? `Recurring weak areas:\n${relevant.weaknesses.map((fact) => `- ${fact.detail}`).join("\n")}` : "",
    relevant.strengths.length > 0 ? `Trusted strengths:\n${relevant.strengths.map((fact) => `- ${fact.detail}`).join("\n")}` : "",
    relevant.misconceptions.length > 0 ? `Known misconceptions:\n${relevant.misconceptions.map((fact) => `- ${fact.detail}`).join("\n")}` : "",
    relevant.behavioralPatterns.length > 0 ? `Behavioral patterns:\n${relevant.behavioralPatterns.map((fact) => `- ${fact.detail}`).join("\n")}` : "",
    relevant.snapshots.length > 0
      ? `Most relevant past interactions:\n${relevant.snapshots.map((snapshot) => `- [${snapshot.mode}] ${snapshot.summary}`).join("\n")}`
      : "",
    adaptiveDirectives.length > 0 ? `Adaptive directives:\n${adaptiveDirectives.map((directive) => `- ${directive}`).join("\n")}` : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

export async function updateMemoryFromExchange(input: ExchangeInput) {
  const userId = slugify(input.userId || input.context.student.name || DEFAULT_USER_ID);
  const displayName = input.displayName || input.context.student.name || "Misti";
  const profile = await loadMemoryProfile(userId, displayName);
  const preferenceSignals = extractPreferenceSignals(input.userMessage);
  const learningSignals = extractLearningSignals(input.userMessage, input.context, input.assistantMessage);
  const snapshot = buildSnapshot(input, learningSignals);

  profile.displayName = displayName;
  profile.updatedAt = nowIso();
  profile.stats.totalUpdates += 1;

  if (!profile.conversationSnapshots.some((item) => item.conversationId === input.conversationId)) {
    profile.stats.totalConversations += 1;
  }

  profile.preferences = {
    explanationStyle: mergePreferenceBucket(profile.preferences.explanationStyle, preferenceSignals.explanationStyle),
    responseStyle: mergePreferenceBucket(profile.preferences.responseStyle, preferenceSignals.responseStyle),
    practiceMode: mergePreferenceBucket(profile.preferences.practiceMode, preferenceSignals.practiceMode),
    tone: mergePreferenceBucket(profile.preferences.tone, preferenceSignals.tone),
  };

  profile.strengths = upsertFacts(profile.strengths, learningSignals.strengths);
  profile.weaknesses = upsertFacts(profile.weaknesses, learningSignals.weaknesses);
  profile.misconceptions = upsertFacts(profile.misconceptions, learningSignals.misconceptions);
  profile.behavioralPatterns = upsertFacts(profile.behavioralPatterns, learningSignals.behavioralPatterns);
  profile.conversationSnapshots = [snapshot, ...profile.conversationSnapshots];

  compactSnapshots(profile);
  profile.rollingSummary = rebuildRollingSummary(profile);

  await persistProfile(profile);
}
