import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/zoology-pdf-stage/zoology-pdf-bank-ready.json");
const OUTPUT = path.join(ROOT, "data/pdf-admission-audit/adjudicated-zoology-animal-kingdom-visual-v1.json");
const SOURCE = "kattar/Animal Kingdom  Kattar NEET 2026  Zoology By Dr. Akanksha Agarwal Ma'am.pdf";

const decisions = new Map([
  [7, {
    visualAssetUrl: "/bank-visuals/zoology/verified/animal-kingdom-q07-body-cavity.webp",
    visualAssetAlt: "Cross-sections comparing a true coelom in diagram A with a pseudocoelom in diagram B.",
    explanation: "Diagram (b) represents a pseudocoelom. It is the persistent embryonic blastocoel and is not completely lined by mesoderm; mesoderm occurs only along the body wall rather than surrounding the gut as well. A true coelom, shown in (a), is completely lined by mesoderm. Therefore the developmental origin and incomplete mesodermal lining make it a false coelom.",
    optionExplanations: ["Incorrect. Cavity size does not determine whether a body cavity is a true coelom or pseudocoelom.", "Correct. A pseudocoel is a persistent blastocoel that is not completely lined by mesoderm.", "Incorrect. The defining issue is incomplete mesodermal lining, not whether mesodermal tissue is functional.", "Incorrect. Splitting within mesoderm produces a true schizocoelous coelom like diagram (a), not diagram (b)."],
  }],
  [41, {
    visualAssetUrl: "/bank-visuals/zoology/verified/animal-kingdom-q41-body-cavities.webp",
    visualAssetAlt: "Diagram A shows a pseudocoel with mesoderm along the body wall; diagram B shows a true coelom completely lined by mesoderm.",
    explanation: "In diagram A, mesoderm is present as pouches along the body wall but does not completely line the cavity around the gut, so it represents a pseudocoelomate such as Ascaris. In diagram B, mesoderm lines both the body wall and the gut side of the cavity, forming a true coelom as in Nereis. Hence option A correctly identifies both diagrams.",
    optionExplanations: ["Correct. A is a pseudocoelomate pattern exemplified by Ascaris, and B is a true coelomate pattern exemplified by Nereis.", "Incorrect. Planaria is acoelomate, while cockroach has a reduced true coelom and a haemocoel rather than the pairing stated.", "Incorrect. Taenia is acoelomate, so it cannot exemplify diagram A's pseudocoel.", "Incorrect. Pheretima is a true coelomate, not a pseudocoelomate, so the assignment of diagram A is wrong."],
  }],
  [48, {
    visualAssetUrl: "/bank-visuals/zoology/verified/animal-kingdom-q48-hirudinaria.webp",
    visualAssetAlt: "Dorsal view of the segmented annelid Hirudinaria with a posterior sucker.",
    explanation: "The figure is Hirudinaria, a leech of phylum Annelida. It is triploblastic and bilaterally symmetrical, is a coelomate with metameric segmentation, and has a closed circulatory system. It does not possess the lateral parapodia seen in Nereis. Therefore statements I, II, III, and V apply, while statement IV does not.",
    optionExplanations: ["Correct. I, II, III, and V describe Hirudinaria; lateral appendages in IV are absent.", "Incorrect. This set includes IV, but Hirudinaria lacks lateral parapodia, and it omits the valid statement II.", "Incorrect. IV is false for Hirudinaria, and V correctly places it in Annelida.", "Incorrect. IV is false, while statement I about triploblastic bilateral organization is true."],
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
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    isDiagramBased: true,
    isGraphBased: false,
    visualAssetKind: "DIAGRAM",
    visualAssetUrl: decision.visualAssetUrl,
    visualAssetAlt: decision.visualAssetAlt,
    visualMetaJson: {
      sourceKind: "OWNED_PDF_EXACT_CROP",
      sourceFile: SOURCE,
      sourcePage: row.trendMetaJson?.pageStart,
      questionNumber,
      cropVersion: "animal-kingdom-visual-v1",
      paddingPx: 24,
      imageFormat: "webp-lossless",
    },
    verifierRuns: [{
      verifier: "CODEX_ACADEMIC_AND_VISUAL_ADJUDICATION",
      version: "animal-kingdom-visual-v1",
      checks: ["source_question_page_visual_match", "source_answer_key_visual_match", "source_solution_visual_match", "exact_pdf_crop", "independent_academic_review", "option_rationales"],
      passed: true,
    }],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION_AND_EXACT_VISUAL",
      sourceFile: SOURCE,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber,
      solutionOrigin: "SOURCE_VERIFIED_AND_INDEPENDENTLY_EXPANDED",
      visualOrigin: "EXACT_SOURCE_PDF_CROP",
      academicAdjudicationVersion: "animal-kingdom-visual-v1",
    },
  });
}

await fs.writeFile(OUTPUT, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
