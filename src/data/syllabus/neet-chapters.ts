export const SUBJECT_DISPLAY_NAMES = ["Physics", "Chemistry", "Botany", "Zoology"] as const;
export const SUBJECT_SLUGS = ["physics", "chemistry", "botany", "zoology"] as const;

export type NeetSubject = (typeof SUBJECT_DISPLAY_NAMES)[number];
export type NeetSubjectSlug = (typeof SUBJECT_SLUGS)[number];
export type ClassLevel = "11" | "12";

export type ChapterEntry = {
  subject: NeetSubject;
  slug: NeetSubjectSlug;
  classLevel: ClassLevel;
  chapter: string;
  aliases: string[];
};

const SUBJECT_BY_SLUG: Record<NeetSubjectSlug, NeetSubject> = {
  physics: "Physics",
  chemistry: "Chemistry",
  botany: "Botany",
  zoology: "Zoology",
};

const SLUG_BY_SUBJECT: Record<string, NeetSubjectSlug> = {
  physics: "physics",
  chemistry: "chemistry",
  botany: "botany",
  zoology: "zoology",
};

function entry(slug: NeetSubjectSlug, classLevel: ClassLevel, chapter: string, aliases: string[] = []): ChapterEntry {
  return { subject: SUBJECT_BY_SLUG[slug], slug, classLevel, chapter, aliases };
}

export const CHAPTERS: ChapterEntry[] = [
  entry("physics", "11", "Physics and Measurement", ["Units and Measurement", "Units & Measurement", "Physical World"]),
  entry("physics", "11", "Basic maths", ["Basic Mathematics", "Mathematical Tools", "Maths in Physics"]),
  entry("physics", "11", "1D", ["Motion in a Straight Line", "Straight Line Motion", "One Dimensional Motion"]),
  entry("physics", "11", "Kinematics", ["Motion in a Plane", "Vectors", "Projectile Motion"]),
  entry("physics", "11", "Laws of Motion", ["Newton's Laws of Motion", "NLM"]),
  entry("physics", "11", "Work, Energy and Power", ["Work Energy Power", "Work, Power and Energy", "WEP"]),
  entry("physics", "11", "Rotational Motion", ["System of Particles and Rotational Motion"]),
  entry("physics", "11", "Gravitation", ["Universal Gravitation"]),
  entry("physics", "11", "Properties of Solids and Liquids", [
    "Mechanical Properties of Solids",
    "Mechanical Properties of Fluids",
    "Properties of Bulk Matter",
    "Fluids",
  ]),
  entry("physics", "11", "Thermodynamics", ["Heat and Thermodynamics"]),
  entry("physics", "11", "Kinetic Theory of Gases", ["Kinetic Theory", "KTG"]),
  entry("physics", "11", "Oscillations and Waves", ["Oscillations", "Waves"]),
  entry("physics", "12", "Electrostatics", ["Electric Charges and Fields"]),
  entry("physics", "12", "Capacitance", ["Electrostatic Potential and Capacitance"]),
  entry("physics", "12", "Current Electricity", []),
  entry("physics", "12", "Magnetic Effects of Current and Magnetism", ["Moving Charges and Magnetism", "Magnetism and Matter"]),
  entry("physics", "12", "Electromagnetic Induction and AC", ["Electromagnetic Induction", "Alternating Current", "AC"]),
  entry("physics", "12", "Electromagnetic Waves", []),
  entry("physics", "12", "Optics", ["Ray Optics", "Wave Optics"]),
  entry("physics", "12", "Dual Nature of Matter and Radiation", ["Dual Nature"]),
  entry("physics", "12", "Atoms and Nuclei", ["Atoms", "Nuclei"]),
  entry("physics", "12", "Electronic Devices", ["Semiconductor Electronics"]),
  entry("physics", "12", "Experimental Skills", ["Practical Physics"]),

  entry("chemistry", "11", "Some Basic Concepts in Chemistry", ["Some Basic Concepts of Chemistry", "Mole Concept"]),
  entry("chemistry", "11", "Atomic Structure", ["Structure of Atom"]),
  entry("chemistry", "11", "Classification of Elements and Periodicity", ["Classification of Elements", "Periodic Table"]),
  entry("chemistry", "11", "Chemical Bonding and Molecular Structure", ["Chemical Bonding"]),
  entry("chemistry", "11", "Chemical Thermodynamics", ["Thermodynamics"]),
  entry("chemistry", "11", "Equilibrium", ["Chemical Equilibrium", "Ionic Equilibrium"]),
  entry("chemistry", "11", "Redox Reactions", []),
  entry("chemistry", "11", "Purification and Characterisation of Organic Compounds", ["Purification of Organic Compounds"]),
  entry("chemistry", "11", "Some Basic Principles of Organic Chemistry", ["Organic Chemistry: Some Basic Principles and Techniques", "GOC"]),
  entry("chemistry", "11", "Hydrocarbons", []),
  entry("chemistry", "12", "Solutions", []),
  entry("chemistry", "12", "Chemical Kinetics", []),
  entry("chemistry", "12", "Principles Related to Practical Chemistry", ["Practical Chemistry"]),
  entry("chemistry", "12", "P-Block Elements", ["p-Block Elements"]),
  entry("chemistry", "12", "d- and f-Block Elements", ["d and f Block Elements", "d-Block and f-Block Elements"]),
  entry("chemistry", "12", "Coordination Compounds", []),
  entry("chemistry", "12", "Organic Compounds Containing Halogens", ["Haloalkanes and Haloarenes"]),
  entry("chemistry", "12", "Organic Compounds Containing Oxygen", ["Alcohols Phenols and Ethers", "Aldehydes Ketones and Carboxylic Acids"]),
  entry("chemistry", "12", "Organic Compounds Containing Nitrogen", ["Amines"]),
  entry("chemistry", "12", "Biomolecules", []),

  entry("botany", "11", "1 The living world", ["The Living World"]),
  entry("botany", "11", "2 Biological classification", ["Biological Classification"]),
  entry("botany", "11", "3 Plant kingdom", ["Plant Kingdom"]),
  entry("botany", "11", "4 Morphology", ["Morphology of Flowering Plants"]),
  entry("botany", "11", "5 Anatomy", ["Anatomy of Flowering Plants"]),
  entry("botany", "11", "6 Cell", ["Cell: The Unit of Life", "Cell Unit of Life"]),
  entry("botany", "11", "7 Cell cycle and cell division", ["Cell Cycle and Cell Division"]),
  entry("botany", "11", "8 Photosynthesis in higher plants", ["Photosynthesis in Higher Plants"]),
  entry("botany", "11", "9 Respiration in plants", ["Respiration in Plants"]),
  entry("botany", "11", "10 Plant growth and development", ["Plant Growth and Development"]),
  entry("botany", "12", "11 Sexual repro in flowering plants", ["Sexual Reproduction in Flowering Plants"]),
  entry("botany", "12", "12 Principle of inheritance", ["Principles of Inheritance and Variation"]),
  entry("botany", "12", "13 Molecular basis of inheritance", ["Molecular Basis of Inheritance"]),
  entry("botany", "12", "14 Microbes", ["Microbes in Human Welfare"]),
  entry("botany", "12", "15 Organisms and population", ["Organisms and Populations"]),
  entry("botany", "12", "16 Ecosystem", []),
  entry("botany", "12", "17 Biodiversity and conservation", ["Biodiversity and Conservation"]),

  entry("zoology", "11", "1 Animal kingdom", ["Animal Kingdom"]),
  entry("zoology", "11", "2 Structural organisation in animals", ["Structural Organisation in Animals"]),
  entry("zoology", "11", "3 Biomolecules", ["Biomolecules"]),
  entry("zoology", "11", "4 Breathing", ["Breathing and Exchange of Gases"]),
  entry("zoology", "11", "5 Circulation", ["Body Fluids and Circulation"]),
  entry("zoology", "11", "6 Excretion", ["Excretory Products and Their Elimination"]),
  entry("zoology", "11", "7 Locomotion and Movement", ["Locomotion and Movement"]),
  entry("zoology", "11", "8 Neural", ["Neural Control and Coordination"]),
  entry("zoology", "11", "9 Chemical coordination", ["Chemical Coordination and Integration"]),
  entry("zoology", "12", "10 Human Reproduction", ["Human Reproduction"]),
  entry("zoology", "12", "11 Reproductive Health", ["Reproductive Health"]),
  entry("zoology", "12", "12 Evolution", ["Evolution"]),
  entry("zoology", "12", "13 Human health & diseases", ["Human Health and Disease"]),
  entry("zoology", "12", "14 Biotechnology principle & processes", ["Biotechnology: Principles and Processes"]),
  entry("zoology", "12", "15 Biotechnology & applications", ["Biotechnology and Its Applications"]),
];

export function normalizeSubject(subject: string): NeetSubject | null {
  const normalized = normalizeKey(subject);
  const slug = SLUG_BY_SUBJECT[normalized] as NeetSubjectSlug | undefined;
  if (slug) return SUBJECT_BY_SLUG[slug];
  return SUBJECT_DISPLAY_NAMES.find((name) => normalizeKey(name) === normalized) ?? null;
}

export function subjectToSlug(subject: string): NeetSubjectSlug | null {
  const display = normalizeSubject(subject);
  if (!display) return null;
  return SLUG_BY_SUBJECT[normalizeKey(display)] ?? null;
}

export function normalizeKey(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(?:chapter|ch|class|std|standard)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasKeys(entry: ChapterEntry) {
  return [entry.chapter, ...entry.aliases].map(normalizeKey).filter(Boolean);
}

export function canonicalizeChapter(subject: string, rawName: string | null | undefined): ChapterEntry | null {
  if (!rawName) return null;
  const normalizedSubject = normalizeSubject(subject);
  if (!normalizedSubject) return null;
  const key = normalizeKey(rawName);
  if (!key) return null;

  const candidates = CHAPTERS.filter((entry) => entry.subject === normalizedSubject);
  const exact = candidates.find((entry) => aliasKeys(entry).includes(key));
  if (exact) return exact;

  return (
    candidates.find((entry) => aliasKeys(entry).some((alias) => alias.includes(key) || key.includes(alias))) ??
    null
  );
}
