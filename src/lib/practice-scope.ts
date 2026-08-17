import { canonicalizeChapter, SUBJECT_SLUGS } from "@/data/syllabus/neet-chapters";
import type { PracticeScope, PracticeSourceKind, PracticeSubjectSlug } from "@/lib/practice-engine";

export const SECTIONAL_PCB_SUBJECTS: PracticeSubjectSlug[] = ["physics", "chemistry", "botany", "zoology"];

export function normalizeSectionalClass(value: unknown, classLevels?: unknown): "11" | "12" | null {
  if (value === "11" || value === "12") return value;
  const normalized = normalizeClassLevels(classLevels);
  return normalized.length === 1 ? normalized[0] : null;
}

export function normalizeClassLevels(value: unknown, fallback?: string | null): ("11" | "12")[] {
  const candidates = Array.isArray(value) ? value : fallback ? [fallback] : [];
  return (["11", "12"] as const).filter((level) => candidates.includes(level));
}

export function normalizePracticeScopes(value: unknown): PracticeScope[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, PracticeScope>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const subject = SUBJECT_SLUGS.includes(raw.subject as PracticeSubjectSlug) ? raw.subject as PracticeSubjectSlug : null;
    const classLevel = raw.classLevel === "11" || raw.classLevel === "12" ? raw.classLevel : null;
    const chapterName = typeof raw.chapter === "string" ? raw.chapter.trim() : "";
    const chapter = subject && chapterName ? canonicalizeChapter(subject, chapterName) : null;
    if (!subject || !classLevel || !chapter || chapter.classLevel !== classLevel) continue;
    const topics = Array.isArray(raw.topics)
      ? [...new Set(raw.topics.map((topic) => String(topic ?? "").trim()).filter(Boolean))].slice(0, 50)
      : undefined;
    const scope: PracticeScope = { subject, classLevel, chapter: chapter.chapter, topics };
    unique.set(`${subject}:${classLevel}:${chapter.chapter}:${topics?.join("|") ?? ""}`, scope);
  }
  return [...unique.values()];
}

export function normalizeSourceKinds(value: unknown): PracticeSourceKind[] {
  return (["PYQ", "QUESTION_BANK"] as PracticeSourceKind[]).filter((kind) => !Array.isArray(value) || value.includes(kind));
}
