/** Date-only validation, shared by the form and API. Never normalize invalid dates. */
export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cycleWindowError(start: unknown, end: unknown): string | null {
  if (!validCalendarDate(start)) return "Choose a valid start date.";
  if (end !== null && end !== undefined && end !== "" && !validCalendarDate(end)) return "Choose a valid end date or leave it blank.";
  if (typeof end === "string" && end && end < start) return "The end date cannot be before the start date.";
  return null;
}
