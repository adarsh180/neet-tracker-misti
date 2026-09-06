/** Date-only study records use UTC midnight; real event timestamps use India time. */
export function indiaDateKey(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function requestedStudyDate(utterance: string, now = new Date()): string | null {
  if (/\byesterday\b|कल पढ़|कल पढ/i.test(utterance)) return indiaDateKey(new Date(now.getTime() - 86_400_000));
  if (/\btoday\b|आज/i.test(utterance)) return indiaDateKey(now);
  return null;
}
