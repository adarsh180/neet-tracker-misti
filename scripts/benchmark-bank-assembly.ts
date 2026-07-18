import { assembleQuestionsFromBank, type BankAssemblyAudit } from "../src/lib/question-bank";

type Scenario = Parameters<typeof assembleQuestionsFromBank>[0] & { name: string };

const scenarios: Scenario[] = [
  {
    name: "Full-length NEET mock",
    mode: "FULL_LENGTH",
    subjects: ["physics", "chemistry", "botany", "zoology"],
    questionCount: 180,
    difficulty: "MIXED",
    desiredCount: 180,
    startIndex: 0,
    testSeed: "performance-full-20260718",
  },
  {
    name: "Class 12 sectional",
    mode: "SECTIONAL",
    classLevel: "12",
    subjects: ["physics", "chemistry", "botany", "zoology"],
    questionCount: 180,
    difficulty: "MIXED",
    desiredCount: 180,
    startIndex: 0,
    testSeed: "performance-sectional-20260718",
  },
  {
    name: "Cross-subject custom unit",
    mode: "UNIT",
    classLevel: "11",
    subjects: ["physics", "chemistry", "botany", "zoology"],
    chapters: ["Gravitation", "Atomic Structure", "3 Plant kingdom", "3 Biomolecules"],
    questionCount: 80,
    difficulty: "MIXED",
    desiredCount: 80,
    startIndex: 0,
    testSeed: "performance-unit-20260718",
  },
  {
    name: "Physics multi-chapter test",
    mode: "CHAPTER",
    subject: "physics",
    subjects: ["physics"],
    classLevel: "12",
    chapters: ["Electrostatics", "Current Electricity", "Optics"],
    questionCount: 50,
    difficulty: "MIXED",
    desiredCount: 50,
    startIndex: 0,
    testSeed: "performance-chapter-20260718",
  },
  {
    name: "Smallest chapter safe test",
    mode: "CHAPTER",
    subject: "physics",
    subjects: ["physics"],
    classLevel: "11",
    chapters: ["Properties of Solids and Liquids"],
    questionCount: 10,
    difficulty: "MIXED",
    desiredCount: 10,
    startIndex: 0,
    testSeed: "performance-small-chapter-20260718",
  },
];

async function runScenario(scenario: Scenario) {
  const { name, ...request } = scenario;
  const audit: BankAssemblyAudit = { mode: "", requested: 0, selected: 0, quotas: [], warnings: [] };
  const startedAt = Date.now();
  const rows = await assembleQuestionsFromBank({ ...request, audit });
  return {
    name,
    elapsedMs: Date.now() - startedAt,
    requested: request.desiredCount,
    selected: rows.length,
    counts: Object.fromEntries(
      ["Physics", "Chemistry", "Botany", "Zoology"].map((subject) => [
        subject,
        rows.filter((question) => question.subject === subject).length,
      ]),
    ),
    warnings: audit.warnings,
    passed: rows.length === request.desiredCount,
  };
}

async function main() {
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));
  console.log(JSON.stringify({ targetMs: 30_000, passed: results.every((result) => result.passed && result.elapsedMs <= 30_000), results }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
