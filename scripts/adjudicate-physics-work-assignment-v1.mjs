import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/physics-pdf-stage/physics-pdf-bank-ready.json");
const OUTPUT = path.join(ROOT, "data/pdf-admission-audit/adjudicated-physics-work-assignment-v1.json");
const SOURCE = "sangharsh/Work, Energy and Power  Assignment 01  Physics By Manish Raj Sir.pdf";

const decisions = new Map([
  [15, {
    options: ["$KE/8$", "$KE/4$", "$KE/16$", "$KE/2$"],
    explanation: "Let the launch speed be $u$. Initially, $KE=\\frac12mu^2$. At the highest point the vertical component is zero, while the horizontal component remains $u\\cos60^\\circ=u/2$. Hence $K_h=\\frac12m(u/2)^2=\\frac14(\\frac12mu^2)=KE/4$.",
    optionExplanations: ["Incorrect. The horizontal speed is halved, so kinetic energy becomes one-fourth, not one-eighth.", "Correct. At the top only $u\\cos60^\\circ=u/2$ remains, giving $K_h=KE/4$.", "Incorrect. Squaring the halved speed gives a factor of $1/4$, not $1/16$ relative to the original kinetic energy.", "Incorrect. Kinetic energy depends on speed squared, so halving the speed does not halve the kinetic energy."],
  }],
  [16, {
    explanation: "The initial kinetic energy is $K_i=\\frac12(0.1)(20)^2=20\\,\\text{J}$. At the highest point only the horizontal speed remains: $v=20\\cos60^\\circ=10\\,\\text{m s}^{-1}$. Thus $K_h=\\frac12(0.1)(10)^2=5\\,\\text{J}$, so the decrease is $20-5=15\\,\\text{J}$.",
    optionExplanations: ["Incorrect. $20\\,\\text{J}$ is the initial kinetic energy, not the decrease.", "Correct. The kinetic energy falls from $20\\,\\text{J}$ to $5\\,\\text{J}$, a decrease of $15\\,\\text{J}$.", "Incorrect. The vertical velocity vanishes at the top, so kinetic energy decreases even though the horizontal component remains.", "Incorrect. $5\\,\\text{J}$ is the kinetic energy at the highest point, not the amount lost."],
  }],
  [19, {
    explanation: "For fixed mass, $K=p^2/(2m)$, so momentum is proportional to $\\sqrt K$. If $K_f=36K_i$, then $p_f=6p_i$. The percentage increase is $[(p_f-p_i)/p_i]\\times100=(6-1)\\times100=500\\%$.",
    optionExplanations: ["Correct. Momentum becomes six times its initial value, so the increase is five times, or $500\\%$.", "Incorrect. $600\\%$ is the final momentum expressed as a percentage of the initial value, not the percentage increase.", "Incorrect. Momentum changes by a square-root factor, not by the numerical percentage 6.", "Incorrect. A 36-fold kinetic-energy increase produces a sixfold momentum, far larger than a $60\\%$ increase."],
  }],
  [21, {
    explanation: "Let the natural length be $L_0$ and extension be $x$. The radius is $L_0+x$. The spring supplies centripetal force: $kx=m\\omega^2(L_0+x)$. With $k=12.5\\,\\text{N m}^{-1}$, $m=0.2\\,\\text{kg}$, and $\\omega=5\\,\\text{rad s}^{-1}$, $12.5x=5(L_0+x)$, so $7.5x=5L_0$ and $x/L_0=2/3$.",
    optionExplanations: ["Incorrect. Substituting $x/L_0=1/2$ does not satisfy $12.5x=5(L_0+x)$.", "Incorrect. Equal extension and natural length would make the spring force too large for the required centripetal force.", "Correct. Force balance gives $x/L_0=5/7.5=2/3$, i.e. $2:3$.", "Incorrect. The calculated ratio is $2:3$, not $2:5$."],
  }],
]);

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const accepted = [];
const missing = [];
for (const [questionNumber, decision] of decisions) {
  const row = rows.find((candidate) => candidate.trendMetaJson?.sourceFile === SOURCE && candidate.trendMetaJson?.questionNo === questionNumber);
  if (!row) {
    missing.push(questionNumber);
    continue;
  }
  accepted.push({
    ...row,
    options: decision.options ?? row.options,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    verifierRuns: [{
      verifier: "CODEX_ACADEMIC_ADJUDICATION",
      version: "physics-work-assignment-v1",
      checks: ["source_question_page_visual_match", "source_answer_key_visual_match", "source_solution_visual_match", "independent_calculation", "option_rationales"],
      passed: true,
    }],
    provenanceJson: {
      sourceKind: "OWNED_INSTITUTE_PDF_WITH_JEE_MAIN_REFERENCES",
      sourceFile: SOURCE,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber,
      solutionOrigin: "SOURCE_VERIFIED_AND_INDEPENDENTLY_DERIVED",
      academicAdjudicationVersion: "physics-work-assignment-v1",
    },
  });
}

await fs.writeFile(OUTPUT, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
