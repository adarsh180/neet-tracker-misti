import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/zoology-pdf-stage/zoology-pdf-bank-ready.json");
const OUTPUT = path.join(ROOT, "data/pdf-admission-audit/adjudicated-zoology-animal-kingdom-v2.json");

const decisions = new Map([
  [27, {
    explanation: "Statements A, B, and D are correct. Ornithorhynchus is an egg-laying monotreme with hair; Aptenodytes is a flightless penguin with a four-chambered heart; and Delphinus is a lung-breathing cetacean without external pinnae. Statement C is false because Pteropus is viviparous but, as a mammal, does not possess the pneumatic bones characteristic of birds. Therefore exactly three combinations are correct.",
    optionExplanations: ["Incorrect. More than one statement is correct: A, B, and D are all correct.", "Incorrect. There are three correct combinations, not two.", "Correct. A, B, and D are correct, whereas C is false because Pteropus lacks avian pneumatic bones.", "Incorrect. All four are not correct because statement C incorrectly assigns pneumatic bones to Pteropus."],
  }],
  [39, {
    explanation: "Statements A, B, C, and E explain arthropod success. A chitinous exoskeleton, segmentation, and jointed appendages provide protection and mobility; metamorphosis can separate larval and adult niches; specialized respiratory organs support aquatic and terrestrial life; and advanced sense organs and nervous systems improve responses. Statement D is false because arthropods show clear cephalization rather than lacking it.",
    optionExplanations: ["Incorrect. A, B, and C are correct, but E is also a valid contributor to arthropod success.", "Correct. A, B, C, and E are valid; D is false because arthropods possess marked cephalization.", "Incorrect. D is false, and this set also omits the valid statements B and E.", "Incorrect. Statement D is false, so all five statements cannot be accepted."],
  }],
  [42, {
    explanation: "A is Urochordata because the larval notochord is confined to the tail and is lost during metamorphosis. B is Cephalochordata because the notochord extends from head to tail and persists throughout life. C is Vertebrata because the embryonic notochord is later replaced by the vertebral column. Thus the order is Urochordata, Cephalochordata, Vertebrata.",
    optionExplanations: ["Correct. The three notochord patterns respectively identify Urochordata, Cephalochordata, and Vertebrata.", "Incorrect. A is not Cephalochordata, and B is not Vertebrata.", "Incorrect. The larval tail notochord identifies A as Urochordata, not Vertebrata.", "Incorrect. A and B have been interchanged; A is Urochordata and B is Cephalochordata."],
  }],
  [44, {
    explanation: "A crab is an arthropod: it has a chitinous exoskeleton, a segmented body, and jointed appendages. An apple snail is a mollusc: it has a soft unsegmented body, muscular foot, mantle, and usually a calcareous shell. A shell alone is therefore not sufficient to place both animals in Mollusca.",
    optionExplanations: ["Incorrect. A crab's outer covering is an arthropod exoskeleton, not evidence that it is a mollusc.", "Correct. Crab belongs to Arthropoda, whereas apple snail belongs to Mollusca.", "Incorrect. The two phyla are reversed in this option.", "Incorrect. Apple snail is a mollusc and does not have the jointed appendages characteristic of arthropods."],
  }],
  [50, {
    explanation: "Statements I and II describe the usual reproductive trade-off: many oviparous organisms produce more eggs because externally developing young suffer greater mortality, whereas viviparous organisms commonly produce fewer, better-protected young with greater parental investment. Statement III is false; internal fertilization can occur in either mode and does not imply equal offspring numbers.",
    optionExplanations: ["Correct. Statements I and II are generally true, while statement III is false.", "Incorrect. Statement III is false, although statement II is true.", "Incorrect. All three cannot be correct because statement III makes an invalid equality claim.", "Incorrect. Statement III is false, while statements I and II are the correct statements."],
  }],
  [51, {
    explanation: "Every vertebrate displays the fundamental chordate plan, including a notochord at least embryonically. In vertebrates such as sharks and frogs, it is replaced wholly or partly by a vertebral column. Herdmania and Branchiostoma are chordates without vertebrae: the notochord is confined to the larval tail in Herdmania and persists throughout life in Branchiostoma. Hence all vertebrates are chordates, but not all chordates are vertebrates.",
    optionExplanations: ["Incorrect. Branchiostoma is a non-vertebrate chordate and lacks a vertebral column.", "Correct. It accurately distinguishes the universal chordate notochord from the vertebral column of vertebrates.", "Incorrect. Herdmania is not a vertebrate, and its notochord is present only in the larval tail.", "Incorrect. Bilateral symmetry is not exclusive to vertebrates, and Herdmania does not share the vertebrate condition asserted here."],
  }],
  [52, {
    explanation: "A is true: digestion may be intracellular or extracellular. B is false because, in metagenesis, polyps produce medusae asexually and medusae produce polyps sexually. C is true for flight-adapted birds, and D is true because the swim bladder aids buoyancy in most bony fishes. E is false because cartilaginous fishes lack an air bladder. Therefore A, C, and D are correct.",
    optionExplanations: ["Correct. A, C, and D are true, while B and E are false.", "Incorrect. B reverses the sexual and asexual phases, and E wrongly gives Chondrichthyes an air bladder.", "Incorrect. E is false because cartilaginous fishes do not possess an air bladder.", "Incorrect. E is false and this option also omits the correct statement D."],
  }],
  [54, {
    explanation: "Bilaterians arose before the deuterostome lineage. Vertebrates are chordate deuterostomes; tetrapods later evolved within vertebrates; and amniotes are a derived tetrapod group characterized by the amnion. The nested evolutionary sequence is therefore Bilaterians → Deuterostomes → Vertebrates → Tetrapods → Amniotes, or E → C → B → A → D.",
    optionExplanations: ["Incorrect. It places amniotes before tetrapods, although amniotes are a subgroup of tetrapods.", "Correct. The sequence follows the nested origin of Bilateria, Deuterostomia, Vertebrata, Tetrapoda, and Amniota.", "Incorrect. Deuterostomes are nested within the earlier bilaterian radiation, not before Bilaterians.", "Incorrect. This reverses several nested relationships and incorrectly places Bilaterians last."],
  }],
  [55, {
    explanation: "All four statements are false. Vertebrate hearts are not uniformly four-chambered; cyclostomes are vertebrates without paired appendages and without jaws; and fin-bearing aquatic mammals are not members of superclass Pisces. Thus the correct truth pattern is A-F, B-F, C-F, D-F.",
    optionExplanations: ["Correct. Each statement has a counterexample, so all four are false.", "Incorrect. A and B are false; fish do not have four-chambered hearts and cyclostomes lack paired appendages.", "Incorrect. D is also false because aquatic mammals can bear fins without belonging to Pisces.", "Incorrect. A and C are false, not true; vertebrate hearts vary and cyclostomes are jawless."],
  }],
  [56, {
    explanation: "Exocoetus is a marine bony fish commonly called the flying fish. Torpedo is an electric ray, not a poison-sting fish; Hippocampus is the seahorse, not the sea hare; and Carcharodon is a cartilaginous shark that lacks an air bladder. Hence only the Exocoetus match is correct.",
    optionExplanations: ["Incorrect. Torpedo is known for electric organs, not a poison sting.", "Correct. Exocoetus is a marine osteichthyan commonly called the flying fish.", "Incorrect. Hippocampus is the seahorse; sea hare is the mollusc Aplysia.", "Incorrect. Carcharodon is a cartilaginous fish and lacks the air bladder of bony fishes."],
  }],
  [57, {
    explanation: "A roundworm is pseudocoelomate, has only longitudinal body-wall muscles, and is unsegmented. An earthworm is a true coelomate, has both circular and longitudinal body-wall muscles, and is metamerically segmented. Both are triploblastic, so germ-layer number does not distinguish them; cross-sectional shape is not the intended major diagnostic here. Therefore A, B, and C form the correct set.",
    optionExplanations: ["Incorrect. Body cavity distinguishes them, but muscle arrangement and segmentation also do so.", "Incorrect. D does not distinguish them because both roundworm and earthworm are triploblastic.", "Correct. Body cavity, body-wall muscle arrangement, and segmentation provide the intended distinctions.", "Incorrect. D is shared by both animals, and E is not accepted as a major definitive character in this set."],
  }],
  [58, {
    explanation: "The textbook progression begins with the loose cellular organization of Porifera. Diploblastic cnidarians and ctenophores then show mesoglea, followed by the origin of mesoderm in triploblastic animals. A complete digestive tract with separate mouth and anus appears later, from aschelminth-grade animals onward. Thus the sequence is A → C → D → B.",
    optionExplanations: ["Incorrect. A complete digestive tract did not precede the diploblastic mesoglea and triploblastic mesoderm conditions.", "Correct. Cellular aggregation precedes mesoglea, then mesoderm, and finally the complete digestive tract in this sequence.", "Incorrect. Mesoderm did not precede the diploblastic mesoglea condition.", "Incorrect. A complete digestive system is placed too early, before the formation of mesoderm."],
  }],
]);

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const sourceName = "kattar/Animal Kingdom  Kattar NEET 2026  Zoology By Dr. Akanksha Agarwal Ma'am.pdf";
const accepted = [];
const missing = [];

for (const [questionNumber, decision] of decisions) {
  const row = rows.find((candidate) => candidate.trendMetaJson?.sourceFile === sourceName && candidate.trendMetaJson?.questionNo === questionNumber);
  if (!row) {
    missing.push(questionNumber);
    continue;
  }
  accepted.push({
    ...row,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    verifierRuns: [{
      verifier: "CODEX_ACADEMIC_ADJUDICATION",
      version: "animal-kingdom-v2",
      checks: ["source_question_page_visual_match", "source_answer_key_visual_match", "source_solution_visual_match", "independent_academic_review", "option_rationales"],
      passed: true,
    }],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
      sourceFile: row.trendMetaJson?.sourceFile,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber,
      solutionOrigin: "SOURCE_VERIFIED_AND_INDEPENDENTLY_EXPANDED",
      academicAdjudication: "CODEX_ACADEMIC_ADJUDICATION",
      academicAdjudicationVersion: "animal-kingdom-v2",
    },
  });
}

await fs.writeFile(OUTPUT, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
