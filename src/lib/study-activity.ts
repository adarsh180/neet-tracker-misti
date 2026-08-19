import { normalizeVoiceText, parseCompactStudyAnswer, parseSpokenNumber } from "@/lib/voice-assistant";

export type StudyActivityKindValue = "NEW_LEARNING" | "PRACTICE" | "REVISION" | "TEST_REVIEW";
export type StudyCoverageValue = "PARTIAL" | "FULL";

export type StudyTopicDirectoryItem = {
  id: string;
  name: string;
  chapter: string | null;
  classLevel: string | null;
  questionsSolved: number;
  isCompleted: boolean;
};

export type StudyMatch = {
  topicId: string | null;
  topicName: string | null;
  chapter: string;
  classLevel: string | null;
  confidence: number;
  alternatives: Array<{ topicId: string; topicName: string; chapter: string }>;
};

export type StudyAllocationMatch = StudyMatch & {
  questions: number | null;
};

export type StudyAllocationResult = {
  matches: StudyAllocationMatch[];
  totalQuestions: number | null;
  needsChapter: boolean;
  needsAllocation: boolean;
};

const FILLER = new Set([
  "a", "an", "and", "chapter", "class", "completed", "did", "do", "from", "in", "it", "law", "of",
  "on", "questions", "revised", "solved", "studied", "study", "the", "today", "topic",
]);

function searchable(value: string | null | undefined) {
  return normalizeVoiceText(value ?? "")
    .replace(/\b([a-z]+)'s\b/g, "$1")
    .replace(/\b(?:class|grade)\s*(?:eleven|11|xi)\b/g, " 11 ")
    .replace(/\b(?:class|grade)\s*(?:twelve|12|xii)\b/g, " 12 ")
    .replace(/\bnewtons\b/g, "newton")
    .replace(/\bndl\b/g, "newton laws motion")
    .replace(/\bnlm\b/g, "newton laws motion")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return new Set(searchable(value).split(" ").filter((token) => token.length > 1 && !FILLER.has(token)));
}

function similarity(query: string, candidate: string) {
  const left = searchable(query);
  const right = searchable(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right)) return Math.min(0.97, 0.82 + right.length / Math.max(left.length, 1) * 0.14);
  if (right.includes(left) && left.length >= 4) return Math.min(0.94, 0.76 + left.length / Math.max(right.length, 1) * 0.14);
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (!overlap) return 0;
  const precision = overlap / Math.max(leftTokens.size, 1);
  const recall = overlap / Math.max(rightTokens.size, 1);
  return (2 * precision * recall) / Math.max(precision + recall, 0.001);
}

export function resolveStudyMatch(query: string, topics: StudyTopicDirectoryItem[]): StudyMatch | null {
  const normalized = searchable(query);
  if (!normalized || !topics.length) return null;
  const classHint = /\b(?:11|eleven|xi)\b/.test(normalized) ? "11" : /\b(?:12|twelve|xii)\b/.test(normalized) ? "12" : null;
  const ranked = topics.map((topic) => {
    const topicScore = similarity(normalized, topic.name);
    const chapterScore = similarity(normalized, topic.chapter ?? "");
    const combinedScore = similarity(normalized, `${topic.name} ${topic.chapter ?? ""}`);
    const classPenalty = classHint && topic.classLevel && classHint !== topic.classLevel ? 0.18 : 0;
    return { topic, score: Math.max(topicScore, chapterScore * 0.94, combinedScore) - classPenalty, chapterScore };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.52) return null;
  const alternatives = ranked
    .filter((item) => item.topic.id !== best.topic.id && item.score >= Math.max(0.45, best.score - 0.16))
    .slice(0, 3)
    .map((item) => ({ topicId: item.topic.id, topicName: item.topic.name, chapter: item.topic.chapter ?? item.topic.name }));
  const chapterOnly = best.chapterScore >= best.score - 0.03
    && topics.filter((topic) => topic.chapter === best.topic.chapter).length > 1
    && !searchable(query).includes(searchable(best.topic.name));
  return {
    topicId: chapterOnly ? null : best.topic.id,
    topicName: chapterOnly ? null : best.topic.name,
    chapter: best.topic.chapter ?? best.topic.name,
    classLevel: best.topic.classLevel,
    confidence: Math.max(0, Math.min(1, Number(best.score.toFixed(2)))),
    alternatives,
  };
}

function questionsBeforeMention(text: string, start: number, end: number) {
  const nearby = text.slice(start, end).trim();
  const numeric = nearby.match(/(\d+)\s*(?:questions?|qs?)?\s*(?:from|in|of|on)?\s*$/);
  if (numeric) return Math.max(0, Math.min(5000, Number(numeric[1])));
  const withUnit = nearby.match(/((?:[a-z-]+\s+){0,5}[a-z-]+)\s*(?:questions?|qs?)\s*(?:from|in|of|on)?\s*$/);
  const spoken = withUnit ? parseSpokenNumber(withUnit[1]) : null;
  return spoken === null ? null : Math.max(0, Math.min(5000, Math.round(spoken)));
}

/** Resolves one or several explicitly named chapters/topics and preserves per-entity question counts. */
export function resolveStudyAllocations(query: string, topics: StudyTopicDirectoryItem[]): StudyAllocationResult {
  const text = searchable(query);
  const totalQuestions = parseCompactStudyAnswer(query).questions;
  if (!text || !topics.length) return { matches: [], totalQuestions, needsChapter: (totalQuestions ?? 0) > 0, needsAllocation: false };

  const topicMentions = topics
    .map((topic) => ({ topic, key: searchable(topic.name), index: text.lastIndexOf(searchable(topic.name)) }))
    .filter((entry) => entry.key.length >= 3 && entry.index >= 0);
  const topicChapterKeys = new Set(topicMentions.map((entry) => `${entry.topic.chapter ?? entry.topic.name}`));
  const chapterMentions = [...new Map(topics.map((topic) => [topic.chapter ?? topic.name, topic])).entries()]
    .map(([chapter, topic]) => ({ topic, chapter, key: searchable(chapter), index: text.lastIndexOf(searchable(chapter)) }))
    .filter((entry) => entry.key.length >= 3 && entry.index >= 0 && !topicChapterKeys.has(entry.chapter));
  const mentions = [
    ...topicMentions.map((entry) => ({ ...entry, chapter: entry.topic.chapter ?? entry.topic.name, topicId: entry.topic.id, topicName: entry.topic.name })),
    ...chapterMentions.map((entry) => ({ ...entry, topicId: null, topicName: null })),
  ].sort((left, right) => left.index - right.index || right.key.length - left.key.length);

  const deduped = mentions.filter((mention, index) => !mentions.slice(0, index).some((previous) =>
    previous.topicId === mention.topicId && previous.chapter === mention.chapter,
  ));
  if (!deduped.length) {
    const fallback = resolveStudyMatch(query, topics);
    if (!fallback || fallback.confidence < 0.72) {
      return { matches: [], totalQuestions, needsChapter: (totalQuestions ?? 0) > 0, needsAllocation: false };
    }
    return {
      matches: [{ ...fallback, questions: totalQuestions }],
      totalQuestions,
      needsChapter: false,
      needsAllocation: false,
    };
  }

  let previousEnd = 0;
  const matches: StudyAllocationMatch[] = deduped.map((mention) => {
    const questions = questionsBeforeMention(text, previousEnd, mention.index);
    previousEnd = mention.index + mention.key.length;
    return {
      topicId: mention.topicId,
      topicName: mention.topicName,
      chapter: mention.chapter,
      classLevel: mention.topic.classLevel,
      confidence: 1,
      alternatives: [],
      questions,
    };
  });
  if (matches.length === 1 && matches[0].questions === null) matches[0].questions = totalQuestions;
  if (matches.length > 1 && totalQuestions !== null) {
    const known = matches.reduce((sum, match) => sum + (match.questions ?? 0), 0);
    const missing = matches.filter((match) => match.questions === null);
    if (missing.length === 1 && totalQuestions >= known) missing[0].questions = totalQuestions - known;
  }
  const needsAllocation = matches.length > 1 && matches.some((match) => match.questions === null) && (totalQuestions ?? 0) > 0;
  return { matches, totalQuestions, needsChapter: false, needsAllocation };
}

export function inferStudyKind(value: string): StudyActivityKindValue {
  const text = searchable(value);
  if (/\b(?:revised|revision|revising|revisit)\b/.test(text)) return "REVISION";
  if (/\b(?:test analysis|test review|mistake review|error review)\b/.test(text)) return "TEST_REVIEW";
  if (/\b(?:new|first time|started|learned|lecture)\b/.test(text)) return "NEW_LEARNING";
  return "PRACTICE";
}

export function inferCoverage(value: string): StudyCoverageValue {
  const text = searchable(value);
  return /\b(?:entire|full|fully|complete chapter|end to end|whole)\b/.test(text) ? "FULL" : "PARTIAL";
}

export function clampActivityNumbers(value: { hoursStudied: unknown; questionsDelta: unknown; intensityLevel: unknown }) {
  const hours = Number(value.hoursStudied);
  const questions = Number(value.questionsDelta);
  const intensity = Number(value.intensityLevel);
  return {
    hoursStudied: Number.isFinite(hours) ? Math.round(Math.max(0, Math.min(24, hours)) * 4) / 4 : 0,
    questionsDelta: Number.isFinite(questions) ? Math.round(Math.max(0, Math.min(5000, questions))) : 0,
    intensityLevel: Number.isFinite(intensity) ? Math.round(Math.max(0, Math.min(5, intensity))) : 0,
  };
}
