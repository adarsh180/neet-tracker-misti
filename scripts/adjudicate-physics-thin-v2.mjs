import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/physics-pdf-stage/physics-pdf-bank-ready.json");
const OUTPUT = path.join(ROOT, "data/pdf-admission-audit/adjudicated-physics-thin-v2.json");

const decisions = [
  {
    sourceFile: "kattar/Thermodynamics  Kattar NEET 2026  Physics by MR Sir.pdf",
    questionNumber: 36,
    explanation: "Using the first law with work done by the gas, $dQ=dU+dW$. Since $dW=0$, we have $dU=dQ<0$. For an ideal gas, internal energy depends only on temperature, $U=n(f/2)RT$. Therefore a decrease in internal energy means the gas temperature decreases.",
    optionExplanations: ["Correct. $dU=dQ<0$, and ideal-gas internal energy is proportional to temperature.", "Incorrect. Zero work does not by itself require the volume to increase.", "Incorrect. The given information does not impose constant pressure.", "Incorrect. A temperature increase would require $dU>0$, contrary to $dQ=dU<0$."],
  },
  {
    sourceFile: "kattar/Thermodynamics  Kattar NEET 2026  Physics by MR Sir.pdf",
    questionNumber: 46,
    explanation: "At constant pressure, $W=p\\Delta V=nR\\Delta T=10\\,\\text{J}$. A rigid diatomic gas has $C_p=7R/2$. Hence $Q=nC_p\\Delta T=(7/2)nR\\Delta T=(7/2)W=35\\,\\text{J}$.",
    optionExplanations: ["Incorrect. $25\\,\\text{J}$ would correspond to using $C_v=5R/2$, but heat is supplied at constant pressure.", "Correct. $Q=(C_p/R)W=(7/2)(10)=35\\,\\text{J}$.", "Incorrect. The constant-pressure molar heat capacity of a rigid diatomic gas gives $35\\,\\text{J}$, not $30\\,\\text{J}$.", "Incorrect. This value does not follow from $C_p=7R/2$ and $W=nR\\Delta T=10\\,\\text{J}$."],
  },
  {
    sourceFile: "kattar/Mechanical Properties of Solids  Kattar NEET 2026  Physics by MR Sir.pdf",
    questionNumber: 54,
    explanation: "The maximum load before breaking is $F_b=\\sigma_b A$, where $\\sigma_b$ is the breaking stress of the material and $A$ is the wire's cross-sectional area. Reducing only the wire's length to half changes neither $A$ nor the material breaking stress. Therefore the maximum breaking load remains unchanged.",
    optionExplanations: ["Incorrect. Halving length does not double either cross-sectional area or breaking stress.", "Incorrect. Breaking load is not directly proportional to wire length.", "Incorrect. No factor of four arises because the cross-sectional area is unchanged.", "Correct. $F_b=\\sigma_bA$ is unchanged when only the length is halved."],
  },
];

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const accepted = [];
const missing = [];
for (const decision of decisions) {
  const row = rows.find((candidate) => candidate.trendMetaJson?.sourceFile === decision.sourceFile && candidate.trendMetaJson?.questionNo === decision.questionNumber);
  if (!row) {
    missing.push({ sourceFile: decision.sourceFile, questionNumber: decision.questionNumber });
    continue;
  }
  accepted.push({
    ...row,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    verifierRuns: [{
      verifier: "CODEX_ACADEMIC_ADJUDICATION",
      version: "physics-thin-v2",
      checks: ["source_question_page_visual_match", "source_answer_key_visual_match", "source_solution_visual_match", "independent_calculation", "option_rationales"],
      passed: true,
    }],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
      sourceFile: decision.sourceFile,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber: decision.questionNumber,
      solutionOrigin: "SOURCE_VERIFIED_AND_INDEPENDENTLY_DERIVED",
      academicAdjudicationVersion: "physics-thin-v2",
    },
  });
}

await fs.writeFile(OUTPUT, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.length, accepted: accepted.length, missing }, null, 2));
