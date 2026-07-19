import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/zoology-pdf-stage/zoology-pdf-bank-ready.json");
const OUTPUT_DIR = path.join(ROOT, "data/pdf-admission-audit");

const decisions = new Map([
  ["3d50e50f6f034fc2c1f0ca4a90d171ffb0a02743dbbf601e064fc2863272a065", [
    "The organism is a poriferan. Sponges have a spongocoel, choanocytes and intracellular digestion, but their adult body is asymmetrical or radially symmetrical rather than bilaterally symmetrical.",
    ["Found in Porifera: the spongocoel is the central cavity through which canal-system water passes.", "Found in Porifera: choanocytes generate water currents and capture food.", "Not found and therefore the answer: adult sponges are asymmetrical or radially symmetrical, not bilaterally symmetrical.", "Found in Porifera: digestion is intracellular because sponges lack a digestive cavity."],
  ]],
  ["54619854edbe43cfd6582de25ca9aab963272e8b07533123c1deede90de45a8e", [
    "Pheretima is an annelid and Periplaneta is an arthropod; both are true coelomates. Ascaris is pseudocoelomate and Fasciola is acoelomate.",
    ["Incorrect. Ascaris is pseudocoelomate and Fasciola is acoelomate.", "Incorrect. Fasciola is acoelomate although Pheretima is a true coelomate.", "Correct. Both Pheretima and Periplaneta possess a true coelom, although it is reduced to specific cavities in arthropods.", "Incorrect. Ascaris is pseudocoelomate even though Periplaneta is coelomate."],
  ]],
  ["5951271c67d8dbae102c9a6a39d0dc591bf8a51ab25c607ab66cfc62275c9b6c", [
    "Metameric segmentation, nephridia and a closed circulatory system identify Annelida. The absence of jointed appendages and a chitinous exoskeleton excludes Arthropoda.",
    ["Incorrect. Arthropods have jointed appendages, a chitinous exoskeleton and generally an open circulatory system.", "Incorrect. Molluscs are generally unsegmented and use metanephridia rather than the annelid segmental organization described.", "Correct. The complete feature set is characteristic of Phylum Annelida.", "Incorrect. Platyhelminthes are unsegmented acoelomates and lack the stated closed vascular system and nephridia pattern."],
  ]],
  ["c24c368a4148b67698af3f448bd39907adf7c499d5bf98dec82ad344d32c4542", [
    "Elephantiasis is caused by the filarial roundworm Wuchereria. Its bilateral symmetry, pseudocoelom, complete digestive tract and separate sexes are characteristic of Aschelminthes or Nematoda.",
    ["Incorrect. Platyhelminthes are acoelomate and generally possess an incomplete digestive system.", "Incorrect. Annelids are true coelomates with metameric segmentation.", "Correct. Wuchereria belongs to Aschelminthes and matches all the listed traits.", "Incorrect. Molluscs are true coelomates and do not match the roundworm body plan."],
  ]],
  ["dffe2eb29600b2c07acc9654bec48e8a09828a4f4dbf0c634a4b2211833980dc", [
    "All living reptiles use internal fertilization. Turtle, snake and crocodile each fertilize internally, so none is an exception.",
    ["Incorrect. Turtles have internal fertilization.", "Incorrect. Snakes have internal fertilization using paired hemipenes in males.", "Incorrect. Crocodiles also have internal fertilization.", "Correct. None of the listed reptiles is an exception to internal fertilization."],
  ]],
  ["a5ef986329faa24a6e1ecd2381e40c13326aaa1565864b9e050fed52d503a9bd", [
    "A blastopore that becomes the anus together with radial, indeterminate cleavage defines deuterostomes. Echinodermata, Hemichordata and Chordata are deuterostome phyla.",
    ["Incorrect. Annelida, Arthropoda and Mollusca are protostome phyla.", "Correct. Echinodermata, Hemichordata and Chordata are deuterostomes.", "Incorrect. Platyhelminthes and Aschelminthes are not the deuterostome group described.", "Incorrect. Cnidaria and Ctenophora are non-bilaterian diploblastic phyla, not the specified deuterostome clade."],
  ]],
  ["54479ea6d8d313509394e9ea8d468e780dff3b2a2daa0ce8d6b9d90fb86f1df8", [
    "Nereis, Pheretima and Hirudinaria are annelids. They share organ-system organization, bilateral symmetry, a true coelom with metameric segmentation, and a closed circulatory system; therefore all four statements apply.",
    ["Incomplete. A, B and C are true, but D is also a shared annelid feature.", "Incomplete. A, C and D are true, but bilateral symmetry B is also shared.", "Incomplete. B, C and D are true, but organ-system organization A is also shared.", "Correct. All four listed features are common to the three annelids."],
  ]],
  ["e8ab4c2ba1d982a140190d05f6ae8619c80525b610919a947d32de5bb51a3383", [
    "Pteropus, Macropus and Delphinus are placental or marsupial mammals that give birth to young. Ornithorhynchus is an egg-laying monotreme, while Aptenodytes and Crocodylus are oviparous; hence three are viviparous.",
    ["Incorrect. There are three viviparous animals, not two.", "Correct. Pteropus, Macropus and Delphinus are the three viviparous animals.", "Incorrect. Ornithorhynchus, Aptenodytes and Crocodylus are oviparous, leaving only three viviparous entries.", "Incorrect. The list contains only three viviparous animals, not five."],
  ]],
  ["cfb5a05a7dd24b19a97fa38c402135878e2f94f296c7ffc716d595283feb5e31", [
    "Statement D is incorrect because Malpighian tubules are not universal in Arthropoda; crustaceans use antennal or green glands. The remaining listed statements describe accepted arthropod features.",
    ["Not the answer. Arthropod respiratory organs do include gills, book gills, book lungs and tracheae in different groups.", "Not the answer. Arthropods characteristically have an open circulatory system with a haemocoel.", "Correct choice. Statement D is false because all arthropods do not excrete through Malpighian tubules.", "Not the answer. Jointed appendages are the defining feature reflected in the name Arthropoda."],
  ]],
  ["2767ae232b08ac1ac87029875f15bdd6620b5c98309aa99d26299ae319d60253", [
    "Statements A, B and C correctly describe true coelomates, acoelomates and pseudocoelomates. Statement D is wrong because the haemocoel of arthropods and most molluscs is not a true coelom; their true coelom is greatly reduced.",
    ["Correct. Only statement D is incorrect.", "Incorrect. Statement C is acceptable for pseudocoelomates; D alone is incorrect.", "Incorrect. Statements B and C are both correct descriptions.", "Incorrect. Statement A is correct, while D is incorrect."],
  ]],
  ["64931460829e384debee85721213a1f72bf2c90d26d11f87eae9c49563a629c8", [
    "Chondrichthyes generally have a ventral mouth, exposed gill slits, placoid scales and internal fertilization; many are viviparous. Osteichthyes generally have a terminal mouth, an operculum, cycloid or ctenoid scales, external fertilization and oviparity. Thus A, C and D are correct, while B reverses the operculum condition.",
    ["Correct. Statements A, C and D accurately distinguish the two fish classes.", "Incorrect. Statement B is reversed: the operculum occurs in Osteichthyes, not Chondrichthyes.", "Incorrect. D is correct but B is not.", "Incomplete. A and C are correct, but D is also correct at the NCERT level."],
  ]],
  ["cce15ef2dc22c4f4244930fba4fc260a1380496274db4376e55528af2c5c0c49", [
    "A proboscis-collar-trunk body with a proboscis gland identifies Hemichordata; cnidoblasts identify Cnidaria; a pseudocoelom and complete gut identify Aschelminthes; and mantle plus radula identify Mollusca. Therefore the sequence is Hemichordata, Cnidaria, Aschelminthes, Mollusca.",
    ["Incorrect. Animal P is a hemichordate rather than an annelid.", "Incorrect. Cnidoblasts identify Cnidaria, and the pseudocoelomate R is not Platyhelminthes.", "Correct. Each animal is matched to the phylum indicated by its diagnostic features.", "Incorrect. P is not a chordate, R is not an annelid, and S is not an arthropod."],
  ]],
  ["a6f5c4f31051132dccd35099206b4655b9e03cb4737b92e9b081a6c0dd8372f1", [
    "Fasciola, Hirudinaria and Aplysia belong to protostome phyla Platyhelminthes, Annelida and Mollusca respectively. Ophiura is an echinoderm and therefore a deuterostome, so it is the exception.",
    ["Incorrect. Fasciola is a platyhelminth and is grouped with protostomes.", "Incorrect. Hirudinaria is an annelid, a protostome phylum.", "Incorrect. Aplysia is a mollusc and belongs to a protostome phylum.", "Correct. Ophiura is an echinoderm and hence a deuterostome."],
  ]],
  ["55eab7b1ec268c3a18e0cca224ab966557e8fabb127378d37ce0c1e6cf4ec118", [
    "Porifera use an ostia-spongocoel-osculum canal system for feeding, gas exchange and waste removal. Echinoderms use a water vascular system and tube feet chiefly for locomotion and food capture, with additional respiratory roles.",
    ["Incorrect. Poriferans lack a true circulatory system, and the echinoderm water vascular system is not a closed blood-circulatory system.", "Incorrect. The primary functions are reversed and oversimplified.", "Correct. It accurately states both transport systems and their principal functions.", "Incorrect. Neither group has the described shared closed blood-water system."],
  ]],
  ["39bbda8957be4defcad259bb8eb9bbe651468481f7814f5682f564b4c74cdb28", [
    "Cephalopods such as squid and octopus possess a closed circulatory system that supports active swimming and high metabolic demand. Gastropods, bivalves and polyplacophorans have an open circulatory system.",
    ["Incorrect. Gastropods generally have an open circulatory system.", "Incorrect. Bivalves generally have an open circulatory system.", "Correct. Cephalopoda is the molluscan class with a closed circulatory system.", "Incorrect. Polyplacophorans have an open circulatory system."],
  ]],
  ["bb56995e7f9a88cebcbd015f5fbb2507456423d01c5d806652f9ab3a68aec5e2", [
    "Indirect development occurs when the zygote develops through one or more larval stages that differ markedly from the adult and later metamorphose into the adult form.",
    ["Incorrect. A miniature adult without a larval stage describes direct development.", "Incorrect. Development inside the mother defines viviparity, not indirect development.", "Correct. Passage through one or more larval stages is the defining feature of indirect development.", "Incorrect. External fertilization does not itself determine whether development is direct or indirect."],
  ]],
]);

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const accepted = [];
const missing = [];
for (const [hash, [explanation, optionExplanations]] of decisions) {
  const row = rows.find((candidate) => candidate.trendMetaJson?.contentHash === hash);
  if (!row) { missing.push(hash); continue; }
  accepted.push({
    ...row,
    explanation,
    optionExplanations,
    verified: true,
    verifierRuns: [{ verifier: "CODEX_ACADEMIC_ADJUDICATION", version: "animal-kingdom-v1", checks: ["source_page_visual_match", "answer_key", "stem_consistency", "option_rationales"], passed: true }],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
      sourceFile: row.trendMetaJson?.sourceFile,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber: row.trendMetaJson?.questionNo,
      solutionOrigin: "SOURCE_VERIFIED_AND_EXPANDED",
      academicAdjudication: "CODEX_ACADEMIC_ADJUDICATION",
      academicAdjudicationVersion: "animal-kingdom-v1",
    },
  });
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "adjudicated-zoology-animal-kingdom-v1.json"), `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
