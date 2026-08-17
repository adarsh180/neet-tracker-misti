import { CHAPTERS } from "./neet-chapters";

export const NEET_2026_SYLLABUS_SOURCE = {
  slug: "neet-ug-2026-official",
  exam: "NEET_UG",
  examYear: 2026,
  title: "Syllabus for NEET (UG) - 2026",
  publishedOn: "2025-12-22",
  sourceUrl: "https://www.nmc.org.in/MCIRest/open/getDocument?path=%2FDocuments%2FPublic%2FPortal%2FLatestNews%2FPublic+Notice_NEET_removed.pdf",
  sha256: "39dbf78828116ebfe5cf7d1063b28db6b72148156d5364ba7a7381afeed4d750",
  authority: "National Medical Commission, Undergraduate Medical Education Board",
} as const;

export const NEET_2026_UNITS = {
  Physics: [
    "Physics and Measurement", "Kinematics", "Laws of Motion", "Work, Energy, and Power",
    "Rotational Motion", "Gravitation", "Properties of Solids and Liquids", "Thermodynamics",
    "Kinetic Theory of Gases", "Oscillations and Waves", "Electrostatics", "Current Electricity",
    "Magnetic Effects of Current and Magnetism", "Electromagnetic Induction and Alternating Currents",
    "Electromagnetic Waves", "Optics", "Dual Nature of Matter and Radiation", "Atoms and Nuclei",
    "Electronic Devices", "Experimental Skills",
  ],
  Chemistry: [
    "Some Basic Concepts in Chemistry", "Atomic Structure", "Chemical Bonding and Molecular Structure",
    "Chemical Thermodynamics", "Solutions", "Equilibrium", "Redox Reactions and Electrochemistry",
    "Chemical Kinetics", "Classification of Elements and Periodicity in Properties", "P-Block Elements",
    "d- and f-Block Elements", "Coordination Compounds", "Purification and Characterisation of Organic Compounds",
    "Some Basic Principles of Organic Chemistry", "Hydrocarbons", "Organic Compounds Containing Halogens",
    "Organic Compounds Containing Oxygen", "Organic Compounds Containing Nitrogen", "Biomolecules",
    "Principles Related to Practical Chemistry",
  ],
  Biology: [
    "Diversity in Living World", "Structural Organisation in Animals and Plants", "Cell Structure and Function",
    "Plant Physiology", "Human Physiology", "Reproduction", "Genetics and Evolution",
    "Biology and Human Welfare", "Biotechnology and Its Applications", "Ecology and Environment",
  ],
} as const;

// These are the app's finer-grained serving chapters. Every entry is mapped under
// an active 2026 unit; deleted textbook material is intentionally absent.
export const CURRENT_NEET_CHAPTERS = CHAPTERS;

export function isCurrentNeetChapter(subject: string, classLevel: string, chapter: string) {
  return CURRENT_NEET_CHAPTERS.some((entry) =>
    entry.slug === subject.toLowerCase() && entry.classLevel === classLevel && entry.chapter === chapter,
  );
}

