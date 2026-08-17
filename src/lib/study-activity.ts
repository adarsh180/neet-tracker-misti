import { normalizeVoiceText } from "@/lib/voice-assistant";

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
