import { extractSearchPhrase, normalizeVoiceText, parseCompactStudyAnswer, parseStudyHours, resolveVoiceRoute } from "@/lib/voice-assistant";

export const SITE_ASSISTANT_OPEN_EVENT = "neet:assistant-open";
export const SITE_ASSISTANT_PREFERENCE_EVENT = "neet:assistant-preference";
export const SITE_ASSISTANT_WAKE_PAUSE_EVENT = "neet:assistant-wake-pause";

export const ASSISTANT_WAKE_NAMES = [
  "raja beta",
  "kuchupuchu",
  "bubu",
  "betu",
  "shona",
  "hubby",
  "coach",
  "mentor",
  "buddy",
] as const;

export const ASSISTANT_WAKE_PHRASES = ASSISTANT_WAKE_NAMES.map((name) => `hey ${name}`);

export type AssistantPersona = {
  wakeName: (typeof ASSISTANT_WAKE_NAMES)[number] | null;
  mode: "WARM" | "MENTOR";
  replyName: string;
  acknowledgement: string;
};

export type SiteAssistantIntent =
  | { kind: "CREATE_TOPIC"; topicName: string; chapterName: string; subjectHint: string | null; classLevel: "11" | "12" | null }
  | { kind: "CREATE_CHAPTER"; chapterName: string; subjectHint: string | null; classLevel: "11" | "12" | null; firstTopicName: string | null }
  | { kind: "PAGE_HELP" }
  | { kind: "MEMORY_QUERY"; query: "RECENT_STUDY" | "REVISION" | "TEST" | "NEXT" }
  | { kind: "CREATE_TASK"; title: string; subjectHint: string | null; due: "TODAY" | "TOMORROW" | null; plannedMinutes: number | null }
  | { kind: "UPDATE_STUDY"; query: string; subjectHint: string | null; questionsDelta: number; hoursStudied: number; intensityLevel: number; addRevision: boolean; markCompleted: boolean; coverage: "FULL" | "PARTIAL"; activityKind: "NEW_LEARNING" | "PRACTICE" | "REVISION" | "TEST_REVIEW" }
  | { kind: "NAVIGATE"; href: string; label: string }
  | { kind: "SEARCH"; query: string }
  | { kind: "UNKNOWN"; reason: string };

export type SiteAssistantClientControl = "BACK" | "CLOSE" | "REFRESH" | "MUTE" | "UNMUTE";
export type AssistantTranscriptCandidate = { transcript: string; confidence: number };

export type AssistantEntityCandidate<T> = {
  id: string;
  label: string;
  value: T;
};

export type AssistantEntityMatch<T> = {
  match: AssistantEntityCandidate<T> | null;
  alternatives: AssistantEntityCandidate<T>[];
  confidence: number;
  ambiguous: boolean;
};

const SUBJECT_NAMES = ["physics", "chemistry", "botany", "zoology"];
const WAKE_PATTERN = ASSISTANT_WAKE_NAMES.map((name) => name.replace(/\s+/g, "\\s+")).join("|");
const POLITE_PREFIX = /^(?:(?:please|kindly)\s+|(?:(?:can|could|will|would)\s+you\s+)|(?:i\s+(?:want|need|would like)\s+you\s+to\s+))+/i;
const NAVIGATION_CUE = /\b(?:open(?:\s+up)?|go\s+to|head\s+to|take\s+me\s+to|show(?:\s+me)?|bring\s+up|switch\s+to|navigate\s+to|visit|launch|start|find|search)\b/i;
const DISCOVERY_CUE = /\b(?:where\s+(?:can|could|do|would)\s+i\s+(?:see|find|check|view|use)|where\s+is|how\s+(?:can|do)\s+i\s+(?:open|find|see|check|view|use)|i\s+(?:want|need|would\s+like)\s+to\s+(?:see|find|check|view|use))\b/i;
const SEARCH_CUE = /\b(?:open(?:\s+up)?|go\s+to|head\s+to|take\s+me\s+to|show(?:\s+me)?|bring\s+up|switch\s+to|navigate\s+to|find|search(?:\s+for)?|where\s+is|where\s+(?:can|could|do|would)\s+i|how\s+(?:can|do)\s+i)\b/i;

export function detectAssistantPersona(value: string, fallbackNickname = "Bubu"): AssistantPersona {
  const match = value.trim().match(new RegExp(`^(?:(?:hey|hi|hello)\\s+)?(${WAKE_PATTERN})(?:[,\\s:!-]+|$)`, "i"));
  const wakeName = (match?.[1]?.toLowerCase().replace(/\s+/g, " ") ?? null) as AssistantPersona["wakeName"];
  if (wakeName === "coach" || wakeName === "mentor") {
    return { wakeName, mode: "MENTOR", replyName: "Misti", acknowledgement: "Absolutely, Misti" };
  }
  const warmReplies: Partial<Record<NonNullable<AssistantPersona["wakeName"]>, { replyName: string; acknowledgement: string }>> = {
    bubu: { replyName: "Bubu", acknowledgement: "Of course, my love" },
    betu: { replyName: "my love", acknowledgement: "Always, my love" },
    shona: { replyName: "Shona", acknowledgement: "Of course, my love" },
    hubby: { replyName: "my love", acknowledgement: "I'm here, my love" },
    kuchupuchu: { replyName: "Kuchupuchu", acknowledgement: "Always, Kuchupuchu" },
    "raja beta": { replyName: "Bubu", acknowledgement: "Of course, Bubu" },
    buddy: { replyName: "Bubu", acknowledgement: "You got it, Bubu" },
  };
  const reply = wakeName ? warmReplies[wakeName] : null;
  const replyName = reply?.replyName ?? fallbackNickname;
  return {
    wakeName,
    mode: "WARM",
    replyName,
    acknowledgement: reply?.acknowledgement ?? `Of course, ${replyName}`,
  };
}

export function stripAssistantAddress(value: string) {
  let utterance = value
    .trim()
    .replace(new RegExp(`^(?:(?:hey|hi|hello)\\s+)?(?:${WAKE_PATTERN})[,\\s:!-]*`, "i"), "")
    .trim();
  while (POLITE_PREFIX.test(utterance)) utterance = utterance.replace(POLITE_PREFIX, "").trim();
  return utterance;
}

function cleanEntityLabel(value: string) {
  return value
    .replace(/\b(?:please|for me|now)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\s]+|[,.:;\s]+$/g, "")
    .trim();
}

function extractSubjectAndClass(value: string) {
  let cleaned = cleanEntityLabel(value);
  const subjectMatches = [...cleaned.matchAll(new RegExp(`\\b(${SUBJECT_NAMES.join("|")})\\b`, "gi"))];
  const subjectMatch = subjectMatches.at(-1) ?? null;
  const classMatch = cleaned.match(/\b(?:class|standard|std)?\s*(11|eleven|12|twelve)(?:th)?\b/i);
  const classLevel = classMatch
    ? (/^(?:11|eleven)$/i.test(classMatch[1]) ? "11" : "12")
    : null;
  if (subjectMatch && subjectMatch.index !== undefined) {
    cleaned = `${cleaned.slice(0, subjectMatch.index)} ${cleaned.slice(subjectMatch.index + subjectMatch[0].length)}`;
  }
  if (classMatch) cleaned = cleaned.replace(classMatch[0], " ");
  cleaned = cleaned
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:in|of|for|under)\s+/i, "")
    .replace(/\s+(?:in|of|for|under)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    value: cleaned,
    subjectHint: subjectMatch?.[1]?.toLowerCase() ?? null,
    classLevel: classLevel as "11" | "12" | null,
  };
}

export function parseSiteAssistantIntent(value: string): SiteAssistantIntent {
  const utterance = stripAssistantAddress(value);
  if (!utterance) return { kind: "UNKNOWN", reason: "I did not hear a command." };

  if (/\b(?:what is this page|what can you do here|what can i do here|help me (?:on|with) this page|explain this page)\b/i.test(utterance)) {
    return { kind: "PAGE_HELP" };
  }

  const taskMatch = utterance.match(/^(?:(?:create|add|make)(?:\s+(?:a|the|new))?\s+(?:todo|to do|task)(?:\s+(?:for|to))?|remind\s+me\s+to)\s+(.+)$/i);
  if (taskMatch) {
    const rawTitle = cleanEntityLabel(taskMatch[1]);
    const subjectHint = SUBJECT_NAMES.find((subject) => new RegExp(`\\b${subject}\\b`, "i").test(rawTitle)) ?? null;
    const due = /\btomorrow\b/i.test(rawTitle) ? "TOMORROW" : /\btoday\b/i.test(rawTitle) ? "TODAY" : null;
    const hours = parseStudyHours(rawTitle);
    const title = rawTitle
      .replace(/\b(?:today|tomorrow)\b/gi, " ")
      .replace(/\b(?:for\s+)?(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+and\s+a\s+half)?\s*(?:hours?|hrs?|minutes?|mins?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (title) return { kind: "CREATE_TASK", title, subjectHint, due, plannedMinutes: hours && hours > 0 ? Math.round(hours * 60) : null };
  }

  if (/\b(?:what|which|where)\b.*\b(?:did i study|have i studied|studied today|studied yesterday|study history)\b|\bremember what i studied\b/i.test(utterance)) {
    return { kind: "MEMORY_QUERY", query: "RECENT_STUDY" };
  }
  if (/\b(?:what|which).*(?:revise|revision)|\b(?:suggest|recommend|plan)\s+(?:a\s+)?revision\b/i.test(utterance)) {
    return { kind: "MEMORY_QUERY", query: "REVISION" };
  }
  if (/\b(?:what|which).*(?:test|mock)|\b(?:suggest|recommend)\s+(?:a\s+)?(?:test|mock)\b/i.test(utterance)) {
    return { kind: "MEMORY_QUERY", query: "TEST" };
  }
  if (/\bwhat\s+should\s+i\s+(?:study|do)\s*(?:next|now|today)?\b|\b(?:suggest|recommend)\s+(?:my\s+)?next\s+(?:study|task)\b/i.test(utterance)) {
    return { kind: "MEMORY_QUERY", query: "NEXT" };
  }

  const compactStudy = parseCompactStudyAnswer(utterance);
  const updateStudy = /\b(?:studied|study|revised|revision|revising|practiced|practised|solved|record|log|update|mark|add|completed|finished)\b/i.test(utterance)
    && (compactStudy.questions !== null || compactStudy.hours !== null || compactStudy.completionConfirmed === true || compactStudy.kind === "REVISION");
  if (updateStudy) {
    const subjectHint = SUBJECT_NAMES.find((subject) => new RegExp(`\\b${subject}\\b`, "i").test(utterance)) ?? null;
    const query = cleanEntityLabel(utterance)
      .replace(/\b(?:i|have|has|today|please|record|log|update|mark|add|studied|study|revised|revision|revising|practiced|practised|solved|attempted|completed|complete|finished|done|new learning|practice|full|fully|whole|entire|partial|partly|section|end to end)\b/gi, " ")
      .replace(/\b\d+(?:\.\d+)?\b\s*(?:hours?|hrs?|minutes?|mins?|questions?|qs?|intensity)?/gi, " ")
      .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b\s*(?:hours?|hrs?|minutes?|mins?|questions?|qs?)?/gi, " ")
      .replace(new RegExp(`\\b(?:${SUBJECT_NAMES.join("|")})\\b`, "gi"), " ")
      .replace(/\b(?:and|with|for|of|in|the|a|an|intensity|level|no weak concepts?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (query) return {
      kind: "UPDATE_STUDY",
      query,
      subjectHint,
      questionsDelta: compactStudy.questions ?? 0,
      hoursStudied: compactStudy.hours ?? 0,
      intensityLevel: compactStudy.intensity ?? 0,
      addRevision: compactStudy.kind === "REVISION",
      markCompleted: compactStudy.completionConfirmed === true,
      coverage: compactStudy.completionConfirmed === true ? "FULL" : compactStudy.coverage ?? "PARTIAL",
      activityKind: compactStudy.kind ?? "PRACTICE",
    };
  }

  const createChapterMatch = utterance.match(
    /^(?:create|add|make)(?:\s+(?:a|the|new))?\s+chapter\s+(.+?)(?:\s+(?:with|and)\s+(?:a\s+)?(?:first\s+)?topic\s+(.+))?$/i,
  );
  if (createChapterMatch) {
    const extracted = extractSubjectAndClass(createChapterMatch[1]);
    const chapterName = cleanEntityLabel(extracted.value).replace(/\s+chapter$/i, "").trim();
    const firstTopicName = createChapterMatch[2] ? cleanEntityLabel(createChapterMatch[2]) : null;
    if (chapterName) {
      return {
        kind: "CREATE_CHAPTER",
        chapterName,
        subjectHint: extracted.subjectHint,
        classLevel: extracted.classLevel,
        firstTopicName: firstTopicName || null,
      };
    }
  }

  const createMatch = utterance.match(
    /^(?:create|add|make)(?:\s+(?:a|the|new))?(?:\s+topic)?\s+(.+?)(?:\s+topic)?\s+(?:in|inside|under)\s+(.+)$/i,
  );
  if (createMatch) {
    const topicName = cleanEntityLabel(createMatch[1]);
    const extracted = extractSubjectAndClass(createMatch[2]);
    const chapterName = cleanEntityLabel(extracted.value).replace(/\s+chapter$/i, "").trim();
    if (topicName && chapterName) return {
      kind: "CREATE_TOPIC",
      topicName,
      chapterName,
      subjectHint: extracted.subjectHint,
      classLevel: extracted.classLevel,
    };
  }

  const route = resolveVoiceRoute(utterance);
  const normalizedUtterance = normalizeVoiceText(utterance);
  const bareRouteRequest = route
    && normalizedUtterance.split(" ").length <= 5
    && !/\b(?:create|add|make|explain|teach|what|why|how|when|who)\b/.test(normalizedUtterance);
  if (route && (NAVIGATION_CUE.test(utterance) || DISCOVERY_CUE.test(utterance) || bareRouteRequest)) {
    return { kind: "NAVIGATE", ...route };
  }

  if (SEARCH_CUE.test(utterance)) {
    const query = extractSearchPhrase(utterance);
    return query ? { kind: "SEARCH", query } : { kind: "UNKNOWN", reason: "Tell me what you want to open." };
  }

  return {
    kind: "UNKNOWN",
    reason: "I can open any workspace, record study progress, or safely create a topic or chapter.",
  };
}

export function parseAssistantClientControl(value: string): SiteAssistantClientControl | null {
  const utterance = normalizeVoiceText(stripAssistantAddress(value));
  if (/^(?:go\s+)?back(?:\s+to\s+the\s+previous\s+page)?$|^previous\s+page$/.test(utterance)) return "BACK";
  if (/^(?:close|dismiss|exit|cancel)(?:\s+(?:the\s+)?assistant|\s+voice\s+mode)?$/.test(utterance)) return "CLOSE";
  if (/^(?:refresh|reload)(?:\s+(?:this|the)\s+page)?$/.test(utterance)) return "REFRESH";
  if (/^(?:mute|be\s+quiet|stop\s+(?:speaking|talking))(?:\s+(?:the\s+)?assistant)?$/.test(utterance)) return "MUTE";
  if (/^(?:unmute|turn\s+(?:the\s+)?voice\s+on|speak\s+again)(?:\s+(?:the\s+)?assistant)?$/.test(utterance)) return "UNMUTE";
  return null;
}

export function chooseAssistantTranscript(candidates: AssistantTranscriptCandidate[]) {
  const ranked = candidates
    .map((candidate, index) => {
      const control = parseAssistantClientControl(candidate.transcript);
      const intent = parseSiteAssistantIntent(candidate.transcript);
      const actionable = intent.kind === "NAVIGATE" || intent.kind === "CREATE_TOPIC" || intent.kind === "CREATE_CHAPTER" || intent.kind === "CREATE_TASK" || intent.kind === "UPDATE_STUDY" || intent.kind === "MEMORY_QUERY" || intent.kind === "PAGE_HELP";
      const intentScore = control ? 5 : actionable ? 4 : intent.kind === "SEARCH" ? 3 : 0;
      return { candidate, index, score: intentScore + Math.max(0, Math.min(1, candidate.confidence)) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.candidate ?? null;
}

function comparable(value: string) {
  return normalizeVoiceText(value)
    .replace(/\bchapter\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let row = 0; row < a.length; row += 1) {
    current[0] = row + 1;
    for (let column = 0; column < b.length; column += 1) {
      current[column + 1] = Math.min(
        current[column] + 1,
        previous[column + 1] + 1,
        previous[column] + (a[row] === b[column] ? 0 : 1),
      );
    }
    for (let column = 0; column <= b.length; column += 1) previous[column] = current[column];
  }
  return previous[b.length];
}

function similarity(left: string, right: string) {
  const a = comparable(left);
  const b = comparable(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  const overlap = [...aWords].filter((word) => bWords.has(word)).length;
  const wordScore = overlap / Math.max(aWords.size, bWords.size);
  const contained = a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
  return Math.max(editScore, wordScore, contained ? 0.93 : 0);
}

export function findAssistantEntity<T>(
  query: string,
  candidates: AssistantEntityCandidate<T>[],
): AssistantEntityMatch<T> {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: similarity(query, candidate.label) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const alternatives = ranked.slice(0, 3).filter((entry) => entry.score >= 0.45).map((entry) => entry.candidate);
  if (!best || best.score < 0.74) return { match: null, alternatives, confidence: best?.score ?? 0, ambiguous: false };

  const exactMatches = ranked.filter((entry) => entry.score === 1);
  const nearTie = ranked[1] && best.score - ranked[1].score < 0.045;
  const ambiguous = exactMatches.length > 1 || Boolean(nearTie && ranked[1].score >= 0.82);
  return {
    match: ambiguous ? null : best.candidate,
    alternatives,
    confidence: best.score,
    ambiguous,
  };
}

export function assistantRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
