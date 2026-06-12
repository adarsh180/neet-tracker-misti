function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

export function extractJson<T>(input: string): T | null {
  const direct = safeJsonParse<T>(input);
  if (direct) return direct;
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = safeJsonParse<T>(fenced.trim());
    if (parsed) return parsed;
  }
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start >= 0 && end > start) return safeJsonParse<T>(input.slice(start, end + 1));
  const arrStart = input.indexOf("[");
  const arrEnd = input.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) return safeJsonParse<T>(input.slice(arrStart, arrEnd + 1));
  return null;
}

/**
 * Pulls a JSON array of objects out of messy model output. Handles reasoning
 * preambles (`<thought>` blocks, closed or unclosed), fenced code, wrapper
 * objects, and token-limit truncation (salvages every complete item).
 */
export function extractJsonArray<T>(input: string): T[] | null {
  // Closed reasoning blocks can be stripped safely; unclosed ones are handled
  // by scanning for array-of-object starts below.
  const cleaned = input.replace(/<(thought|thinking)>[\s\S]*?<\/\1>/gi, "").trim();

  const tryParse = (slice: string): T[] | null => {
    const parsed = safeJsonParse<unknown>(slice);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParse(fenced.trim());
    if (parsed) return parsed;
  }

  // Scan every `[ {` position (the real payload may sit after an unclosed
  // reasoning preamble); keep the largest array that parses.
  const starts: number[] = [];
  const startPattern = /\[\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = startPattern.exec(cleaned)) && starts.length < 12) starts.push(match.index);

  let best: T[] | null = null;
  for (const start of starts) {
    let candidate: T[] | null = null;
    const lastBracket = cleaned.lastIndexOf("]");
    if (lastBracket > start) candidate = tryParse(cleaned.slice(start, lastBracket + 1));

    // Truncation salvage: close the array after the last complete object.
    if (!candidate) {
      let lastBrace = cleaned.lastIndexOf("}");
      for (let attempts = 0; attempts < 40 && lastBrace > start && !candidate; attempts++) {
        candidate = tryParse(`${cleaned.slice(start, lastBrace + 1)}]`);
        lastBrace = cleaned.lastIndexOf("}", lastBrace - 1);
      }
    }
    if (candidate && (!best || candidate.length > best.length)) best = candidate;
  }
  if (best) return best;

  const wrapped = extractJson<unknown>(cleaned);
  if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
    const inner = Object.values(wrapped).find((value) => Array.isArray(value));
    if (inner) return inner as T[];
  }
  return null;
}
