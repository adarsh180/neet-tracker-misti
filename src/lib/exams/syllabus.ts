import { NEET_PG_PAPER } from "@/data/exams/neet-pg";
import { NEET_SS_GROUPS, NEET_SS_PAPER, type SsGroup } from "@/data/exams/neet-ss";

/**
 * The PG / SS syllabus lives in the database (exam_nodes) as one editable tree:
 * subject → chapter → topic → subtopic, each with an optional note. This file
 * turns the loaded nodes into a weighted tree for a workspace. Every trackable
 * item (a topic, or a chapter with no topics) carries the exam marks it stands
 * for, so coverage and revision count by marks; subtopics are a checklist
 * inside their topic. The tree is rebuilt on every load: add a topic and the
 * chapter's marks are re-shared at once.
 */

export type ExamKey = "pg" | "ss";
export type SsChoice = { group: string; specialties: string[] };
export type ExamPrefs = { targetDate?: string | null; ss?: SsChoice | null; hoursTarget?: number | null; focus?: string | null };

export type NodeRole = "subject" | "paper" | "course" | "custom";
/** One syllabus node as sent to the client (levels 1–3; subtopics load per chapter). */
export type SyllabusNode = {
  key: string;
  parent: string | null;
  level: 1 | 2 | 3 | 4;
  name: string;
  detail: string | null;
  ord: number;
  hidden: boolean;
  user: boolean;
  /** Subjects only. */
  weight?: number;
  hue?: number;
  group?: string;
  role?: NodeRole;
};
export type ExamSyllabus = { nodes: SyllabusNode[]; subCounts: Record<string, number> };
export const EMPTY_SYLLABUS: ExamSyllabus = { nodes: [], subCounts: {} };

export type TreeItem = { key: string; label: string; marks: number; custom: boolean; detail: string | null; subs: number };
export type TreeChapter = { key: string; name: string; marks: number; custom: boolean; detail: string | null; items: TreeItem[] };
export type TreeSubject = { key: string; name: string; group: string; hue: number; marks: number; custom: boolean; detail: string | null; role: NodeRole; weight: number; chapters: TreeChapter[] };
export type ExamTree = { exam: ExamKey; title: string; totalMarks: number; questions: number; subjects: TreeSubject[]; note: string };

export const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

/** The SS group in use and the subjects (paper + chosen courses) that belong in its tree. */
export function ssScope(prefs: ExamPrefs): { group: SsGroup; subjectKeys: string[] } {
  const group = NEET_SS_GROUPS.find((g) => g.key === prefs.ss?.group) ?? NEET_SS_GROUPS[0];
  const chosen = group.courses.filter((c) => c.subject && prefs.ss?.specialties?.includes(c.key)).map((c) => c.subject as string);
  return { group, subjectKeys: [group.paperSubject, ...chosen] };
}

const byOrd = (a: SyllabusNode, b: SyllabusNode) => a.ord - b.ord || a.name.localeCompare(b.name);

export function buildTree(exam: ExamKey, prefs: ExamPrefs, syl: ExamSyllabus = EMPTY_SYLLABUS, opts: { raw?: boolean } = {}): ExamTree {
  const visible = (n: SyllabusNode) => opts.raw || !n.hidden;
  const kids = new Map<string, SyllabusNode[]>();
  for (const n of syl.nodes) if (n.parent && visible(n)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  for (const list of kids.values()) list.sort(byOrd);

  let subjects = syl.nodes.filter((n) => n.level === 1 && visible(n)).sort(byOrd);
  let title = "NEET PG";
  let totalMarks: number = NEET_PG_PAPER.marks;
  let questions: number = NEET_PG_PAPER.questions;
  let note = "Subject weights: NBEMS indicative relative weights scaled to 180 questions / 720 marks; chapters share their subject equally, topics share their chapter.";
  let marksOf: (s: SyllabusNode) => number;

  if (exam === "pg") {
    const total = subjects.reduce((a, s) => a + Math.max(0, s.weight ?? 0), 0) || 1;
    marksOf = (s) => (Math.max(0, s.weight ?? 0) / total) * NEET_PG_PAPER.marks;
  } else {
    const { group, subjectKeys } = ssScope(prefs);
    subjects = subjects.filter((s) => subjectKeys.includes(s.key) || (s.user && s.group === group.key));
    subjects.sort((a, b) => (a.key === group.paperSubject ? -1 : b.key === group.paperSubject ? 1 : byOrd(a, b)));
    title = `NEET SS · ${group.name}`;
    totalMarks = NEET_SS_PAPER.marks;
    questions = NEET_SS_PAPER.questions;
    note = group.exception
      ? `The ${group.name} paper asks only from the topics of ${group.courses[0]?.name ?? "the super specialty"} (NBEMS NEET-SS 2025 bulletin, Table 2).`
      : `All 150 questions come from the PG-exit curriculum of ${group.feeder} (NBEMS NEET-SS 2025 bulletin, Table 1). Your course chapters are for depth — they carry no paper marks.`;
    marksOf = (s) => (s.key === group.paperSubject ? NEET_SS_PAPER.marks : 0);
  }

  return {
    exam,
    title,
    totalMarks,
    questions,
    note,
    subjects: subjects.map((s) => {
      const marks = marksOf(s);
      const chapters = (kids.get(s.key) ?? []).filter((c) => c.level === 2);
      const per = chapters.length ? marks / chapters.length : 0;
      return {
        key: s.key,
        name: s.name,
        group: exam === "ss" ? (s.role === "paper" ? "Question paper" : "Your course — beyond the paper") : s.group ?? "Your subjects",
        hue: s.hue ?? (s.user ? 300 : 200),
        marks,
        custom: s.user,
        detail: s.detail,
        role: s.role ?? (s.user ? "custom" : "subject"),
        weight: s.weight ?? 0,
        chapters: chapters.map((c) => {
          const topics = (kids.get(c.key) ?? []).filter((t) => t.level === 3);
          // A chapter with no topics yet is tracked as one item.
          const items: TreeItem[] = topics.length
            ? topics.map((t) => ({ key: t.key, label: t.name, marks: per / topics.length, custom: t.user, detail: t.detail, subs: syl.subCounts[t.key] ?? 0 }))
            : [{ key: c.key, label: c.name, marks: per, custom: c.user, detail: null, subs: 0 }];
          return { key: c.key, name: c.name, marks: per, custom: c.user, detail: c.detail, items };
        }),
      };
    }),
  };
}

/** The subject in focus (menu toggle) — null means the whole exam. Falls back to whole exam if the subject vanished. */
export function focusOf(tree: ExamTree, prefs: ExamPrefs) {
  return tree.subjects.some((s) => s.key === prefs.focus) ? (prefs.focus as string) : null;
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

/** Every valid item/chapter key in the tree (for server-side validation). */
export function treeKeys(tree: ExamTree) {
  const items = new Set<string>();
  const chapters = new Set<string>();
  for (const s of tree.subjects)
    for (const c of s.chapters) {
      chapters.add(c.key);
      for (const i of c.items) items.add(i.key);
    }
  return { items, chapters, subjects: new Set(tree.subjects.map((s) => s.key)) };
}
