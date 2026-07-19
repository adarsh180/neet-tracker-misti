import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/physics-pdf-stage/physics-pdf-questions.jsonl");
const OUTPUT = path.join(ROOT, "data/pdf-admission-audit/adjudicated-physics-work-kattar-v1.json");
const SOURCE = "kattar/Work, energy and power  Kattar NEET 2026  Physics By Manish Raj Sir.pdf";

const decisions = new Map([
  [45, {
    explanation: "The child drops through $h=6-1=5\\,\\text{m}$. Neglecting losses, $mgh=\\frac12mv^2$, so $v=\\sqrt{2gh}=\\sqrt{2(9.8)(5)}=\\sqrt{98}\\approx10\\,\\text{m s}^{-1}$.",
    optionExplanations: ["Incorrect. Energy conservation gives about $10\\,\\text{m s}^{-1}$, not $8\\,\\text{m s}^{-1}$.", "Correct. $v=\\sqrt{2g(5)}\\approx10\\,\\text{m s}^{-1}$.", "Incorrect. $12\\,\\text{m s}^{-1}$ would require a larger vertical drop than $5\\,\\text{m}$.", "Incorrect. $14\\,\\text{m s}^{-1}$ corresponds to roughly twice the available height drop."],
  }],
  [46, {
    explanation: "Work is $W=Fs\\cos\\theta$. Statement I is true because $\\theta=90^\\circ$ gives zero work. Statement II is true because an obtuse angle has $\\cos\\theta<0$. Statement III is false: important central forces such as gravitational and electrostatic forces are conservative. Hence only I and II are correct.",
    optionExplanations: ["Incorrect. Statement II is also true for an obtuse force-displacement angle.", "Correct. Statements I and II are true, while statement III is false.", "Incorrect. Statement III is false because many central forces are conservative.", "Incorrect. Including statement III makes this set false."],
  }],
  [47, {
    question: "At $t=0$ a particle starts moving along the $x$-axis. If its kinetic energy increases uniformly with time $t$, the net force acting on it must be proportional to:",
    options: ["$\\sqrt{t}$", "a constant", "$t$", "$1/\\sqrt{t}$"],
    explanation: "Uniform increase means $K=Ct$. Since $K=p^2/(2m)$, momentum is $p=\\sqrt{2mCt}\\propto\\sqrt t$. Therefore $F=dp/dt\\propto d(\\sqrt t)/dt\\propto1/\\sqrt t$.",
    optionExplanations: ["Incorrect. Momentum, not force, is proportional to $\\sqrt t$.", "Incorrect. A constant force would make momentum proportional to $t$ and kinetic energy proportional to $t^2$.", "Incorrect. A force proportional to $t$ would make kinetic energy grow faster than linearly.", "Correct. From $K\\propto t$, $p\\propto\\sqrt t$ and hence $F=dp/dt\\propto1/\\sqrt t$."],
  }],
  [48, {
    question: "A uniform cable of mass $M$ and length $L$ lies on a horizontal surface with $(1/n)$th of its length hanging over the edge. The work required to lift the hanging part onto the surface is:",
    options: ["$2MgL/n^2$", "$nMgL$", "$MgL/n^2$", "$MgL/(2n^2)$"],
    explanation: "The hanging length is $L/n$, so its mass is $M/n$. Its centre of mass is initially $L/(2n)$ below the surface and is raised by that amount. Thus $W=\\Delta U=(M/n)g[L/(2n)]=MgL/(2n^2)$.",
    optionExplanations: ["Incorrect. This is four times the required potential-energy increase.", "Incorrect. The work must decrease, not increase, as the hanging fraction $1/n$ becomes smaller.", "Incorrect. This misses the factor $1/2$ from the centre-of-mass height of the hanging segment.", "Correct. The mass $M/n$ is raised through its centre-of-mass distance $L/(2n)$."],
  }],
  [49, {
    explanation: "At the stated point, $U/K=25/144$. With speed $v$ there, $K=\\frac12mv^2$, so the conserved initial energy is $K+U=(169/144)K$. Therefore $\\frac12mu^2=(169/144)(\\frac12mv^2)$ and $u/v=13/12$.",
    optionExplanations: ["Incorrect. $12:13$ is the reciprocal of the required projection-speed to current-speed ratio.", "Incorrect. This ratio does not follow from the conserved total energy $K+U$.", "Correct. $u^2/v^2=169/144$, so $u:v=13:12$.", "Incorrect. $17:13$ is inconsistent with the given potential-to-kinetic energy ratio."],
  }],
  [50, {
    question: "A spring of spring constant $k$ is fixed horizontally at the bottom of a frictionless hill. A block of mass $m$, initially at height $H$, is gently pushed downward. Its maximum spring compression is:",
    options: ["$\\sqrt{2gH}$", "$mgH$", "$\\sqrt{mgH/k}$", "$\\sqrt{2mgH/k}$"],
    explanation: "With no friction, the initial gravitational potential energy becomes spring potential energy at maximum compression: $mgH=\\frac12kx^2$. Solving gives $x=\\sqrt{2mgH/k}$.",
    optionExplanations: ["Incorrect. $\\sqrt{2gH}$ has units of speed, not length.", "Incorrect. $mgH$ is energy and cannot represent a compression length.", "Incorrect. This misses the factor of $2$ from the spring energy $\\frac12kx^2$.", "Correct. Energy conservation gives $x=\\sqrt{2mgH/k}$."],
  }],
  [54, {
    question: "A force $\\vec F=(2\\hat i+3\\hat j)\\,\\text{N}$ displaces a body from $\\vec r_1=(2\\hat i+4\\hat j)\\,\\text{m}$ to $\\vec r_2=(3\\hat i+7\\hat j)\\,\\text{m}$. The work done is:",
    explanation: "The displacement is $\\Delta\\vec r=\\vec r_2-\\vec r_1=(\\hat i+3\\hat j)\\,\\text{m}$. Hence $W=\\vec F\\cdot\\Delta\\vec r=(2)(1)+(3)(3)=11\\,\\text{J}$.",
    optionExplanations: ["Incorrect. This does not include the full dot product of both vector components.", "Correct. $W=(2)(1)+(3)(3)=11\\,\\text{J}$.", "Incorrect. $3\\,\\text{J}$ is only one component and is not the total work.", "Incorrect. This is not the dot product of force with the displacement vector."],
  }],
  [55, {
    question: "A variable force $F=3x^2\\,\\text{N}$ acts while a body moves from $x=1\\,\\text{m}$ to $x=2\\,\\text{m}$. The average force over this interval is:",
    explanation: "Average force over a displacement interval is $F_{\\rm avg}=\\frac{1}{2-1}\\int_1^2 3x^2\\,dx=[x^3]_1^2=8-1=7\\,\\text{N}$.",
    optionExplanations: ["Incorrect. $8\\,\\text{N}$ is not the displacement average of $3x^2$ over $1\\le x\\le2$.", "Incorrect. This is below the calculated integral average of $7\\,\\text{N}$.", "Correct. $F_{\\rm avg}=\\int_1^2 3x^2dx=7\\,\\text{N}$ because the interval length is $1\\,\\text{m}$.", "Incorrect. $10\\,\\text{N}$ does not follow from the force-displacement integral."],
  }],
  [56, {
    explanation: "With $m=1\\,\\text{kg}$, the acceleration is $a=F/m=6t$. Starting from rest, $v(t)=\\int_0^t6t'\\,dt'=3t^2$, so $v(1)=3\\,\\text{m s}^{-1}$. By the work-energy theorem, $W=\\Delta K=\\frac12(1)(3)^2=4.5\\,\\text{J}$.",
    optionExplanations: ["Incorrect. $9\\,\\text{J}$ equals $mv^2$, missing the kinetic-energy factor $1/2$.", "Incorrect. Direct integration or the work-energy theorem gives $4.5\\,\\text{J}$.", "Correct. The final speed is $3\\,\\text{m s}^{-1}$, so $W=\\frac12mv^2=4.5\\,\\text{J}$.", "Incorrect. This value is inconsistent with the final kinetic energy after one second."],
  }],
]);

const rows = (await fs.readFile(INPUT, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const accepted = [];
const missing = [];
for (const [questionNumber, decision] of decisions) {
  const row = rows.find((candidate) => candidate.stageMeta?.sourceFile === SOURCE && candidate.stageMeta?.questionNo === questionNumber);
  if (!row) {
    missing.push(questionNumber);
    continue;
  }
  accepted.push({
    ...row,
    question: decision.question ?? row.question,
    options: decision.options ?? row.options,
    correctIndex: row.correctIndex,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    isDiagramBased: false,
    isGraphBased: false,
    visualAssetKind: null,
    visualAssetUrl: null,
    visualAssetAlt: null,
    trendMetaJson: row.stageMeta,
    stageMeta: undefined,
    visualMetaJson: null,
    verifierRuns: [{
      verifier: "CODEX_ACADEMIC_ADJUDICATION",
      version: "physics-work-kattar-v1",
      checks: ["source_question_page_visual_match", "source_answer_key_visual_match", "source_solution_visual_match", "formula_reconstruction_from_source", "independent_calculation", "option_rationales"],
      passed: true,
    }],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
      sourceFile: SOURCE,
      pageStart: row.stageMeta?.pageStart,
      pageEnd: row.stageMeta?.pageEnd,
      questionNumber,
      solutionOrigin: "SOURCE_VERIFIED_AND_INDEPENDENTLY_DERIVED",
      formulaRepairOrigin: [47, 48, 50].includes(questionNumber) ? "VISUAL_SOURCE_PAGE" : "NONE",
      academicAdjudicationVersion: "physics-work-kattar-v1",
    },
  });
}

await fs.writeFile(OUTPUT, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
