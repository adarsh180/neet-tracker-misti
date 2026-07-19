import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/pdf-admission-audit/source-rationale-candidates.json");
const OUTPUT_DIR = path.join(ROOT, "data/pdf-admission-audit");

const decisions = new Map([
  [
    "afaf66e539dfd6c28ecbe0f7b7164b9eae955c0f26737522ac81fc451681c8dc",
    {
      accept: false,
      reason:
        "Stem is internally inconsistent: placoid scales/cartilaginous endoskeleton indicate Chondrichthyes, but a terminal mouth is an Osteichthyes feature; Chondrichthyes characteristically have a ventral mouth.",
    },
  ],
  [
    "fd485920c88a1b88c8835526c5da8cb95b01d6478f5ac8e1972220d0410defec",
    {
      accept: true,
      explanation:
        "Birds and mammals are homeothermic, have a four-chambered heart, and breathe through lungs. Ostrich and penguin are birds, while dolphin is a mammal, so all three satisfy every condition. The other sets contain fish, amphibians, or non-crocodilian reptiles, which are poikilothermic and/or do not have a four-chambered heart.",
      optionExplanations: [
        "Incorrect. Shark is poikilothermic, has a two-chambered heart, and breathes through gills; frog is poikilothermic with a three-chambered heart; crocodile is also poikilothermic.",
        "Incorrect. Salamander, Hyla, and Bufo are amphibians. They are poikilothermic, generally have a three-chambered heart, and do not respire exclusively through lungs.",
        "Incorrect. Pigeon and bat satisfy the conditions, but garden lizard is a poikilothermic reptile with a three-chambered heart.",
        "Correct. Ostrich and penguin are birds and dolphin is a mammal; all are homeothermic, have a four-chambered heart, and respire through lungs.",
      ],
    },
  ],
  [
    "9a1e42d26050dee432beff99f6b3f737f4254768c018ab403b6ac2b6794a1ebf",
    {
      accept: true,
      explanation:
        "Amphibians typically have moist, scaleless skin; respiration may occur through gills, lungs, and skin at different life stages; and the adult heart is generally three-chambered. Fertilization is predominantly external and usually occurs in water, so the statement claiming predominantly internal fertilization is incorrect.",
      optionExplanations: [
        "Correct statement. Amphibian skin is generally moist, glandular, and lacks scales.",
        "Correct statement. Larvae commonly respire through gills, while adults use lungs and cutaneous respiration; buccopharyngeal respiration may also occur.",
        "Correct statement. The typical amphibian heart has two atria and one ventricle, producing incomplete double circulation.",
        "Incorrect statement and therefore the answer. Fertilization in most amphibians is external and occurs in water; internal fertilization occurs only in some groups.",
      ],
    },
  ],
]);

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const accepted = [];
const rejected = [];

for (const row of rows) {
  const hash = row.trendMetaJson?.contentHash;
  const decision = decisions.get(hash);
  if (!decision) {
    rejected.push({ sourceRef: row.sourceRef, contentHash: hash, reason: "No academic adjudication decision" });
    continue;
  }
  if (!decision.accept) {
    rejected.push({ sourceRef: row.sourceRef, contentHash: hash, reason: decision.reason });
    continue;
  }

  accepted.push({
    ...row,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    verifierRuns: [
      ...(Array.isArray(row.verifierRuns) ? row.verifierRuns : []),
      {
        verifier: "CODEX_ACADEMIC_ADJUDICATION",
        version: "pdf-pilot-v1",
        checks: ["stem_consistency", "answer_correctness", "option_rationales", "source_page_visual_match"],
        passed: true,
      },
    ],
    provenanceJson: {
      ...row.provenanceJson,
      academicAdjudication: "CODEX_ACADEMIC_ADJUDICATION",
      academicAdjudicationVersion: "pdf-pilot-v1",
    },
  });
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "adjudicated-pdf-pilot.json"), `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
await fs.writeFile(
  path.join(OUTPUT_DIR, "adjudicated-pdf-pilot-report.json"),
  `${JSON.stringify({ sourceRows: rows.length, accepted: accepted.length, rejected }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ sourceRows: rows.length, accepted: accepted.length, rejected: rejected.length }, null, 2));
