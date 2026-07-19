import { assembleQuestionsFromBank, type BankAssemblyRequest } from "../src/lib/question-bank";
import { db } from "../src/lib/db";

const base = { questionCount: 50, difficulty: "MIXED", desiredCount: 50, startIndex: 0 } as const;
const scenarios: Array<BankAssemblyRequest & { name: string }> = [
  { ...base, name: "Dual Nature chapter", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "12", chapters: ["Dual Nature of Matter and Radiation"], testSeed: "promoted-dual" },
  { ...base, name: "Chemical Kinetics chapter", mode: "CHAPTER", subject: "chemistry", subjects: ["chemistry"], classLevel: "12", chapters: ["Chemical Kinetics"], testSeed: "promoted-kinetics" },
  { ...base, name: "Solutions chapter", mode: "CHAPTER", subject: "chemistry", subjects: ["chemistry"], classLevel: "12", chapters: ["Solutions"], testSeed: "promoted-solutions" },
  { ...base, name: "Chemical Bonding chapter", mode: "CHAPTER", subject: "chemistry", subjects: ["chemistry"], classLevel: "11", chapters: ["Chemical Bonding and Molecular Structure"], testSeed: "promoted-bonding" },
  { ...base, name: "Animal Kingdom chapter", mode: "CHAPTER", subject: "zoology", subjects: ["zoology"], classLevel: "11", chapters: ["1 Animal kingdom"], testSeed: "promoted-animal-kingdom" },
  { ...base, name: "One-dimensional motion chapter", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "11", chapters: ["1D"], testSeed: "promoted-1d" },
  { ...base, name: "Kinematics chapter", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "11", chapters: ["Kinematics"], testSeed: "promoted-kinematics" },
  { ...base, name: "Properties of Solids and Liquids chapter", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "11", chapters: ["Properties of Solids and Liquids"], testSeed: "promoted-solids-liquids" },
  { ...base, name: "Thermodynamics chapter", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "11", chapters: ["Thermodynamics"], testSeed: "promoted-thermodynamics" },
  { ...base, name: "Work Energy and Power chapter", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "11", chapters: ["Work, Energy and Power"], testSeed: "promoted-work-energy" },
  { ...base, name: "Experimental Skills class 11", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "11", chapters: ["Experimental Skills"], testSeed: "promoted-experimental-11" },
  { ...base, name: "Experimental Skills class 12", mode: "CHAPTER", subject: "physics", subjects: ["physics"], classLevel: "12", chapters: ["Experimental Skills"], testSeed: "promoted-experimental-12" },
];

async function main() {
  const results = [];
  for (const scenario of scenarios) {
    const startedAt = Date.now();
    const questions = await assembleQuestionsFromBank({
      ...scenario,
    });
    const bankIds = questions.map((question) => question.bankId).filter((id): id is string => Boolean(id));
    const bankRows = bankIds.length
      ? await db.bankQuestion.findMany({
          where: { id: { in: bankIds } },
          select: { id: true, duplicateClusterId: true },
        })
      : [];
    const clusters = bankRows.map((row) => row.duplicateClusterId).filter((id): id is string => Boolean(id));
    const hasUniqueClusters = new Set(clusters).size === clusters.length;
    results.push({
      name: scenario.name,
      count: questions.length,
      promotedAiRows: questions.filter((question) => question.source === "AI").length,
      allStrictlyVerified: questions.every((question) => question.verified),
      hasUniqueClusters,
      elapsedMs: Date.now() - startedAt,
      passed: questions.length === 50 && questions.every((question) => question.verified) && hasUniqueClusters,
    });
  }
  console.log(JSON.stringify({ passed: results.every((result) => result.passed), results }, null, 2));
  if (!results.every((result) => result.passed)) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
