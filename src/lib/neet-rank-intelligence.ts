import type { AIContext } from "@/lib/ai-context-builder";

type SubjectName = "Physics" | "Chemistry" | "Botany" | "Zoology";
type Priority = "HIGH" | "MEDIUM" | "LOW";

type ChapterPrior = {
  subject: SubjectName;
  chapter: string;
  aliases?: string[];
  expectedQuestions: number;
  timeCost: 1 | 2 | 3 | 4 | 5;
  scoringEase: 1 | 2 | 3 | 4 | 5;
  volatility: 1 | 2 | 3 | 4 | 5;
  priorityCap?: Priority;
  note: string;
};

export type ChapterRankSignal = {
  subject: SubjectName;
  chapter: string;
  matchedPrior: string;
  expectedQuestions: number;
  expectedMarks: number;
  mastery: number;
  completionPct: number;
  questionDepth: number;
  revisionHealth: number;
  testSignal: number;
  errorPenalty: number;
  roiScore: number;
  damageMarks: number;
  priority: Priority;
  reason: string;
};

export type SubjectRankSignal = {
  subject: SubjectName;
  mastery: number;
  expectedMarks: number;
  maxMarks: number;
  damageMarks: number;
  priority: Priority;
};

export type RankIntelligence = {
  smartScore: number;
  chapterSignals: ChapterRankSignal[];
  subjectSignals: SubjectRankSignal[];
  sourceNotes: string[];
};

const SUBJECT_MAX_MARKS: Record<SubjectName, number> = {
  Physics: 180,
  Chemistry: 180,
  Botany: 180,
  Zoology: 180,
};

const SUBJECT_MAX_QUESTIONS: Record<SubjectName, number> = {
  Physics: 45,
  Chemistry: 45,
  Botany: 45,
  Zoology: 45,
};

export const RANK_INTELLIGENCE_SOURCE_NOTES = [
  "NTA NEET UG 2026 information bulletin: Physics 45Q/180, Chemistry 45Q/180, Biology 90Q/360, total 180Q/720, +4/-1 marking.",
  "NMC UGMEB public notice dated 22-12-2025 finalized the updated NEET UG 2026 syllabus.",
  "Chapter weights are probabilistic PYQ priors, not official guarantees; NTA publishes subject pattern, not chapter-wise future weightage.",
  "PYQ priors blend 2015-2025/2020-2025 public analyses from Super Tutor, Collegedunia, Careers360, Testbook, and Resonance 2016 paper analysis.",
];

const CHAPTER_PRIORS: ChapterPrior[] = [
  // Physics
  { subject: "Physics", chapter: "Physics and Measurement", aliases: ["Units and Measurements", "Units & SI System", "Dimensional Analysis"], expectedQuestions: 2.0, timeCost: 1, scoringEase: 4, volatility: 2, note: "Frequent low-time dimensional-analysis and error questions." },
  { subject: "Physics", chapter: "Kinematics", aliases: ["Motion in a Straight Line", "Motion in a Plane", "Vectors", "Projectile Motion"], expectedQuestions: 2.5, timeCost: 2, scoringEase: 3, volatility: 3, note: "Foundation mechanics; moderate scoring after formula and graph practice." },
  { subject: "Physics", chapter: "Laws of Motion", aliases: ["NLM", "Newton's Laws", "Friction"], expectedQuestions: 2.2, timeCost: 2, scoringEase: 3, volatility: 3, note: "Increasing recent weight; friction and circular-motion applications recur." },
  { subject: "Physics", chapter: "Work, Energy and Power", aliases: ["WEP", "Work Energy Power"], expectedQuestions: 1.8, timeCost: 2, scoringEase: 3, volatility: 3, note: "Reliable mechanics chapter with manageable time demand." },
  { subject: "Physics", chapter: "Rotational Motion", aliases: ["System of Particles and Rotational Motion", "Rotation"], expectedQuestions: 2.0, timeCost: 5, scoringEase: 2, volatility: 4, priorityCap: "MEDIUM", note: "Important but time-heavy; capped at medium priority for time-benefit ratio." },
  { subject: "Physics", chapter: "Gravitation", aliases: ["Universal Law of Gravitation", "Satellites"], expectedQuestions: 2.3, timeCost: 2, scoringEase: 4, volatility: 3, note: "Good ROI formulas with repeated satellite and g-variation patterns." },
  { subject: "Physics", chapter: "Properties of Solids and Liquids", aliases: ["Mechanical Properties of Solids", "Mechanical Properties of Fluids", "Bulk Matter", "Fluids", "Solids"], expectedQuestions: 2.5, timeCost: 3, scoringEase: 3, volatility: 3, note: "Fluid and elasticity questions are regular but split across subtopics." },
  { subject: "Physics", chapter: "Thermodynamics", aliases: ["Thermal Physics", "Heat and Thermodynamics"], expectedQuestions: 2.2, timeCost: 2, scoringEase: 4, volatility: 3, note: "High-return conceptual/formula area when processes are clear." },
  { subject: "Physics", chapter: "Kinetic Theory of Gases", aliases: ["KTG", "Behaviour of Perfect Gas and Kinetic Theory"], expectedQuestions: 1.5, timeCost: 1, scoringEase: 4, volatility: 3, note: "Small chapter, quick marks from RMS speed and degrees of freedom." },
  { subject: "Physics", chapter: "Oscillations and Waves", aliases: ["SHM", "Waves", "Oscillations"], expectedQuestions: 2.5, timeCost: 3, scoringEase: 3, volatility: 3, note: "Moderate yield; formula fluency matters." },
  { subject: "Physics", chapter: "Electrostatics", aliases: ["Electric Charges and Fields", "Electrostatic Potential and Capacitance", "Capacitors"], expectedQuestions: 3.5, timeCost: 3, scoringEase: 3, volatility: 3, note: "High-yield Class 12 block, especially capacitors and fields." },
  { subject: "Physics", chapter: "Current Electricity", aliases: ["Ohm's Law", "Kirchhoff", "Wheatstone Bridge", "Meter Bridge"], expectedQuestions: 3.5, timeCost: 2, scoringEase: 5, volatility: 2, note: "Excellent ROI: recurring 3-4 questions and compact problem types." },
  { subject: "Physics", chapter: "Magnetic Effects of Current and Magnetism", aliases: ["Moving Charges and Magnetism", "Magnetism and Matter"], expectedQuestions: 2.8, timeCost: 3, scoringEase: 3, volatility: 3, note: "Stable medium-high yield from force, field, and materials." },
  { subject: "Physics", chapter: "Electromagnetic Induction and AC", aliases: ["EMI", "Alternating Current", "AC"], expectedQuestions: 3.0, timeCost: 2, scoringEase: 4, volatility: 3, note: "High ROI if Lenz law and AC circuits are drilled." },
  { subject: "Physics", chapter: "Electromagnetic Waves", aliases: ["EM Waves"], expectedQuestions: 1.5, timeCost: 1, scoringEase: 5, volatility: 2, note: "Small, factual, and fast to revise." },
  { subject: "Physics", chapter: "Optics", aliases: ["Ray Optics", "Wave Optics", "Lenses", "YDSE"], expectedQuestions: 3.5, timeCost: 2, scoringEase: 4, volatility: 2, note: "High-yield and comparatively scoring after diagram patterns are mastered." },
  { subject: "Physics", chapter: "Dual Nature of Matter and Radiation", aliases: ["Dual Nature", "Photoelectric Effect"], expectedQuestions: 2.0, timeCost: 1, scoringEase: 5, volatility: 2, note: "Compact modern-physics marks." },
  { subject: "Physics", chapter: "Atoms and Nuclei", aliases: ["Atoms", "Nuclei", "Modern Physics"], expectedQuestions: 2.2, timeCost: 1, scoringEase: 5, volatility: 2, note: "Compact scoring chapter with repeated formulas." },
  { subject: "Physics", chapter: "Electronic Devices", aliases: ["Semiconductors", "Semiconductor Electronics", "Logic Gates"], expectedQuestions: 2.5, timeCost: 1, scoringEase: 5, volatility: 2, note: "Very high ROI: short theory, regular questions." },
  { subject: "Physics", chapter: "Experimental Skills", aliases: ["Practical Physics", "Experiments"], expectedQuestions: 1.0, timeCost: 1, scoringEase: 3, volatility: 4, note: "Useful but uncertain; revise through formula/least-count lists." },

  // Chemistry
  { subject: "Chemistry", chapter: "Some Basic Concepts in Chemistry", aliases: ["Mole Concept", "Stoichiometry"], expectedQuestions: 2.0, timeCost: 2, scoringEase: 4, volatility: 2, note: "Foundational and recurring calculation marks." },
  { subject: "Chemistry", chapter: "Atomic Structure", aliases: ["Structure of Atom", "Quantum Numbers"], expectedQuestions: 1.5, timeCost: 2, scoringEase: 4, volatility: 2, note: "Compact physical chemistry with stable 1-2 questions." },
  { subject: "Chemistry", chapter: "Chemical Bonding and Molecular Structure", aliases: ["Chemical Bonding", "VSEPR", "Hybridization"], expectedQuestions: 3.0, timeCost: 3, scoringEase: 4, volatility: 2, note: "High-yield inorganic foundation; VSEPR and MOT repeat." },
  { subject: "Chemistry", chapter: "Chemical Thermodynamics", aliases: ["Thermodynamics", "Gibbs Energy"], expectedQuestions: 2.0, timeCost: 2, scoringEase: 4, volatility: 2, note: "Good ROI in physical chemistry." },
  { subject: "Chemistry", chapter: "Solutions", aliases: ["Colligative Properties", "Raoult's Law"], expectedQuestions: 1.8, timeCost: 2, scoringEase: 4, volatility: 2, note: "Regular Class 12 physical chemistry marks." },
  { subject: "Chemistry", chapter: "Equilibrium", aliases: ["Ionic Equilibrium", "Chemical Equilibrium", "pH", "Ksp"], expectedQuestions: 2.5, timeCost: 3, scoringEase: 3, volatility: 2, note: "High-yield but needs calculation accuracy." },
  { subject: "Chemistry", chapter: "Redox Reactions and Electrochemistry", aliases: ["Redox", "Electrochemistry", "Nernst"], expectedQuestions: 3.0, timeCost: 3, scoringEase: 3, volatility: 2, note: "Electrochemistry plus redox gives reliable score potential." },
  { subject: "Chemistry", chapter: "Chemical Kinetics", aliases: ["Kinetics", "Rate Law"], expectedQuestions: 2.0, timeCost: 2, scoringEase: 4, volatility: 2, note: "Formula-based and scoring after order/rate practice." },
  { subject: "Chemistry", chapter: "Classification of Elements and Periodicity", aliases: ["Periodicity", "Periodic Table"], expectedQuestions: 1.5, timeCost: 1, scoringEase: 4, volatility: 2, note: "Quick NCERT trend marks." },
  { subject: "Chemistry", chapter: "P-Block Elements", aliases: ["p-Block", "Group 13", "Group 14", "Group 15", "Group 16", "Group 17", "Group 18"], expectedQuestions: 3.0, timeCost: 4, scoringEase: 3, volatility: 3, note: "High weight but memory-heavy; prioritize NCERT lines." },
  { subject: "Chemistry", chapter: "d- and f-Block Elements", aliases: ["d & f Block", "Transition Elements"], expectedQuestions: 2.0, timeCost: 2, scoringEase: 4, volatility: 2, note: "Good inorganic ROI through tables and oxidation states." },
  { subject: "Chemistry", chapter: "Coordination Compounds", aliases: ["Coordination", "CFT", "Isomerism"], expectedQuestions: 2.5, timeCost: 2, scoringEase: 4, volatility: 2, note: "High-return and consistent in recent papers." },
  { subject: "Chemistry", chapter: "Purification and Characterisation of Organic Compounds", aliases: ["Purification", "Qualitative Analysis"], expectedQuestions: 0.8, timeCost: 1, scoringEase: 3, volatility: 4, note: "Low but quick practical/theory marks." },
  { subject: "Chemistry", chapter: "Some Basic Principles of Organic Chemistry", aliases: ["GOC", "Organic Chemistry Basic Principles", "IUPAC", "Isomerism"], expectedQuestions: 2.5, timeCost: 3, scoringEase: 4, volatility: 2, note: "Organic foundation; weakness here damages all organic chapters." },
  { subject: "Chemistry", chapter: "Hydrocarbons", aliases: ["Alkanes", "Alkenes", "Alkynes", "Benzene"], expectedQuestions: 2.5, timeCost: 2, scoringEase: 4, volatility: 2, note: "Reliable organic scoring block." },
  { subject: "Chemistry", chapter: "Organic Compounds Containing Halogens", aliases: ["Haloalkanes", "Haloarenes", "Halogens"], expectedQuestions: 1.5, timeCost: 2, scoringEase: 3, volatility: 3, note: "Moderate but mechanism-linked." },
  { subject: "Chemistry", chapter: "Organic Compounds Containing Oxygen", aliases: ["Alcohols", "Phenols", "Ethers", "Aldehydes", "Ketones", "Carboxylic Acids", "Carbonyl"], expectedQuestions: 3.5, timeCost: 3, scoringEase: 4, volatility: 2, note: "One of the highest-yield organic blocks." },
  { subject: "Chemistry", chapter: "Organic Compounds Containing Nitrogen", aliases: ["Amines", "Diazonium"], expectedQuestions: 1.7, timeCost: 2, scoringEase: 4, volatility: 2, note: "Compact Class 12 organic marks." },
  { subject: "Chemistry", chapter: "Biomolecules", aliases: ["Carbohydrates", "Proteins", "Nucleic Acids"], expectedQuestions: 1.5, timeCost: 1, scoringEase: 5, volatility: 2, note: "Short and NCERT-scoring." },
  { subject: "Chemistry", chapter: "Principles Related to Practical Chemistry", aliases: ["Practical Chemistry", "Salt Analysis", "Titration"], expectedQuestions: 1.2, timeCost: 1, scoringEase: 3, volatility: 4, note: "Small but useful for final polishing." },

  // Botany
  { subject: "Botany", chapter: "Diversity in Living World (Plant Portion)", aliases: ["Living World", "Biological Classification", "Plant Kingdom"], expectedQuestions: 4.0, timeCost: 3, scoringEase: 4, volatility: 2, note: "NCERT factual repetition from classification and plant kingdom." },
  { subject: "Botany", chapter: "Structural Organisation in Plants", aliases: ["Morphology of Flowering Plants", "Anatomy of Flowering Plants"], expectedQuestions: 4.5, timeCost: 3, scoringEase: 4, volatility: 2, note: "High biology ROI through diagrams and NCERT examples." },
  { subject: "Botany", chapter: "Cell Structure and Function (Plant Focus)", aliases: ["Cell The Unit of Life", "Cell Cycle", "Biomolecules"], expectedQuestions: 5.0, timeCost: 3, scoringEase: 4, volatility: 2, note: "Cell and biomolecules are repeatedly tested." },
  { subject: "Botany", chapter: "Plant Physiology - Transport", aliases: ["Transport in Plants", "Mineral Nutrition"], expectedQuestions: 2.5, timeCost: 2, scoringEase: 4, volatility: 3, note: "Medium yield, mostly NCERT concept lines." },
  { subject: "Botany", chapter: "Plant Physiology - Photosynthesis", aliases: ["Photosynthesis", "C3", "C4"], expectedQuestions: 3.0, timeCost: 2, scoringEase: 4, volatility: 2, note: "Consistent, scoring plant physiology." },
  { subject: "Botany", chapter: "Plant Physiology - Respiration & Growth", aliases: ["Respiration in Plants", "Plant Growth", "Plant Hormones"], expectedQuestions: 4.0, timeCost: 2, scoringEase: 4, volatility: 2, note: "Growth regulators and respiration recur." },
  { subject: "Botany", chapter: "Reproduction in Plants", aliases: ["Sexual Reproduction in Flowering Plants", "Pollination", "Double Fertilization"], expectedQuestions: 4.5, timeCost: 2, scoringEase: 5, volatility: 2, note: "High ROI, diagram and event sequence based." },
  { subject: "Botany", chapter: "Genetics (Plant Portion)", aliases: ["Principles of Inheritance", "Mendelian Genetics", "Molecular Basis of Inheritance"], expectedQuestions: 6.0, timeCost: 4, scoringEase: 3, volatility: 2, note: "Very high weight, but needs practice and accuracy." },
  { subject: "Botany", chapter: "Biotechnology (Plant Applications)", aliases: ["Biotechnology", "Bt Crops", "Tissue Culture"], expectedQuestions: 3.5, timeCost: 2, scoringEase: 5, volatility: 2, note: "Compact and high scoring from NCERT." },
  { subject: "Botany", chapter: "Ecology (Plant Focus)", aliases: ["Ecology", "Ecosystem", "Biodiversity", "Succession"], expectedQuestions: 7.0, timeCost: 3, scoringEase: 5, volatility: 2, note: "High biology ROI; NCERT repetition is strong." },

  // Zoology
  { subject: "Zoology", chapter: "Diversity in Living World (Animal Portion)", aliases: ["Animal Kingdom", "Chordates", "Non-Chordates"], expectedQuestions: 5.0, timeCost: 3, scoringEase: 4, volatility: 2, note: "Animal kingdom is consistently high-yield." },
  { subject: "Zoology", chapter: "Structural Organisation in Animals", aliases: ["Animal Tissues", "Cockroach", "Frog"], expectedQuestions: 4.0, timeCost: 2, scoringEase: 5, volatility: 2, note: "Compact NCERT fact and diagram scoring." },
  { subject: "Zoology", chapter: "Human Physiology - Digestion", aliases: ["Digestion and Absorption"], expectedQuestions: 1.5, timeCost: 1, scoringEase: 4, volatility: 3, note: "Small physiology unit; enzymes are quick marks." },
  { subject: "Zoology", chapter: "Human Physiology - Breathing", aliases: ["Breathing and Exchange of Gases"], expectedQuestions: 1.5, timeCost: 1, scoringEase: 4, volatility: 3, note: "Compact physiology chapter." },
  { subject: "Zoology", chapter: "Human Physiology - Circulation", aliases: ["Body Fluids and Circulation"], expectedQuestions: 1.5, timeCost: 2, scoringEase: 4, volatility: 3, note: "Cardiac cycle and blood groups recur." },
  { subject: "Zoology", chapter: "Human Physiology - Excretion", aliases: ["Excretory Products and Their Elimination"], expectedQuestions: 1.5, timeCost: 2, scoringEase: 4, volatility: 3, note: "Manageable but detail-sensitive." },
  { subject: "Zoology", chapter: "Human Physiology - Neural & Endocrine", aliases: ["Neural Control", "Chemical Coordination", "Endocrine"], expectedQuestions: 3.5, timeCost: 3, scoringEase: 4, volatility: 2, note: "High-yield physiology block." },
  { subject: "Zoology", chapter: "Locomotion and Movement", aliases: ["Locomotion", "Movement"], expectedQuestions: 2.5, timeCost: 2, scoringEase: 4, volatility: 2, note: "Often compact and scoring." },
  { subject: "Zoology", chapter: "Human Reproduction", aliases: ["Reproduction", "Gametogenesis", "Menstrual Cycle"], expectedQuestions: 3.5, timeCost: 2, scoringEase: 5, volatility: 2, note: "High ROI NCERT chapter." },
  { subject: "Zoology", chapter: "Reproductive Health", aliases: ["Contraception", "ART", "STDs"], expectedQuestions: 2.5, timeCost: 1, scoringEase: 5, volatility: 2, note: "Short and very scoring." },
  { subject: "Zoology", chapter: "Genetics and Evolution", aliases: ["Molecular Basis of Inheritance", "Evolution", "Lac Operon", "Hardy-Weinberg"], expectedQuestions: 7.0, timeCost: 4, scoringEase: 3, volatility: 2, note: "Very high weight; practice needed for genetic code and pedigree-style logic." },
  { subject: "Zoology", chapter: "Biology in Human Welfare", aliases: ["Human Health and Disease", "Microbes in Human Welfare", "Immunity"], expectedQuestions: 4.0, timeCost: 2, scoringEase: 5, volatility: 2, note: "High ROI NCERT factual block." },
  { subject: "Zoology", chapter: "Biotechnology (Human Focus)", aliases: ["Biotechnology Principles", "Biotechnology Applications", "Gene Therapy"], expectedQuestions: 3.5, timeCost: 2, scoringEase: 5, volatility: 2, note: "Compact, repeated NCERT lines." },
  { subject: "Zoology", chapter: "Ecology (Animal & Human Impact)", aliases: ["Organisms and Populations", "Environmental Issues", "Biodiversity"], expectedQuestions: 4.5, timeCost: 2, scoringEase: 5, volatility: 2, note: "High ROI ecology and environment block." },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 1));
}

function similarity(a: string, b: string) {
  const aNorm = normalizeText(a);
  const bNorm = normalizeText(b);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.88;

  const aTokens = tokenSet(aNorm);
  const bTokens = tokenSet(bNorm);
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return intersection / union;
}

function matchPrior(subject: SubjectName, chapter: string) {
  const candidates = CHAPTER_PRIORS.filter((prior) => prior.subject === subject);
  let best = candidates[0];
  let bestScore = 0;

  for (const prior of candidates) {
    const names = [prior.chapter, ...(prior.aliases || [])];
    const score = Math.max(...names.map((name) => similarity(chapter, name)));
    if (score > bestScore) {
      best = prior;
      bestScore = score;
    }
  }

  return bestScore >= 0.34 ? best : null;
}

function weightedAverage(items: { value: number; weight: number }[]) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function reliabilityWeight(level: string | null | undefined) {
  if (level === "HIGH") return 1.15;
  if (level === "LOW") return 0.7;
  return 1;
}

function sectionScoreForSubject(test: AIContext["recentTests"][number], subject: SubjectName) {
  const score = {
    Physics: test.physicsScore,
    Chemistry: test.chemistryScore,
    Botany: test.botanyScore,
    Zoology: test.zoologyScore,
  }[subject];

  if (score === null || score === undefined) return null;
  return clamp((score / SUBJECT_MAX_MARKS[subject]) * 100, 0, 100);
}

function getSubjectTestSignal(context: AIContext, subject: SubjectName) {
  const directTests = context.recentTests.filter((test) => test.subjectName === subject);
  if (directTests.length) {
    return weightedAverage(directTests.map((test, index) => ({
      value: clamp(test.percentage, 0, 100),
      weight: Math.max(1, 10 - index) * reliabilityWeight(test.reliabilityLevel),
    })));
  }

  const fullLikeTests = context.recentTests.filter((test) => !test.subjectName || test.maxScore >= 500);
  if (!fullLikeTests.length) return 0;
  return weightedAverage(fullLikeTests.map((test, index) => ({
    value: sectionScoreForSubject(test, subject) ?? clamp(test.percentage, 0, 100) * 0.65,
    weight: Math.max(1, 7 - index) * reliabilityWeight(test.reliabilityLevel),
  })));
}

function getChapterErrorPenalty(context: AIContext, subject: SubjectName, chapter: string) {
  const detailedErrors = context.errorTopicAnalysis || [];
  const matchedDetailed = detailedErrors.filter((error) => {
    if (error.subject !== subject) return false;
    const haystack = `${error.chapter || ""} ${error.topic || ""} ${error.notes || ""}`;
    return similarity(haystack, chapter) >= 0.22;
  });

  const detailedPenalty = matchedDetailed.reduce(
    (sum, error) => sum + error.frequency * 3 + error.wrong * 2 + error.notStudied * 4 + error.skipped,
    0
  );
  const subjectPenalty = (context.errorAnalysis || [])
    .filter((error) => error.subject === subject)
    .reduce((sum, error) => sum + error.frequency * 0.35, 0);

  return clamp(detailedPenalty + subjectPenalty, 0, 24);
}

function priorityFromDamage(damageMarks: number, roiScore: number, mastery: number, cap?: Priority): Priority {
  let priority: Priority =
    damageMarks >= 9 || (damageMarks >= 6 && roiScore >= 1.25) || (mastery < 45 && damageMarks >= 5)
      ? "HIGH"
      : damageMarks >= 3.5 || roiScore >= 1.4
        ? "MEDIUM"
        : "LOW";

  if (cap === "MEDIUM" && priority === "HIGH") priority = "MEDIUM";
  if (cap === "LOW" && priority !== "LOW") priority = "LOW";
  return priority;
}

function scaleExpectedQuestions(subject: SubjectName, expectedQuestions: number) {
  const totalForSubject = CHAPTER_PRIORS
    .filter((prior) => prior.subject === subject)
    .reduce((sum, prior) => sum + prior.expectedQuestions, 0);
  return expectedQuestions * (SUBJECT_MAX_QUESTIONS[subject] / Math.max(totalForSubject, 1));
}

export function buildChapterRankIntelligence(context: AIContext): RankIntelligence {
  const chapterSignals: ChapterRankSignal[] = [];

  for (const subject of context.subjects) {
    const subjectName = subject.name as SubjectName;
    if (!SUBJECT_MAX_MARKS[subjectName]) continue;

    const testSignal = getSubjectTestSignal(context, subjectName);
    const neutralQuestionWeight = SUBJECT_MAX_QUESTIONS[subjectName] / Math.max(subject.chapters.length, 1);

    for (const chapter of subject.chapters) {
      const prior = matchPrior(subjectName, chapter.name);
      const rawExpectedQuestions = prior?.expectedQuestions ?? neutralQuestionWeight;
      const expectedQuestions = scaleExpectedQuestions(subjectName, rawExpectedQuestions);
      const expectedMarks = expectedQuestions * 4;
      const completionPct = chapter.total ? (chapter.completed / chapter.total) * 100 : 0;
      const questionsPerTopic = chapter.total ? chapter.questionsSolved / chapter.total : 0;
      const questionDepth = clamp((questionsPerTopic / 80) * 100, 0, 100);
      const revisionHealth = chapter.completed
        ? clamp((chapter.revisions / Math.max(chapter.completed, 1)) * 85 + (chapter.revisions > 0 ? 15 : 0), 0, 100)
        : 0;
      const scoringEase = prior ? prior.scoringEase * 20 : 60;
      const errorPenalty = getChapterErrorPenalty(context, subjectName, chapter.name);

      const mastery = Math.round(clamp(
        completionPct * 0.4 +
        questionDepth * 0.18 +
        revisionHealth * 0.15 +
        testSignal * 0.2 +
        scoringEase * 0.07 -
        errorPenalty,
        0,
        100
      ));
      const targetMastery = prior?.subject === "Physics" ? 86 : 90;
      const damageMarks = Number((expectedMarks * clamp((targetMastery - mastery) / 100, 0, 1)).toFixed(1));
      const roiScore = Number(((expectedQuestions * ((prior?.scoringEase ?? 3) / 3)) / Math.max(prior?.timeCost ?? 3, 1)).toFixed(2));
      const priority = priorityFromDamage(damageMarks, roiScore, mastery, prior?.priorityCap);

      chapterSignals.push({
        subject: subjectName,
        chapter: chapter.name,
        matchedPrior: prior?.chapter ?? "neutral",
        expectedQuestions: Number(expectedQuestions.toFixed(2)),
        expectedMarks: Number(expectedMarks.toFixed(1)),
        mastery,
        completionPct: Math.round(completionPct),
        questionDepth: Math.round(questionDepth),
        revisionHealth: Math.round(revisionHealth),
        testSignal: Math.round(testSignal),
        errorPenalty: Math.round(errorPenalty),
        roiScore,
        damageMarks,
        priority,
        reason: prior?.note ?? "Neutral estimate because no close PYQ-prior chapter match was found.",
      });
    }
  }

  const subjectSignals = (Object.keys(SUBJECT_MAX_MARKS) as SubjectName[]).map((subject) => {
    const signals = chapterSignals.filter((signal) => signal.subject === subject);
    const expectedMarks = signals.reduce((sum, signal) => sum + signal.expectedMarks * (signal.mastery / 100), 0);
    const totalPotential = signals.reduce((sum, signal) => sum + signal.expectedMarks, 0) || SUBJECT_MAX_MARKS[subject];
    const scaledExpectedMarks = expectedMarks * (SUBJECT_MAX_MARKS[subject] / totalPotential);
    const damageMarks = signals.reduce((sum, signal) => sum + signal.damageMarks, 0);
    const mastery = Math.round(clamp((scaledExpectedMarks / SUBJECT_MAX_MARKS[subject]) * 100, 0, 100));
    const highCount = signals.filter((signal) => signal.priority === "HIGH").length;
    const priority: Priority = highCount >= 2 || damageMarks >= 28 ? "HIGH" : damageMarks >= 14 ? "MEDIUM" : "LOW";

    return {
      subject,
      mastery,
      expectedMarks: Math.round(clamp(scaledExpectedMarks, 0, SUBJECT_MAX_MARKS[subject])),
      maxMarks: SUBJECT_MAX_MARKS[subject],
      damageMarks: Math.round(damageMarks),
      priority,
    };
  });

  return {
    smartScore: subjectSignals.reduce((sum, signal) => sum + signal.expectedMarks, 0),
    chapterSignals: chapterSignals.sort((a, b) => {
      if (b.damageMarks !== a.damageMarks) return b.damageMarks - a.damageMarks;
      return b.roiScore - a.roiScore;
    }),
    subjectSignals,
    sourceNotes: RANK_INTELLIGENCE_SOURCE_NOTES,
  };
}

export function getRankIntelligencePromptSummary(intelligence: RankIntelligence) {
  return {
    sourcePolicy: "Use chapter priors as probabilistic PYQ/ROI signals only. Full-length mock scores still dominate final rank confidence.",
    sourceNotes: intelligence.sourceNotes,
    smartScore: Math.round(intelligence.smartScore),
    subjectSignals: intelligence.subjectSignals,
    highImpactChapters: intelligence.chapterSignals
      .filter((signal) => signal.priority === "HIGH")
      .slice(0, 10),
    bestRoiWeakChapters: intelligence.chapterSignals
      .filter((signal) => signal.mastery < 75)
      .sort((a, b) => b.roiScore - a.roiScore || b.damageMarks - a.damageMarks)
      .slice(0, 10),
    rotationPolicy: "Rotational Motion is intentionally capped at MEDIUM priority unless manually overridden, because its time cost is high relative to expected question count.",
  };
}
