export type VoiceRouteIntent = { href: string; label: string };

type VoiceRouteDefinition = VoiceRouteIntent & { aliases: string[] };

export const VOICE_ROUTES: VoiceRouteDefinition[] = [
  { aliases: ["class 11 sectional test", "class eleven sectional test", "11th sectional test"], href: "/practice?mode=sectional&classLevel=11", label: "Class 11 Sectional Test" },
  { aliases: ["class 12 sectional test", "class twelve sectional test", "12th sectional test"], href: "/practice?mode=sectional&classLevel=12", label: "Class 12 Sectional Test" },
  { aliases: ["sectional test", "section test", "pcb sectional"], href: "/practice?mode=sectional", label: "Sectional Test" },
  { aliases: ["custom test", "custom paper", "build custom test", "create a test", "make a test"], href: "/practice?mode=custom", label: "Custom Test" },
  { aliases: ["full length test", "full syllabus test", "full syllabus mock", "neet mock", "complete neet mock", "180 question test"], href: "/practice?mode=full", label: "Full-Length Test" },
  { aliases: ["dashboard", "home", "home screen", "main page", "study studio"], href: "/dashboard", label: "Dashboard" },
  { aliases: ["daily goals voice mode", "voice daily log", "record my daily goals", "fill my daily goals", "log today's study by voice"], href: "/daily-goals?voice=1", label: "Daily Goals Voice Log" },
  { aliases: ["daily goals", "daily goal", "study log", "daily log", "log my day", "log today's study", "today's study log"], href: "/daily-goals", label: "Daily Goals" },
  { aliases: ["todo", "to do", "todo deck", "tasks", "task board", "task list", "tomorrow's tasks", "my tasks"], href: "/todo", label: "Todo Deck" },
  { aliases: ["practice", "practice arena", "question bank", "q bank", "practice questions"], href: "/practice", label: "Practice Arena" },
  { aliases: ["practice folders", "test folders", "saved test folders", "practice test folders"], href: "/practice", label: "Practice Arena" },
  { aliases: ["error log", "mistake log", "mistakes", "wrong answers", "incorrect answers"], href: "/tests/error-log", label: "Error Log" },
  { aliases: ["tests", "test history", "test records", "mock tests", "mock history", "test analytics", "test analysis"], href: "/tests", label: "Tests" },
  { aliases: ["pyq explorer", "pyq questions", "question explorer", "previous year question explorer"], href: "/pyq/questions", label: "PYQ Explorer" },
  { aliases: ["pyq", "pyq library", "previous year questions", "past year questions", "previous papers"], href: "/pyq", label: "PYQ Library" },
  { aliases: ["ncert", "ncert reader", "ncert books", "reader", "book reader", "textbooks"], href: "/reader", label: "NCERT Reader" },
  { aliases: ["neet guru", "neet mentor", "doubt solver", "ask mentor", "study mentor"], href: "/ai-insights/neet-guru", label: "NEET-GURU" },
  { aliases: ["rank predictor", "predict my rank", "rank prediction"], href: "/ai-insights/rank-predictor", label: "Rank Predictor" },
  { aliases: ["cycle planner", "period planner", "cycle planning"], href: "/ai-insights/cycle-planner", label: "Cycle Planner" },
  { aliases: ["ai insights", "insights", "smart insights", "performance insights"], href: "/ai-insights", label: "AI Insights" },
  { aliases: ["mission planner", "missions", "study missions", "mission board"], href: "/todo?focus=mission", label: "Mission Planner" },
  { aliases: ["task copilot", "todo copilot", "task assistant", "todo assistant"], href: "/todo?focus=copilot", label: "Task Copilot" },
  { aliases: ["physics", "physics subject", "physics workspace"], href: "/subjects/physics", label: "Physics" },
  { aliases: ["chemistry", "chemistry subject", "chemistry workspace", "chem"], href: "/subjects/chemistry", label: "Chemistry" },
  { aliases: ["botany", "botany subject", "plant biology"], href: "/subjects/botany", label: "Botany" },
  { aliases: ["zoology", "zoology subject", "animal biology"], href: "/subjects/zoology", label: "Zoology" },
  { aliases: ["mood", "mood tracker", "wellness check", "mood check"], href: "/mood", label: "Mood Tracker" },
  { aliases: ["review cards", "reviews", "revision cards", "flash cards", "flashcards"], href: "/reviews", label: "Review Cards" },
  { aliases: ["visual lab", "concept visualizer", "visual learning"], href: "/visual-lab", label: "Visual Lab" },
  { aliases: ["planner", "day planner", "study planner", "daily planner", "schedule", "study schedule", "today's plan", "today plan"], href: "/planner", label: "Day Planner" },
  { aliases: ["focus timer", "study timer", "timer", "focus session"], href: "/dashboard#focus-timer", label: "Focus Timer" },
];

const ROUTE_FILLERS = /\b(?:the|a|an|my|our|your|please|kindly|for me|right now|now|page|screen|section|workspace|area|tab|portal)\b/g;

function normalizeRoutePhrase(value: string) {
  return normalizeVoiceText(value)
    .replace(/\bp\s*y\s*q(?:s)?\b/g, "pyq")
    .replace(/\bn\s*c\s*e\s*r\s*t\b/g, "ncert")
    .replace(/\bq\s*bank\b/g, "question bank")
    .replace(/\bto[\s-]?do\b/g, "todo")
    .replace(/\beleventh\b/g, "class 11")
    .replace(/\btwelfth\b/g, "class 12")
    .replace(ROUTE_FILLERS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeTokens(value: string) {
  return new Set(normalizeRoutePhrase(value).split(" ").filter((token) => token.length > 1));
}

function routeScore(query: string, alias: string) {
  const left = normalizeRoutePhrase(query);
  const right = normalizeRoutePhrase(alias);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(0.97, 0.86 + Math.min(left.length, right.length) / Math.max(left.length, right.length) * 0.1);
  const leftTokens = routeTokens(left);
  const rightTokens = routeTokens(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const precision = overlap / Math.max(1, leftTokens.size);
  const recall = overlap / Math.max(1, rightTokens.size);
  return precision && recall ? (2 * precision * recall) / (precision + recall) : 0;
}

const SKIP_PHRASES = [
  "skip", "not studied", "did not study", "didn't study", "nothing", "none", "zero today",
  "leave it", "next subject", "nahi padha", "nahi padhi", "skip karo",
];
const YES_PHRASES = ["yes", "yeah", "yep", "correct", "confirm", "save", "looks good", "all good", "haan", "hanji"];
const NO_PHRASES = ["no", "nope", "change", "edit", "incorrect", "not right", "nahin", "nahi"];

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export function normalizeVoiceText(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[’]/g, "'").replace(/[^a-z0-9.'\s-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isSkipUtterance(value: string) {
  const text = normalizeVoiceText(value);
  return SKIP_PHRASES.some((phrase) => text === phrase || text.includes(phrase));
}

export function isAffirmative(value: string) {
  const text = normalizeVoiceText(value);
  return YES_PHRASES.some((phrase) => text === phrase || text.startsWith(`${phrase} `));
}

export function isNegative(value: string) {
  const text = normalizeVoiceText(value);
  return NO_PHRASES.some((phrase) => text === phrase || text.startsWith(`${phrase} `));
}

function wordsToNumber(value: string): number | null {
  const tokens = normalizeVoiceText(value).split(/[\s-]+/).filter(Boolean);
  if (!tokens.length) return null;
  let total = 0;
  let group = 0;
  let matched = false;
  for (const token of tokens) {
    if (token === "and") continue;
    if (SMALL[token] !== undefined) {
      group += SMALL[token];
      matched = true;
    } else if (TENS[token] !== undefined) {
      group += TENS[token];
      matched = true;
    } else if (token === "hundred") {
      group = Math.max(1, group) * 100;
      matched = true;
    } else if (token === "thousand") {
      total += Math.max(1, group) * 1000;
      group = 0;
      matched = true;
    }
  }
  return matched ? total + group : null;
}

export function parseSpokenNumber(value: string): number | null {
  const text = normalizeVoiceText(value);
  const decimal = text.match(/\b\d+(?:\.\d+)?\b/);
  if (decimal) return Number(decimal[0]);
  const pointMatch = text.match(/(.+?)\s+point\s+(.+)/);
  if (pointMatch) {
    const whole = wordsToNumber(pointMatch[1]);
    const decimalWords = pointMatch[2].split(/\s+/).map((word) => SMALL[word]).filter((part) => part !== undefined);
    if (whole !== null && decimalWords.length) return Number(`${whole}.${decimalWords.join("")}`);
  }
  const base = wordsToNumber(text);
  if (base !== null) return base;
  return text.includes("half") ? 0.5 : null;
}

export function parseStudyHours(value: string): number | null {
  const text = normalizeVoiceText(value);
  if (isSkipUtterance(text)) return 0;
  const hourPart = text.match(/(.+?)\s*(?:hours?|hrs?)\b/);
  const minutePart = text.match(/(?:and\s+)?(.+?)\s*(?:minutes?|mins?)\b/);
  if (!hourPart && !minutePart && /\b(?:questions?|qs?)\b/.test(text)) return null;
  let hours = hourPart ? parseSpokenNumber(hourPart[1]) : null;
  const minutes = minutePart ? parseSpokenNumber(minutePart[1].replace(/^.*\b(?:hours?|hrs?)\b/, "")) : null;
  if (hours === null && minutes !== null) hours = 0;
  if (hours === null) hours = parseSpokenNumber(text);
  if (hours === null) return null;
  if (/\b(?:and\s+)?a half\b|\band half\b/.test(text) && hours >= 1) hours += 0.5;
  if (minutes !== null) hours += minutes / 60;
  return Math.round(Math.max(0, Math.min(24, hours)) * 4) / 4;
}

export function parseIntensity(value: string): number | null {
  const text = normalizeVoiceText(value);
  if (isSkipUtterance(text)) return 0;
  if (/\b(very low|light|easy|minimal)\b/.test(text)) return 1;
  if (/\b(low|mild)\b/.test(text)) return 2;
  if (/\b(medium|moderate|normal)\b/.test(text)) return 3;
  if (/\b(very high|intense|maximum|max|extreme)\b/.test(text)) return 5;
  if (/\b(high|strong|hard)\b/.test(text)) return 4;
  const parsed = parseSpokenNumber(text);
  return parsed === null ? null : Math.max(0, Math.min(5, Math.round(parsed)));
}

export function resolveVoiceRoute(value: string): VoiceRouteIntent | null {
  const text = normalizeRoutePhrase(extractSearchPhrase(value));
  const exact = VOICE_ROUTES.find((route) => route.aliases.some((alias) => text === normalizeRoutePhrase(alias)));
  if (exact) return { href: exact.href, label: exact.label };
  const ranked = VOICE_ROUTES
    .flatMap((route) => route.aliases.map((alias) => ({ route, alias, score: routeScore(text, alias) })))
    .sort((left, right) => right.score - left.score || right.alias.length - left.alias.length);
  const best = ranked[0];
  if (!best || best.score < 0.78) return null;
  const runnerUp = ranked.find((entry) => entry.route.href !== best.route.href);
  if (runnerUp && runnerUp.score >= 0.74 && best.score - runnerUp.score < 0.08) return null;
  return { href: best.route.href, label: best.route.label };
}

export function extractSearchPhrase(value: string) {
  let text = normalizeVoiceText(value);
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text
      .replace(/^(?:please|kindly)\s+/, "")
      .replace(/^(?:can|could|would|will)\s+you\s+/, "")
      .replace(/^i\s+(?:want|need|would like)\s+(?:you\s+)?to\s+/, "")
      .replace(/^let(?:'s| us)\s+/, "");
  }
  return text
    .replace(/^where\s+(?:can|could|do|would)\s+i\s+(?:see|find|check|view|use)\s+/, "")
    .replace(/^how\s+(?:can|do)\s+i\s+(?:open|find|see|check|view|use)\s+/, "")
    .replace(/^where\s+is\s+/, "")
    .replace(/^(?:open(?: up)?|go to|head to|take me to|show me|show|bring up|switch to|navigate to|visit|launch|start|find|search for|search)\s+/, "")
    .replace(/\s+(?:for me\s*)?(?:please\s*)?(?:now\s*)?$/, "")
    .replace(/\s+(?:page|screen|section|workspace|chapter)$/, "")
    .trim();
}

export type CompactStudyAnswer = {
  hours: number | null;
  questions: number | null;
  intensity: number | null;
  coverage: "FULL" | "PARTIAL" | null;
  kind: "NEW_LEARNING" | "PRACTICE" | "REVISION" | "TEST_REVIEW" | null;
  completionConfirmed: boolean | null;
  weaknessAnswered: boolean;
  weakConcepts: string;
};

function spokenValueBefore(value: string, unit: RegExp) {
  const match = unit.exec(value);
  if (!match || match.index < 1) return null;
  const prefix = value.slice(0, match.index).trim();
  const numeric = prefix.match(/(\d+(?:\.\d+)?)\s*$/);
  if (numeric) return Number(numeric[1]);
  const nearby = prefix.split(/\b(?:for|about|around|nearly|solved|did|answered|attempted|completed)\b/).at(-1)?.trim().split(/\s+/).slice(-6).join(" ") ?? "";
  return parseSpokenNumber(nearby);
}

/** Parses a single, naturally paced subject summary without inventing omitted fields. */
export function parseCompactStudyAnswer(value: string): CompactStudyAnswer {
  const text = normalizeVoiceText(value);
  const hourUnit = /\b(?:hours?|hrs?|minutes?|mins?)\b/g;
  const questionUnit = /\b(?:questions?|qs?)\b/g;
  const timeValue = spokenValueBefore(text, hourUnit);
  const timeUnit = text.match(/\b(?:hours?|hrs?|minutes?|mins?)\b/)?.[0] ?? "";
  const hours = timeValue === null ? null : /minute|min/.test(timeUnit) ? Math.round((timeValue / 60) * 4) / 4 : Math.round(timeValue * 4) / 4;
  const questionValue = spokenValueBefore(text, questionUnit);
  const intensityTail = text.match(/\bintensity(?:\s+(?:was|is|level|of|at))?\s+([^,.]+?)(?=\s+(?:and|with|weak|no\s+weak|completed|finished|full|partial)\b|$)/)?.[1];
  const intensity = intensityTail ? parseIntensity(intensityTail) : null;
  const coverage = /\b(?:full|fully|whole|entire|end to end)\b/.test(text)
    ? "FULL"
    : /\b(?:partial|partly|some|section|half|not full)\b/.test(text)
      ? "PARTIAL"
      : null;
  const kind = /\b(?:revised|revision|revising|revise)\b/.test(text)
    ? "REVISION"
    : /\b(?:test review|mock review|mistake review|error review)\b/.test(text)
      ? "TEST_REVIEW"
      : /\b(?:new learning|new chapter|first time|learned|lecture)\b/.test(text)
        ? "NEW_LEARNING"
        : /\b(?:practice|practiced|practise|questions|solved)\b/.test(text)
          ? "PRACTICE"
          : null;
  const completionConfirmed = /\b(?:not completed|not complete|did not complete|didn't complete|unfinished|incomplete|still left)\b/.test(text)
    ? false
    : /\b(?:completed|complete|finished|done)\b/.test(text)
      ? true
      : null;
  const noWeakness = /\b(?:no|none|nothing)(?:\s+(?:weak|difficult|mistake|problem))/.test(text) || /\bno weak concepts?\b/.test(text);
  const weaknessMatch = text.match(/\b(?:weak(?:\s+concept)?|difficulty|mistake)(?:\s+(?:was|is|in|with))?\s+(.+?)(?=\s+(?:and\s+)?(?:completed|not completed|full|partial|intensity)\b|$)/);
  return {
    hours: hours === null ? null : Math.max(0, Math.min(24, hours)),
    questions: questionValue === null ? null : Math.max(0, Math.min(5000, Math.round(questionValue))),
    intensity,
    coverage,
    kind,
    completionConfirmed,
    weaknessAnswered: noWeakness || Boolean(weaknessMatch),
    weakConcepts: noWeakness ? "" : weaknessMatch?.[1]?.trim() ?? "",
  };
}

export type TomorrowTaskDraft = {
  title: string;
  description: string | null;
  subjectId: string | null;
  plannedMinutes: number | null;
};

export function parseTomorrowTasks(
  value: string,
  subjects: Array<{ id: string; name: string; slug: string }>,
): TomorrowTaskDraft[] {
  if (isSkipUtterance(value) || /\b(no plan|nothing tomorrow|no todo)\b/.test(normalizeVoiceText(value))) return [];
  const text = normalizeVoiceText(value).replace(/^tomorrow\s+(?:i(?:'ll| will)\s+)?/, "");
  const mentioned = subjects
    .map((subject) => ({ subject, index: text.search(new RegExp(`\\b${subject.slug}\\b|\\b${subject.name.toLowerCase()}\\b`)) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!mentioned.length) {
    return [{ title: value.trim().slice(0, 160), description: "Created from the Daily Goals voice review.", subjectId: null, plannedMinutes: null }];
  }
  return mentioned.map((entry, index) => {
    const end = mentioned[index + 1]?.index ?? text.length;
    const segment = text.slice(entry.index, end).replace(/\b(?:and|then)\s*$/, "").trim();
    const hours = parseStudyHours(segment);
    const questions = segment.match(/(?:solve|do|complete)?\s*(\d+)\s*(?:questions?|qs?)/)?.[1];
    const cleaned = segment
      .replace(new RegExp(`^${entry.subject.name.toLowerCase()}\\s*`), "")
      .replace(/\b(?:for\s+)?(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+and\s+a\s+half)?\s*(?:hours?|hrs?|minutes?|mins?)\b/g, "")
      .replace(/(?:solve|do|complete)?\s*\d+\s*(?:questions?|qs?)/g, "")
      .replace(/^(?:study|revise|practice|read|solve)\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    const action = /\b(revise|revision)\b/.test(segment) ? "Revise" : /\b(solve|practice)\b/.test(segment) ? "Practice" : "Study";
    return {
      title: `${action} ${cleaned || entry.subject.name}`.slice(0, 160),
      description: questions ? `Target: ${questions} questions. Created from the Daily Goals voice review.` : "Created from the Daily Goals voice review.",
      subjectId: entry.subject.id,
      plannedMinutes: hours && hours > 0 ? Math.round(hours * 60) : null,
    };
  });
}
