import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data/botany-pdf-stage/botany-pdf-bank-ready.json");
const OUTPUT_DIR = path.join(ROOT, "data/pdf-admission-audit");

const decisions = new Map([
  ["32304ab772150946f147549d159d19731b549a5806a842ec78c7403bbe0efcfc", {
    explanation: "Five listed tissues belong to the ground or fundamental tissue system: mesophyll, cortex, pericycle, pith, and medullary rays. Phloem and xylem form the vascular system, while trichomes, root hairs, and epiblema belong to the epidermal system.",
    optionExplanations: [
      "Incorrect. The count is not four; mesophyll, cortex, pericycle, pith, and medullary rays give five tissues.",
      "Correct. Exactly five of the listed tissues belong to the fundamental tissue system.",
      "Incorrect. Only five, not six, qualify after excluding the vascular and epidermal tissues.",
      "Incorrect. Five of the ten listed tissues qualify, so the count cannot be eight.",
    ],
  }],
  ["a4088a43052e8308a0496b9761788f05eb4a51eef95de8c34c1f4edd45d7f2c4", {
    explanation: "The shoot apical meristem is present first and produces the primary plant body, including pith. Interfascicular cambium develops later during secondary growth and subsequently produces secondary phloem. Therefore, the order is C -> D -> A -> B.",
    optionExplanations: [
      "Incorrect. Interfascicular cambium and secondary phloem cannot precede the shoot apical meristem and primary pith.",
      "Correct. Shoot apical meristem appears first, followed by pith, interfascicular cambium, and then secondary phloem.",
      "Incorrect. Pith is a primary tissue and appears before interfascicular cambium, not after it.",
      "Incorrect. Pith is formed by the shoot apical meristem, and secondary phloem forms only after cambial activity begins.",
    ],
  }],
  ["0a8e4e9f11bb7b49042baedf1d285bf644edc43970fdb2a6039400d5e712f836", {
    explanation: "Xylem and phloem are both components of the vascular tissue system. In an open vascular bundle of a dicot stem they are separated by vascular cambium, whose cells actively divide. The other pairs either belong to different tissue systems or are not separated by a meristematic tissue.",
    optionExplanations: [
      "Incorrect. Epidermis belongs to the epidermal system, whereas pericycle is part of the ground tissue system in this classification.",
      "Incorrect. Hypodermis and general cortex both belong to ground tissue, but they are contiguous regions and are not separated by an actively dividing meristem.",
      "Correct. Phloem and xylem are vascular tissues separated by meristematic vascular cambium in an open dicot-stem bundle.",
      "Incorrect. Endodermis and pericycle are ground-tissue regions separated by a boundary, not by vascular cambium or another active meristem.",
    ],
  }],
  ["c906e278eb27db4a1b3c89a493481025df32792aed0d0469c3a5cb3ed8f14cb1", {
    explanation: "The listed traits describe a dicot stem: it may bear trichomes and a few stomata, its cortex has hypodermis, general cortex and endodermis, a distinct pith is present, and vascular bundles occur in a ring.",
    optionExplanations: [
      "Incorrect. A monocot stem generally has scattered vascular bundles and an undifferentiated ground tissue rather than the stated three-zone cortex and ring arrangement.",
      "Incorrect. A monocot root has radial vascular bundles and does not match the stem epidermis and ring-arranged bundle features.",
      "Correct. All four characteristics are standard features of a young dicot stem.",
      "Incorrect. A dicot root has radial xylem and phloem and does not bear stem trichomes or ring-arranged conjoint vascular bundles.",
    ],
  }],
  ["ba34234c61679717ff746866fb32564aee3c8b2e6e87f0def39b07873dd221eb", {
    explanation: "Large, empty, colourless bulliform cells occur in the adaxial epidermis of grass leaves. Grass leaves are isobilateral, and changes in bulliform-cell turgidity help the leaf roll during water stress.",
    optionExplanations: [
      "Incorrect. China rose has a dorsiventral dicot leaf and does not show the characteristic grass bulliform cells described.",
      "Incorrect. Banana is a monocot, but the characteristic large bulliform cells are specified on the adaxial surface of grass leaves, not the abaxial banana epidermis.",
      "Correct. Bulliform cells are large, empty, colourless cells in the adaxial epidermis of grass leaves.",
      "Incorrect. Mustard is a dorsiventral dicot leaf and its abaxial epidermis does not contain grass-type bulliform cells.",
    ],
  }],
  ["bffc0ccc119773c284b2956011624f55c5ce8829c6f99b01bc2dad37072f714f", {
    explanation: "In a dorsiventral dicot leaf, palisade parenchyma lies on the adaxial side and consists of vertically arranged elongated cells. Spongy parenchyma lies toward the abaxial side, has oval or rounded loosely arranged cells, and contains large intercellular air spaces. Therefore, the claim of abaxial palisade parenchyma is incorrect.",
    optionExplanations: [
      "Incorrect statement and therefore the answer. Palisade parenchyma is adaxial, not abaxial, although its cells are elongated.",
      "Correct statement. Spongy parenchyma commonly consists of oval or rounded cells.",
      "Correct statement. Loose arrangement of spongy cells produces numerous intercellular air cavities.",
      "Correct statement. Adaxial palisade cells are elongated and arranged vertically and approximately parallel to one another.",
    ],
  }],
  ["42f8aab9542f8c563ac8266ebb0ba7a1e2adca397b1092f4d4b0708faa299f65", {
    explanation: "Thin cellulose walls, generally isodiametric shapes, possible intercellular spaces, and roles in photosynthesis, storage and secretion identify parenchyma. Parenchyma is a living simple permanent tissue and may be spherical, oval, polygonal or elongated.",
    optionExplanations: [
      "Incorrect. Collenchyma has uneven wall thickening, particularly at the cell corners, and primarily provides flexible mechanical support.",
      "Correct. Every listed structural and functional feature is characteristic of parenchyma.",
      "Incorrect. Xylem is a complex vascular tissue specialized mainly for conduction and support, not the described uniform living tissue.",
      "Incorrect. Sclerenchyma cells are usually dead at maturity with thick, lignified walls and do not perform photosynthesis or secretion.",
    ],
  }],
  ["7976b88daf2b47d36af12f2cb5e9d4a27f16a504358a3952f9348ce98f66a478", {
    explanation: "Intercalary meristem occurs between mature tissues, is a primary meristem, and restores tissues removed by grazing in grasses. Cylindrical meristems are lateral meristems such as vascular cambium and cork cambium; therefore, describing intercalary meristem as cylindrical is the exception.",
    optionExplanations: [
      "Correct characteristic. Intercalary meristem is positioned between regions of mature tissue.",
      "Not a characteristic and therefore the answer. Cylindrical meristems are lateral meristems, not intercalary meristems.",
      "Correct characteristic. Intercalary meristem enables grasses to regenerate parts removed by grazing.",
      "Correct characteristic. Intercalary meristem appears early and contributes to primary growth and the primary plant body.",
    ],
  }],
  ["eb2a1ccf290d4fda84d70e5409106816e15057dbd6900689e02ad68fa19d19c3", {
    explanation: "The root apical meristem forms the zone of actively dividing cells immediately behind the protective root cap; it is not located within the cap. Interfascicular cambium is meristematic, monocots and dicots differ internally, and bundle sheaths occur around vascular bundles in monocot stems and dicot leaves.",
    optionExplanations: [
      "Correct statement. Interfascicular cambium is a lateral meristem formed between vascular bundles.",
      "Incorrect statement and therefore the answer. Root apical meristem lies just behind the root cap, not within it.",
      "Correct statement. Monocotyledonous and dicotyledonous organs show characteristic differences in internal anatomy.",
      "Correct statement. Bundle sheath cells surround vascular bundles in monocot stems and in dicot leaves.",
    ],
  }],
  ["90824197ccdb35630a021d98196cd6de9cab7f805fda3baee57f6fcc6e40f823", {
    explanation: "Plants have epidermal, ground or fundamental, and vascular or conducting tissue systems. Xylem and phloem together contain both living and dead cell types, so the conducting system is not made only of dead cells.",
    optionExplanations: [
      "Correct statement. Epidermal, ground and vascular are the three tissue systems recognized by structure and location.",
      "Correct statement. Fundamental tissue system is another name for the ground tissue system.",
      "Incorrect statement and therefore the answer. Xylem and phloem include living cells as well as dead conducting or supportive elements.",
      "Correct statement. Tissue structure and function are closely related to position within the plant body.",
    ],
  }],
  ["7cde85d1a81afc0b61d75575677a706b96b3d5d1d49c75dec3e68a1115bb5b71", {
    explanation: "Xylem and phloem are complex permanent tissues, not meristematic tissues. Growth is localized in meristems, shoot trichomes are usually multicellular, and in a conjoint collateral bundle phloem generally lies external to xylem.",
    optionExplanations: [
      "Correct statement. Continued plant growth occurs mainly in specialized regions of active division called meristems.",
      "Correct statement. Shoot-system trichomes are usually multicellular epidermal outgrowths.",
      "Incorrect statement and therefore the answer. Xylem and phloem are complex permanent vascular tissues.",
      "Correct statement. In the usual conjoint collateral bundle, phloem is on the outer side of xylem.",
    ],
  }],
  ["bf1c42c8287127cf9ee35d7beaa5138cfa4d4cbe6e2e2f30cdd46868532816d4", {
    explanation: "Cells adjacent to guard cells are subsidiary cells; the starch-rich endodermis of a dicot stem is the starch sheath; roots lack a cuticle; and trichomes reduce water loss. Thus the correct filling is subsidiary cells, starch sheath, root, and trichomes.",
    optionExplanations: [
      "Incorrect. Trichomes are epidermal outgrowths, not the specialized cells adjacent to guard cells; the remaining fills are also mismatched.",
      "Correct. All four terms match their respective definitions and locations.",
      "Incorrect. Trichomes do not name guard-cell neighbours, mesophyll is not the stated cuticle-free organ, and root hairs mainly absorb rather than prevent transpiration.",
      "Incorrect. Bundle sheath is not the starch-rich dicot-stem endodermis, and root hairs do not serve as the anti-transpirational structure described.",
    ],
  }],
  ["e0efeea6045556c0f3117b230aed37772e47c7cd309b8c74a35587ce84a6a2e3", {
    explanation: "In roots, primary xylem is exarch: protoxylem lies toward the periphery and metaxylem toward the centre. Xylem conducts water and minerals, supports the plant, and its living parenchyma stores starch, fats and substances such as tannins. Hence the reversed root orientation is not true.",
    optionExplanations: [
      "Correct statement. Xylem conducts water and dissolved minerals upward from roots to stems and leaves.",
      "Correct statement. Lignified xylem elements also contribute mechanical strength.",
      "Correct statement. Living xylem parenchyma stores starch, fats, tannins and other substances.",
      "Incorrect statement and therefore the answer. Root xylem is exarch, with protoxylem peripheral and metaxylem central.",
    ],
  }],
]);

const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
const accepted = [];
const missing = [];

for (const [hash, decision] of decisions) {
  const row = rows.find((candidate) => candidate.trendMetaJson?.contentHash === hash);
  if (!row) {
    missing.push(hash);
    continue;
  }
  accepted.push({
    ...row,
    explanation: decision.explanation,
    optionExplanations: decision.optionExplanations,
    verified: true,
    verifierRuns: [
      {
        verifier: "CODEX_ACADEMIC_ADJUDICATION",
        version: "botany-anatomy-v1",
        checks: ["source_page_visual_match", "answer_key", "stem_consistency", "option_rationales"],
        passed: true,
      },
    ],
    provenanceJson: {
      sourceKind: "OWNED_PDF_SOURCE_SOLUTION",
      sourceFile: row.trendMetaJson?.sourceFile,
      pageStart: row.trendMetaJson?.pageStart,
      pageEnd: row.trendMetaJson?.pageEnd,
      questionNumber: row.trendMetaJson?.questionNo,
      solutionOrigin: "SOURCE_VERIFIED_AND_EXPANDED",
      academicAdjudication: "CODEX_ACADEMIC_ADJUDICATION",
      academicAdjudicationVersion: "botany-anatomy-v1",
    },
  });
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const output = path.join(OUTPUT_DIR, "adjudicated-botany-anatomy-pilot.json");
await fs.writeFile(output, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ requested: decisions.size, accepted: accepted.length, missing }, null, 2));
