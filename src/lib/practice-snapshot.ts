const STATES = new Set(["NOT_VISITED", "NOT_ANSWERED", "ANSWERED", "MARKED_FOR_REVIEW", "ANSWERED_MARKED_FOR_REVIEW"]);

/** Fail closed on malformed snapshots before persisting an attempt. */
export function validatePracticeSnapshot(body: Record<string, unknown>, ids: string[], durationSeconds: number): string | null {
  const known = new Set(ids);
  if (body.answers !== undefined) {
    if (!Array.isArray(body.answers) || body.answers.length > ids.length) return "Invalid answer list";
    const seen = new Set<string>();
    for (const answer of body.answers) {
      if (!answer || typeof answer !== "object" || typeof answer.id !== "string" || !known.has(answer.id) || seen.has(answer.id)) return "Unknown or duplicate question";
      if (answer.optionIndex !== null && (!Number.isInteger(answer.optionIndex) || answer.optionIndex < 0 || answer.optionIndex > 3)) return "Invalid answer option";
      seen.add(answer.id);
    }
  }
  if (body.questionStatuses !== undefined) {
    if (!body.questionStatuses || typeof body.questionStatuses !== "object" || Array.isArray(body.questionStatuses)) return "Invalid question palette";
    for (const [id,status] of Object.entries(body.questionStatuses)) if (!known.has(id) || !STATES.has(String(status))) return "Invalid question palette state";
  }
  const bounds: Record<string,number> = { currentQuestionIndex: Math.max(0,ids.length-1), remainingSeconds:durationSeconds, totalActiveSeconds:durationSeconds, totalPausedSeconds:604800 };
  for (const [key,max] of Object.entries(bounds)) if (body[key] !== undefined && (typeof body[key] !== "number" || !Number.isInteger(body[key]) || (body[key] as number) < 0 || (body[key] as number) > max)) return `Invalid ${key}`;
  for (const key of ["pauseLogs","securityEvents"]) {
    const value=body[key];
    if (value !== undefined && (!Array.isArray(value) || value.length > 500 || JSON.stringify(value).length > 100000)) return `Invalid ${key}`;
  }
  return null;
}
