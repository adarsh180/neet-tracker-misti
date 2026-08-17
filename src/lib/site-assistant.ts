import { extractSearchPhrase, normalizeVoiceText, resolveVoiceRoute } from "@/lib/voice-assistant";

export const SITE_ASSISTANT_OPEN_EVENT = "neet:assistant-open";
export const SITE_ASSISTANT_PREFERENCE_EVENT = "neet:assistant-preference";

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
  | { kind: "CREATE_TOPIC"; topicName: string; chapterName: string; subjectHint: string | null }
  | { kind: "NAVIGATE"; href: string; label: string }
  | { kind: "SEARCH"; query: string }
  | { kind: "UNKNOWN"; reason: string };

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
  return value
    .trim()
    .replace(new RegExp(`^(?:(?:hey|hi|hello)\\s+)?(?:${WAKE_PATTERN})[,\\s:!-]*`, "i"), "")
    .replace(/^(?:please|can you|could you|will you|would you)\s+/i, "")
    .trim();
}

function cleanEntityLabel(value: string) {
  return value
    .replace(/\b(?:please|for me|now)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\s]+|[,.:;\s]+$/g, "")
    .trim();
}

export function parseSiteAssistantIntent(value: string): SiteAssistantIntent {
  const utterance = stripAssistantAddress(value);
  if (!utterance) return { kind: "UNKNOWN", reason: "I did not hear a command." };

  const createMatch = utterance.match(
    /^(?:create|add|make)(?:\s+(?:a|the|new))?(?:\s+topic)?\s+(.+?)(?:\s+topic)?\s+(?:in|inside|under)\s+(.+)$/i,
  );
  if (createMatch) {
    const topicName = cleanEntityLabel(createMatch[1]);
    let chapterName = cleanEntityLabel(createMatch[2]).replace(/\s+chapter$/i, "").trim();
    let subjectHint: string | null = null;
    const subjectMatch = chapterName.match(new RegExp(`\\s+(?:in|of|for)\\s+(${SUBJECT_NAMES.join("|")})$`, "i"));
    if (subjectMatch) {
      subjectHint = subjectMatch[1].toLowerCase();
      chapterName = chapterName.slice(0, subjectMatch.index).trim();
    }
    if (topicName && chapterName) return { kind: "CREATE_TOPIC", topicName, chapterName, subjectHint };
  }

  const route = resolveVoiceRoute(utterance);
  if (route && /^(?:open|go|take|show|navigate|visit|start|launch)\b/i.test(utterance)) {
    return { kind: "NAVIGATE", ...route };
  }

  if (/^(?:open|go to|take me to|show me|find|search(?: for)?)\b/i.test(utterance)) {
    const query = extractSearchPhrase(utterance);
    return query ? { kind: "SEARCH", query } : { kind: "UNKNOWN", reason: "Tell me what you want to open." };
  }

  return {
    kind: "UNKNOWN",
    reason: "I can open any workspace or create a topic inside an existing chapter.",
  };
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
