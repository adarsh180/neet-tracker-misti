export type VoiceRouteIntent = { href: string; label: string };

const DIRECT_ROUTES: Array<{ aliases: string[]; href: string; label: string }> = [
  { aliases: ["dashboard", "home"], href: "/dashboard", label: "Dashboard" },
  { aliases: ["daily goals", "daily goal", "study log", "log my day"], href: "/daily-goals", label: "Daily Goals" },
  { aliases: ["todo", "to do", "todo deck", "tasks", "task board"], href: "/todo", label: "Todo Deck" },
  { aliases: ["sectional test", "class 11 sectional test", "class 12 sectional test"], href: "/practice?mode=sectional", label: "Sectional Test" },
  { aliases: ["custom test", "build custom test"], href: "/practice?mode=custom", label: "Custom Test" },
  { aliases: ["practice", "practice arena"], href: "/practice", label: "Practice Arena" },
  { aliases: ["tests", "test history"], href: "/tests", label: "Tests" },
  { aliases: ["ncert", "ncert reader", "reader", "books"], href: "/reader", label: "NCERT Reader" },
  { aliases: ["pyq", "pyq library", "previous year questions"], href: "/pyq", label: "PYQ Library" },
  { aliases: ["pyq explorer", "question explorer"], href: "/pyq/questions", label: "PYQ Explorer" },
  { aliases: ["physics"], href: "/subjects/physics", label: "Physics" },
  { aliases: ["chemistry"], href: "/subjects/chemistry", label: "Chemistry" },
  { aliases: ["botany"], href: "/subjects/botany", label: "Botany" },
  { aliases: ["zoology"], href: "/subjects/zoology", label: "Zoology" },
  { aliases: ["mood", "mood tracker"], href: "/mood", label: "Mood Tracker" },
  { aliases: ["review cards", "reviews"], href: "/reviews", label: "Review Cards" },
  { aliases: ["visual lab"], href: "/visual-lab", label: "Visual Lab" },
  { aliases: ["planner", "day planner"], href: "/planner", label: "Day Planner" },
];

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
  const text = extractSearchPhrase(value);
  const exact = DIRECT_ROUTES.find((route) => route.aliases.some((alias) => text === alias));
  if (exact) return { href: exact.href, label: exact.label };
  const contained = DIRECT_ROUTES
    .flatMap((route) => route.aliases.map((alias) => ({ route, alias })))
    .filter(({ alias }) => text.includes(alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0];
  return contained ? { href: contained.route.href, label: contained.route.label } : null;
}

export function extractSearchPhrase(value: string) {
  return normalizeVoiceText(value)
    .replace(/^(?:please\s+)?(?:open|go to|take me to|show me|show|find|search for|search)\s+/, "")
    .replace(/\s+(?:page|section|chapter)$/, "")
    .trim();
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
