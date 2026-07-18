export const NEET_FULL_TEST_QUESTIONS = 180;
export const NEET_FULL_TEST_DURATION_MINUTES = 180;
export const NEET_MAX_PRACTICE_DURATION_MINUTES = 180;

export const NEET_FULL_SUBJECT_COUNTS = {
  Physics: 45,
  Chemistry: 45,
  Botany: 45,
  Zoology: 45,
} as const;

export const NEET_FULL_SUBJECTS = Object.keys(NEET_FULL_SUBJECT_COUNTS) as Array<keyof typeof NEET_FULL_SUBJECT_COUNTS>;
