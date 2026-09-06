/** Keep a skipped scale response distinct from an explicitly recorded zero. */
export function optionalRating(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return Math.round(number);
}
