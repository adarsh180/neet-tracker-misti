import { NEET_PG_PAPER, NEET_PG_SUBJECTS } from "@/data/exams/neet-pg";
import { NEET_SS_GROUPS, NEET_SS_PAPER } from "@/data/exams/neet-ss";

/**
 * Turns the static syllabus data into one weighted tree for a workspace.
 * Every trackable item carries the exam marks it stands for, so coverage and
 * revision are counted by marks — and the tree is rebuilt on every load, so a
 * syllabus edit or a new SS specialty choice re-weights immediately.
 */

export type ExamKey = "pg" | "ss";
export type SsChoice = { group: string; specialties: string[] };
export type ExamPrefs = { targetDate?: string | null; ss?: SsChoice | null; hoursTarget?: number | null };

export type TreeItem = { key: string; label: string; marks: number };
export type TreeChapter = { key: string; name: string; marks: number; items: TreeItem[] };
export type TreeSubject = { key: string; name: string; group: string; hue: number; marks: number; chapters: TreeChapter[] };
export type ExamTree = { exam: ExamKey; title: string; totalMarks: number; questions: number; subjects: TreeSubject[]; note: string };

export const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

function chaptersFor(prefix: string, chapters: Array<{ key: string; name: string; topics: string[] }>, marks: number): TreeChapter[] {
  const per = chapters.length ? marks / chapters.length : 0;
  return chapters.map((c) => {
    const topics = c.topics.length ? c.topics : [c.name];
    const each = per / topics.length;
    return {
      key: `${prefix}.${c.key}`,
      name: c.name,
      marks: per,
      items: topics.map((t) => ({ key: c.topics.length ? `${prefix}.${c.key}.${slug(t)}` : `${prefix}.${c.key}`, label: t, marks: each })),
    };
  });
}

export function buildTree(exam: ExamKey, prefs: ExamPrefs): ExamTree {
  if (exam === "pg") {
    const total = NEET_PG_SUBJECTS.reduce((s, x) => s + x.weight, 0);
    return {
      exam,
      title: "NEET PG",
      totalMarks: NEET_PG_PAPER.marks,
      questions: NEET_PG_PAPER.questions,
      note: "Subject weights: NBEMS indicative relative weights scaled to 180 questions / 720 marks; chapters share their subject equally.",
      subjects: NEET_PG_SUBJECTS.map((s) => {
        const marks = (s.weight / total) * NEET_PG_PAPER.marks;
        return { key: s.key, name: s.name, group: s.group, hue: s.hue, marks, chapters: chaptersFor(s.key, s.chapters, marks) };
      }),
    };
  }
  const group = NEET_SS_GROUPS.find((g) => g.key === prefs.ss?.group) ?? NEET_SS_GROUPS[0];
  const chosen = group.specialties.filter((s) => prefs.ss?.specialties?.includes(s.key));
  const specialties = chosen.length ? chosen : group.specialties.slice(0, 1);
  const feederMarks = NEET_SS_PAPER.marks * NEET_SS_PAPER.feederShare;
  const specMarks = (NEET_SS_PAPER.marks - feederMarks) / specialties.length;
  return {
    exam,
    title: `NEET SS · ${group.name}`,
    totalMarks: NEET_SS_PAPER.marks,
    questions: NEET_SS_PAPER.questions,
    note: "≈40% of the paper from the feeder broad specialty, ≈60% from your chosen super-specialty courses; chapters share their part equally.",
    subjects: [
      { key: `${group.key}.feeder`, name: group.feeder.name, group: "Feeder (40%)", hue: group.hue, marks: feederMarks, chapters: chaptersFor(`${group.key}.feeder`, group.feeder.chapters, feederMarks) },
      ...specialties.map((s, i) => ({
        key: `${group.key}.${s.key}`,
        name: `${s.degree} ${s.name}`,
        group: "Super-specialty (60%)",
        hue: (group.hue + 40 + i * 47) % 360,
        marks: specMarks,
        chapters: chaptersFor(`${group.key}.${s.key}`, s.chapters, specMarks),
      })),
    ],
  };
}

/** Restrict the tree to a zone: everything, one subject, or one chapter. */
export function zoneTree(tree: ExamTree, zone: { subject?: string | null; chapter?: string | null }) {
  if (!zone.subject) return tree.subjects;
  const s = tree.subjects.find((x) => x.key === zone.subject);
  if (!s) return tree.subjects;
  if (!zone.chapter) return [s];
  const c = s.chapters.find((x) => x.key === zone.chapter);
  return c ? [{ ...s, marks: c.marks, chapters: [c] }] : [s];
}
