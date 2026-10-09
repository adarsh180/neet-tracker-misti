/**
 * NEET PG paper facts (NBEMS, 2026 cycle as reported): 180 MCQs, 720 marks,
 * +4/−1, five timed sections of 36, 3.5 hours. The syllabus itself — 19
 * subjects with chapters, topics and subtopics — lives in the database
 * (exam_nodes) so every level can be edited. Subject weights there are the
 * long-used indicative relative weights (pre-clinical 50 · para-clinical 100 ·
 * clinical 180 parts) — planning priors, not guarantees.
 */

export const NEET_PG_PAPER = { questions: 180, marks: 720, sections: 5, minutes: 210, plus: 4, minus: 1 };

/**
 * NEET PG 2025 marks vs rank (Careers360 / published analyses), stored as a
 * share of maximum marks so it survives the 800 → 720 change.
 */
export const NEET_PG_RANK_ANCHORS: Array<{ share: number; rank: number }> = [
  { share: 707 / 800, rank: 1 },
  { share: 690 / 800, rank: 11 },
  { share: 678 / 800, rank: 28 },
  { share: 640 / 800, rank: 511 },
  { share: 618 / 800, rank: 1500 },
  { share: 586 / 800, rank: 4606 },
  { share: 555 / 800, rank: 10000 },
  { share: 535 / 800, rank: 14889 },
  { share: 486 / 800, rank: 28856 },
  { share: 427 / 800, rank: 50000 },
  { share: 276 / 800, rank: 130000 },
];

/** AIQ (General) govt closing ranks 2025 — the targets that matter. */
export const NEET_PG_TARGETS = [
  { key: "md-clinical", label: "MD/MS clinical (govt, AIQ)", rank: 18000, note: "MD General Medicine closed ≈ 17,190 · Paediatrics ≈ 18,067" },
  { key: "derm", label: "MD Dermatology (govt)", rank: 15000, note: "closed ≈ 15,146" },
  { key: "radio", label: "MD Radiodiagnosis (govt)", rank: 6500, note: "closed ≈ 6,656" },
];
