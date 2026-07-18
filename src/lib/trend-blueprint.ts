import trendBlueprintJson from "@/data/trends/neet-20yr-trend-analysis-blueprint.json";
import { CHAPTERS, canonicalizeChapter, type NeetSubject, type NeetSubjectSlug } from "@/data/syllabus/neet-chapters";
import type { PracticeQuestion } from "@/lib/practice-engine";

type PracticeModeForTrend = "FULL_LENGTH" | "SECTIONAL" | "UNIT" | "SUBJECT" | "CHAPTER" | "TOPIC" | "PYQ_YEAR";
type ClassFilter = "11" | "12" | null | undefined;
type TrendClass = "XI" | "XII" | "XI/XII";

type TrendRow = {
  id: string;
  subject_section: NeetSubject;
  class_level: TrendClass | string;
  chapter: string;
  trend_model?: {
    expected_questions_per_45_question_section?: {
      target_avg?: number;
      min_safe?: number;
      max_safe?: number;
    };
    frequency_score_0_100?: number;
  };
  topic_focus?: unknown[];
  nta_question_behaviour?: unknown;
};

type TrendBlueprint = {
  schema_version?: string;
  chapter_trends?: Partial<Record<NeetSubject, TrendRow[]>>;
  paper_templates?: {
    neet_full_balanced_180?: {
      section_chapter_counts?: Partial<Record<NeetSubject, Record<string, number>>>;
    };
  };
};

export type TrendChapterQuota = {
  subject: NeetSubject;
  chapter: string;
  classLevel: "11" | "12" | null;
  count: number;
  trendChapterIds: string[];
  weight: number;
};

export type TrendSubjectQuota = {
  slug: NeetSubjectSlug;
  subject: NeetSubject;
  count: number;
  chapters: TrendChapterQuota[];
};

export type TrendAssemblyPlan = {
  blueprintVersion: string;
  paperTemplate: string;
  warnings: string[];
  subjects: TrendSubjectQuota[];
};

const trendBlueprint = trendBlueprintJson as TrendBlueprint;

export const TREND_BLUEPRINT_VERSION = String(trendBlueprint.schema_version ?? "unknown");
export const TREND_FULL_TEMPLATE = "neet_full_balanced_180";

const SUBJECT_NAMES: Record<NeetSubjectSlug, NeetSubject> = {
  physics: "Physics",
  chemistry: "Chemistry",
  botany: "Botany",
  zoology: "Zoology",
};

const SUBJECT_SLUGS: Record<NeetSubject, NeetSubjectSlug> = {
  Physics: "physics",
  Chemistry: "chemistry",
  Botany: "botany",
  Zoology: "zoology",
};

const TREND_ID_CANONICAL_CHAPTERS: Record<string, string[]> = {
  phy_measurement: ["Physics and Measurement", "Experimental Skills"],
  phy_kinematics: ["1D", "Kinematics"],
  phy_laws_motion: ["Laws of Motion"],
  phy_work_energy_power: ["Work, Energy and Power"],
  phy_rotational: ["Rotational Motion"],
  phy_gravitation: ["Gravitation"],
  phy_solids_fluids: ["Properties of Solids and Liquids"],
  phy_thermal_thermo: ["Thermodynamics"],
  phy_kinetic_theory: ["Kinetic Theory of Gases"],
  phy_oscillations: ["Oscillations and Waves"],
  phy_waves: ["Oscillations and Waves"],
  phy_electrostatics_capacitance: ["Electrostatics", "Capacitance"],
  phy_current_electricity: ["Current Electricity"],
  phy_magnetism: ["Magnetic Effects of Current and Magnetism"],
  phy_emi_ac: ["Electromagnetic Induction and AC"],
  phy_emwaves: ["Electromagnetic Waves"],
  phy_ray_optics: ["Optics"],
  phy_wave_optics: ["Optics"],
  phy_dual_nature: ["Dual Nature of Matter and Radiation"],
  phy_atoms_nuclei: ["Atoms and Nuclei"],
  phy_semiconductor: ["Electronic Devices"],

  chem_some_basic_concepts: ["Some Basic Concepts in Chemistry"],
  chem_atomic_structure: ["Atomic Structure"],
  chem_periodicity: ["Classification of Elements and Periodicity"],
  chem_bonding: ["Chemical Bonding and Molecular Structure"],
  chem_thermodynamics: ["Chemical Thermodynamics"],
  chem_equilibrium: ["Equilibrium"],
  chem_redox: ["Redox Reactions"],
  chem_solutions: ["Solutions"],
  chem_kinetics: ["Chemical Kinetics"],
  chem_d_f_block: ["d- and f-Block Elements"],
  chem_coordination: ["Coordination Compounds"],
  chem_p_block: ["P-Block Elements"],
  chem_goc: ["Purification and Characterisation of Organic Compounds", "Some Basic Principles of Organic Chemistry"],
  chem_hydrocarbons: ["Hydrocarbons"],
  chem_haloalkanes_haloarenes: ["Organic Compounds Containing Halogens"],
  chem_alcohols_phenols_ethers: ["Organic Compounds Containing Oxygen"],
  chem_carbonyl_carboxylic: ["Organic Compounds Containing Oxygen"],
  chem_amines: ["Organic Compounds Containing Nitrogen"],
  chem_biomolecules: ["Biomolecules"],
  chem_practical: ["Principles Related to Practical Chemistry"],

  bot_living_world: ["1 The living world"],
  bot_biological_classification: ["2 Biological classification"],
  bot_plant_kingdom: ["3 Plant kingdom"],
  bot_morphology: ["4 Morphology"],
  bot_anatomy: ["5 Anatomy"],
  bot_cell_unit: ["6 Cell"],
  bot_cell_cycle: ["7 Cell cycle and cell division"],
  bot_photosynthesis: ["8 Photosynthesis in higher plants"],
  bot_respiration: ["9 Respiration in plants"],
  bot_pgd: ["10 Plant growth and development"],
  bot_sexual_reproduction_flowering: ["11 Sexual repro in flowering plants"],
  bot_principles_inheritance: ["12 Principle of inheritance"],
  bot_molecular_basis: ["13 Molecular basis of inheritance"],
  bot_microbes: ["14 Microbes"],
  bot_organisms_populations: ["15 Organisms and population"],
  bot_ecosystem: ["16 Ecosystem"],
  bot_biodiversity: ["17 Biodiversity and conservation"],

  zoo_animal_kingdom: ["1 Animal kingdom"],
  zoo_structural_org: ["2 Structural organisation in animals"],
  zoo_biomolecules: ["3 Biomolecules"],
  zoo_breathing: ["4 Breathing"],
  zoo_circulation: ["5 Circulation"],
  zoo_excretion: ["6 Excretion"],
  zoo_locomotion: ["7 Locomotion and Movement"],
  zoo_neural: ["8 Neural"],
  zoo_chemical_coordination: ["9 Chemical coordination"],
  zoo_human_reproduction: ["10 Human Reproduction"],
  zoo_reproductive_health: ["11 Reproductive Health"],
  zoo_evolution: ["12 Evolution"],
  zoo_human_health: ["13 Human health & diseases"],
  zoo_biotech_principles: ["14 Biotechnology principle & processes"],
  zoo_biotech_applications: ["15 Biotechnology & applications"],
};

function classMatches(rowClass: string | null | undefined, classLevel: ClassFilter) {
  if (!classLevel) return true;
  const normalized = String(rowClass ?? "").toUpperCase();
  if (normalized.includes("/")) return normalized.includes(classLevel === "11" ? "XI" : "XII");
  return normalized === (classLevel === "11" ? "XI" : "XII");
}

function chapterClass(subject: NeetSubject, chapter: string) {
  return CHAPTERS.find((entry) => entry.subject === subject && entry.chapter === chapter)?.classLevel ?? null;
}

function resolveTrendChapters(row: TrendRow, classLevel: ClassFilter) {
  const manual = TREND_ID_CANONICAL_CHAPTERS[row.id] ?? [];
  const candidates = manual.length ? manual : [row.chapter, ...row.chapter.split(/\s*(?:\/| and )\s*/i)];
  const resolved = candidates
    .map((chapter) => canonicalizeChapter(row.subject_section, chapter)?.chapter ?? null)
    .filter((chapter): chapter is string => Boolean(chapter));
  return [...new Set(resolved)].filter((chapter) => {
    const entryClass = chapterClass(row.subject_section, chapter);
    return !classLevel || entryClass === classLevel;
  });
}

function hashUnit(seed: string, key: string) {
  let hash = 2166136261;
  const text = `${seed}:${key}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function allocateByWeight<T extends { key: string; weight: number }>(total: number, entries: T[]) {
  if (total <= 0 || !entries.length) return [] as Array<T & { count: number }>;
  const positive = entries.filter((entry) => entry.weight > 0);
  if (!positive.length) return [] as Array<T & { count: number }>;
  const weightSum = positive.reduce((sum, entry) => sum + entry.weight, 0);
  const rows = positive.map((entry) => {
    const exact = (entry.weight / weightSum) * total;
    return { ...entry, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = total - rows.reduce((sum, entry) => sum + entry.count, 0);
  rows
    .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.key.localeCompare(b.key))
    .forEach((entry) => {
      if (remaining <= 0) return;
      entry.count += 1;
      remaining -= 1;
    });
  return rows.filter((entry) => entry.count > 0).map((entry) => {
    const { remainder, ...quota } = entry;
    void remainder;
    return quota;
  });
}

function applyCoverageAndCap(total: number, rows: Array<TrendChapterQuota>, seed: string) {
  if (!rows.length) return rows;
  const subject = rows[0].subject;
  const minCoverage = total >= rows.length ? 1 : 0;
  const baseCap = subject === "Physics" || subject === "Chemistry" ? 4 : 6;
  const cap = Math.max(minCoverage, Math.ceil((baseCap * Math.max(total, 1)) / 45));
  const byChapter = new Map(rows.map((row) => [row.chapter, { ...row, count: 0 }]));

  let reserved = 0;
  if (minCoverage > 0) {
    for (const row of byChapter.values()) {
      row.count = 1;
      reserved += 1;
    }
  }

  const allocated = allocateByWeight(Math.max(0, total - reserved), [...byChapter.values()].map((row) => ({
    key: row.chapter,
    weight: row.weight,
  })));
  for (const entry of allocated) {
    const row = byChapter.get(entry.key);
    if (row) row.count += entry.count;
  }

  let overflow = 0;
  for (const row of byChapter.values()) {
    if (row.count > cap) {
      overflow += row.count - cap;
      row.count = cap;
    }
  }

  const ordered = [...byChapter.values()].sort(
    (a, b) => b.weight - a.weight || hashUnit(seed, `${a.subject}:${a.chapter}`) - hashUnit(seed, `${b.subject}:${b.chapter}`),
  );
  while (overflow > 0) {
    const target = ordered.find((row) => row.count < cap);
    if (!target) break;
    target.count += 1;
    overflow -= 1;
  }

  return ordered.filter((row) => row.count > 0);
}

function chapterWeights(subject: NeetSubject, count: number, classLevel: ClassFilter, mode: PracticeModeForTrend, seed: string, warnings: string[]) {
  const rows = (trendBlueprint.chapter_trends?.[subject] ?? []).filter((row) => classMatches(row.class_level, classLevel));
  const templateCounts = mode === "FULL_LENGTH" ? trendBlueprint.paper_templates?.[TREND_FULL_TEMPLATE]?.section_chapter_counts?.[subject] : null;
  const chapterMap = new Map<string, TrendChapterQuota>();

  for (const row of rows) {
    const resolved = resolveTrendChapters(row, classLevel);
    if (!resolved.length) {
      warnings.push(`Trend row ${row.id} (${subject}) has no matching active bank chapter for this scope.`);
      continue;
    }
    const templateWeight = templateCounts?.[row.id];
    const targetAvg = Number(row.trend_model?.expected_questions_per_45_question_section?.target_avg ?? 1);
    const frequency = Number(row.trend_model?.frequency_score_0_100 ?? 30) / 100;
    const weightBase = Math.max(0.1, Number.isFinite(templateWeight) ? Number(templateWeight) : targetAvg + frequency);
    const splitWeight = weightBase / resolved.length;
    for (const chapter of resolved) {
      const existing = chapterMap.get(chapter);
      const jitter = 0.9 + hashUnit(seed, `${subject}:${row.id}:${chapter}`) * 0.2;
      if (existing) {
        existing.weight += splitWeight * jitter;
        existing.trendChapterIds.push(row.id);
      } else {
        chapterMap.set(chapter, {
          subject,
          chapter,
          classLevel: chapterClass(subject, chapter),
          count: 0,
          trendChapterIds: [row.id],
          weight: splitWeight * jitter,
        });
      }
    }
  }

  const canonicalChapters = CHAPTERS.filter((chapter) => chapter.subject === subject && (!classLevel || chapter.classLevel === classLevel));
  for (const chapter of canonicalChapters) {
    if (!chapterMap.has(chapter.chapter)) {
      chapterMap.set(chapter.chapter, {
        subject,
        chapter: chapter.chapter,
        classLevel: chapter.classLevel,
        count: 0,
        trendChapterIds: [],
        weight: 0.35,
      });
    }
  }

  return applyCoverageAndCap(count, [...chapterMap.values()], seed);
}

function splitEvenly(total: number, subjects: NeetSubjectSlug[]) {
  const base = Math.floor(total / subjects.length);
  let remainder = total % subjects.length;
  return subjects.map((slug) => ({ slug, count: base + (remainder-- > 0 ? 1 : 0) }));
}

export function shouldUseTrendAssembly(request: {
  mode: PracticeModeForTrend;
  chapter?: string | null;
  chapters?: string[] | null;
  topic?: string | null;
  pyqYear?: string | null;
}) {
  if (request.pyqYear || request.mode === "PYQ_YEAR") return false;
  if (request.topic || request.chapter || request.chapters?.length) return false;
  return request.mode === "FULL_LENGTH" || request.mode === "SECTIONAL" || request.mode === "UNIT" || request.mode === "SUBJECT";
}

export function buildTrendAssemblyPlan(request: {
  mode: PracticeModeForTrend;
  subjects: NeetSubjectSlug[];
  classLevel?: ClassFilter;
  questionCount: number;
  desiredCount: number;
  existingQuestions?: PracticeQuestion[];
  seed?: string | null;
}): TrendAssemblyPlan {
  const warnings: string[] = [];
  const subjects = request.subjects.length ? request.subjects : (["physics", "chemistry", "botany", "zoology"] as NeetSubjectSlug[]);
  const seed = request.seed || "trend-default";
  const existingCounts = new Map<NeetSubject, number>();
  for (const question of request.existingQuestions ?? []) {
    existingCounts.set(question.subject as NeetSubject, (existingCounts.get(question.subject as NeetSubject) ?? 0) + 1);
  }

  const finalTargets = splitEvenly(request.questionCount, subjects).map((entry) => {
    const subject = SUBJECT_NAMES[entry.slug];
    return {
      key: entry.slug,
      slug: entry.slug,
      subject,
      weight: Math.max(0, entry.count - (existingCounts.get(subject) ?? 0)),
    };
  });
  const subjectCounts = allocateByWeight(request.desiredCount, finalTargets).map((entry) => ({
    slug: entry.slug,
    subject: entry.subject,
    count: entry.count,
  }));

  return {
    blueprintVersion: TREND_BLUEPRINT_VERSION,
    paperTemplate: TREND_FULL_TEMPLATE,
    warnings,
    subjects: subjectCounts.map((subjectQuota) => ({
      ...subjectQuota,
      chapters: chapterWeights(subjectQuota.subject, subjectQuota.count, request.classLevel, request.mode, seed, warnings),
    })),
  };
}

export function buildDistributionAudit(
  questions: PracticeQuestion[],
  context?: { blueprintWarnings?: string[]; assemblyAudits?: unknown[]; qualityGate?: unknown },
) {
  const subjectMap = new Map<string, { total: number; chapters: Map<string, number>; classes: Map<string, number> }>();
  for (const question of questions) {
    const entry = subjectMap.get(question.subject) ?? { total: 0, chapters: new Map<string, number>(), classes: new Map<string, number>() };
    entry.total += 1;
    entry.chapters.set(question.chapter, (entry.chapters.get(question.chapter) ?? 0) + 1);
    const cls = CHAPTERS.find((chapter) => chapter.subject === question.subject && chapter.chapter === question.chapter)?.classLevel ?? "unknown";
    entry.classes.set(cls, (entry.classes.get(cls) ?? 0) + 1);
    subjectMap.set(question.subject, entry);
  }

  return {
    blueprintVersion: TREND_BLUEPRINT_VERSION,
    paperTemplate: TREND_FULL_TEMPLATE,
    totalQuestions: questions.length,
    subjects: Object.fromEntries(
      [...subjectMap.entries()].map(([subject, entry]) => [
        subject,
        {
          total: entry.total,
          classes: Object.fromEntries([...entry.classes.entries()].sort()),
          chapters: Object.fromEntries([...entry.chapters.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
        },
      ]),
    ),
    warnings: context?.blueprintWarnings ?? [],
    assemblyAudits: context?.assemblyAudits ?? [],
    qualityGate: context?.qualityGate ?? null,
  };
}

export function trendSubjectFromSlug(slug: NeetSubjectSlug) {
  return SUBJECT_NAMES[slug];
}

export function trendSlugFromSubject(subject: NeetSubject) {
  return SUBJECT_SLUGS[subject];
}
