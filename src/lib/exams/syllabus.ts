import { NEET_PG_PAPER, NEET_PG_SUBJECTS } from "@/data/exams/neet-pg";
import { NEET_SS_GROUPS, NEET_SS_PAPER } from "@/data/exams/neet-ss";

/**
 * Turns the static syllabus data — plus your own chapters, topics, renames and
 * hides — into one weighted tree for a workspace. Every trackable item carries
 * the exam marks it stands for, so coverage and revision count by marks. The
 * tree is rebuilt on every load: add a topic and the chapter's marks are
 * re-shared across all of its topics at once.
 */

export type ExamKey = "pg" | "ss";
export type SsChoice = { group: string; specialties: string[] };
export type ExamPrefs = { targetDate?: string | null; ss?: SsChoice | null; hoursTarget?: number | null; focus?: string | null };

export type CustomItem = { id: string; subjectKey: string; chapterKey: string | null; kind: "chapter" | "topic"; name: string };
export type ItemOverride = { itemKey: string; hidden: boolean; rename: string | null };
export type Customisations = { items: CustomItem[]; overrides: ItemOverride[] };

export type TreeItem = { key: string; label: string; marks: number; custom: boolean };
export type TreeChapter = { key: string; name: string; marks: number; custom: boolean; items: TreeItem[] };
export type TreeSubject = { key: string; name: string; group: string; hue: number; marks: number; chapters: TreeChapter[] };
export type ExamTree = { exam: ExamKey; title: string; totalMarks: number; questions: number; subjects: TreeSubject[]; note: string };

export const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
export const EMPTY_CUSTOM: Customisations = { items: [], overrides: [] };

type RawChapter = { key: string; name: string; topics: string[] };

function chaptersFor(subjectKey: string, raw: RawChapter[], marks: number, custom: Customisations): TreeChapter[] {
  const ov = new Map(custom.overrides.map((o) => [o.itemKey, o]));
  const hidden = (k: string) => ov.get(k)?.hidden === true;
  const label = (k: string, fallback: string) => ov.get(k)?.rename || fallback;

  const draft: Array<{ key: string; name: string; custom: boolean; items: Array<{ key: string; label: string; custom: boolean }> }> = [];
  for (const c of raw) {
    const key = `${subjectKey}.${c.key}`;
    if (hidden(key)) continue;
    const topics = c.topics.length ? c.topics : [c.name];
    draft.push({
      key,
      name: label(key, c.name),
      custom: false,
      items: topics
        .map((t) => {
          const k = c.topics.length ? `${key}.${slug(t)}` : key;
          return { key: k, label: label(k, t), custom: false };
        })
        .filter((it) => it.key === key || !hidden(it.key)),
    });
  }
  for (const c of custom.items.filter((x) => x.kind === "chapter" && x.subjectKey === subjectKey)) {
    const key = `${subjectKey}.x${c.id}`;
    if (hidden(key)) continue;
    draft.push({ key, name: label(key, c.name), custom: true, items: [] });
  }
  for (const t of custom.items.filter((x) => x.kind === "topic" && x.subjectKey === subjectKey)) {
    const ch = draft.find((d) => d.key === t.chapterKey);
    if (!ch) continue;
    const key = `${ch.key}.x${t.id}`;
    if (hidden(key)) continue;
    ch.items.push({ key, label: label(key, t.name), custom: true });
  }
  // A custom chapter with no topics yet is tracked as one item.
  for (const d of draft) if (!d.items.length) d.items.push({ key: d.key, label: d.name, custom: d.custom });

  const per = draft.length ? marks / draft.length : 0;
  return draft.map((d) => ({ ...d, marks: per, items: d.items.map((it) => ({ ...it, marks: per / d.items.length })) }));
}

export function buildTree(exam: ExamKey, prefs: ExamPrefs, custom: Customisations = EMPTY_CUSTOM): ExamTree {
  if (exam === "pg") {
    const total = NEET_PG_SUBJECTS.reduce((s, x) => s + x.weight, 0);
    return {
      exam,
      title: "NEET PG",
      totalMarks: NEET_PG_PAPER.marks,
      questions: NEET_PG_PAPER.questions,
      note: "Subject weights: NBEMS indicative relative weights scaled to 180 questions / 720 marks; chapters share their subject equally, topics share their chapter.",
      subjects: NEET_PG_SUBJECTS.map((s) => {
        const marks = (s.weight / total) * NEET_PG_PAPER.marks;
        return { key: s.key, name: s.name, group: s.group, hue: s.hue, marks, chapters: chaptersFor(s.key, s.chapters, marks, custom) };
      }),
    };
  }
  const group = NEET_SS_GROUPS.find((g) => g.key === prefs.ss?.group) ?? NEET_SS_GROUPS[0];
  const chosen = group.specialties.filter((s) => prefs.ss?.specialties?.includes(s.key));
  const specialties = chosen.length ? chosen : group.specialties.slice(0, 1);
  const feederMarks = NEET_SS_PAPER.marks * NEET_SS_PAPER.feederShare;
  const specMarks = (NEET_SS_PAPER.marks - feederMarks) / specialties.length;
  const feederKey = `${group.key}.feeder`;
  return {
    exam,
    title: `NEET SS · ${group.name}`,
    totalMarks: NEET_SS_PAPER.marks,
    questions: NEET_SS_PAPER.questions,
    note: "≈40% of the paper from the feeder broad specialty, ≈60% from your chosen super-specialty courses; chapters share their part, topics their chapter.",
    subjects: [
      { key: feederKey, name: group.feeder.name, group: "Feeder (40%)", hue: group.hue, marks: feederMarks, chapters: chaptersFor(feederKey, group.feeder.chapters, feederMarks, custom) },
      ...specialties.map((s, i) => {
        const key = `${group.key}.${s.key}`;
        return { key, name: `${s.degree} ${s.name}`, group: "Super-specialty (60%)", hue: (group.hue + 40 + i * 47) % 360, marks: specMarks, chapters: chaptersFor(key, s.chapters, specMarks, custom) };
      }),
    ],
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
