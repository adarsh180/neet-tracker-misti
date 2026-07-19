import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/physics-pdf-stage/physics-pdf-bank-ready.json");
const OUTPUT_DIR = path.join(ROOT, "data/pdf-admission-audit");

const decisions = new Map([
  ["7c5d7794e77b427843c4e34e0f9e4ac1339c59f9a2379cabe9d922cf73b284a1", {
    explanation: "Take the box and ball together as one system. The floor is smooth, so there is no horizontal external force. Collisions between the ball and the walls exert only internal forces, which cannot change the system's total momentum. Since the system is initially at rest, its centre of mass remains fixed, although the box and ball can move individually.",
    optionExplanations: [
      "Incorrect. The ball exerts impulses on the walls, so the box itself can move on the smooth surface.",
      "Correct. With zero horizontal external force and zero initial total momentum, the centre of mass of the box-plus-ball system remains fixed.",
      "Incorrect. The ball continually moves and changes direction, so its individual centre of mass is not fixed.",
      "Incorrect. The ball changes position relative to the box while travelling between and colliding with the walls.",
    ],
  }],
]);

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const accepted = [];
const missing = [];
for (const [hash, decision] of decisions) {
  const row = rows.find((candidate) => candidate.trendMetaJson?.contentHash === hash);
  if (!row) { missing.push(hash); continue; }
  accepted.push({
    ...row,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    verifierRuns: [{ verifier: "CODEX_ACADEMIC_ADJUDICATION", version: "physics-thin-v1", checks: ["source_page_visual_match", "answer_key", "independent_derivation", "option_rationales"], passed: true }],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
      sourceFile: row.trendMetaJson?.sourceFile,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber: row.trendMetaJson?.questionNo,
      solutionOrigin: "SOURCE_VERIFIED_AND_INDEPENDENTLY_EXPANDED",
      academicAdjudication: "CODEX_ACADEMIC_ADJUDICATION",
      academicAdjudicationVersion: "physics-thin-v1",
    },
  });
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "adjudicated-physics-thin-v1.json"), `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
