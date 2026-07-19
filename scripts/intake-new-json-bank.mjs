import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { validateBankQuestion } = require("../src/lib/question-bank.ts");

const DEFAULT_SOURCE = "E:/projects/new-json";
const DEFAULT_OUTPUT = "data/bank-import/new-json-intake";
const MOJIBAKE = /\ufffd|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?/;
const PLACEHOLDER = /^(?:n\/?a|na|none|option\s*[a-d]|choice\s*[a-d]|answer|not available|undefined|null|-)$/i;
const GENERATOR_ARTIFACTS = [
  /\bapply the stated model\b/i,
  /\bai[_ -]?generated[_ -]?candidate\b/i,
  /\bgeneration batch\b/i,
  /\bprompt\b.*\bquestion bank\b/i,
];
const SYNTHETIC_CONTEXT = [
  /^In (?:photocell|vacuum-cell|surface-test) (?:trial|run) [A-Z][a-z]+,\s*/,
  /^In an? [^,]{1,90} (?:analysis|investigation|exercise|problem|task),\s*/i,
  /^During (?:an?|the) [^,]{1,150} (?:trial|test|check|study|demonstration|exercise|validation)(?:\s+(?:in|at|on|within)\s+[^,]{1,80})?,\s*/i,
  /^For an independent verification exercise,\s*/i,
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function walkJsonl(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkJsonl(fullPath)));
    else if (entry.isFile() && /\.jsonl$/i.test(entry.name)) files.push(fullPath);
  }
  return files.sort();
}

async function* jsonLines(filePath) {
  let row = 0;
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    row += 1;
    if (!line.trim()) continue;
    try {
      yield { row, value: JSON.parse(line) };
    } catch (error) {
      yield { row, error: error instanceof Error ? error.message : String(error), raw: line.slice(0, 500) };
    }
  }
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/(?<![\d.])-0(?:\.0+)?(?=\D|$)/g, (match) => match.slice(1))
    .replace(/[ \t]+/g, " ")
    .trim();
}

function capitalize(value) {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function repairMathText(value) {
  let text = cleanText(value);
  const actions = [];
  if (/^\\\(\([\s\S]*\\\)\\\)$/.test(text)) {
    text = text.replace(/\\\)\\\)$/, ")\\)");
    actions.push("REPAIRED_TUPLE_MATH_DELIMITERS");
  }
  let depth = 0;
  let changed = false;
  text = text.replace(/\\\(|\\\)/g, (token) => {
    if (token === "\\(") {
      if (depth === 1) {
        depth = 2;
        changed = true;
        return "";
      }
      depth = 1;
      return token;
    }
    if (depth === 2) {
      depth = 1;
      changed = true;
      return "";
    }
    if (depth === 1) depth = 0;
    return token;
  });
  if (changed) actions.push("REMOVED_NESTED_MATH_DELIMITERS");
  return { text, actions };
}

function repairQuestion(value) {
  let question = cleanText(value);
  const actions = [];
  const withoutTrailingGenerator = question.replace(/\s+Apply the stated model to [^.?!]+[.?!]?\s*$/i, "").trim();
  if (withoutTrailingGenerator !== question) {
    question = withoutTrailingGenerator;
    actions.push("REMOVED_GENERATOR_SUFFIX");
  }
  for (const pattern of SYNTHETIC_CONTEXT) {
    const repaired = question.replace(pattern, "").trim();
    if (repaired !== question) {
      question = capitalize(repaired);
      actions.push("REMOVED_SYNTHETIC_CONTEXT_WRAPPER");
      break;
    }
  }
  const withoutNamedRun = question.replace(
    /\s+in (?:photocell|photocathode|phototube|vacuum-cell|vacuum-tube|photoelectric|photoemission|retarding-field|surface-test) (?:trial|run) [A-Z][a-z]+/g,
    "",
  );
  if (withoutNamedRun !== question) {
    question = withoutNamedRun;
    actions.push("REMOVED_SYNTHETIC_RUN_LABEL");
  }
  return { question, actions };
}

function repairCapillaryExplanation(question, explanation) {
  const match = question.match(/water rises\s+([\d.]+)\s*cm[^.]{0,120}?radius\s+([\d.]+)\s*mm/i);
  if (!match || !/T=rho g r h\/2/i.test(explanation)) return { explanation, actions: [] };
  const heightMetres = Number(match[1]) / 100;
  const radiusMetres = Number(match[2]) / 1000;
  if (!Number.isFinite(heightMetres) || !Number.isFinite(radiusMetres)) return { explanation, actions: [] };
  const repaired = explanation.replace(
    /T=rho g r h\/2=1000\(9\.8\)\([\d.]+\)\([\d.]+\)\/2/i,
    `T=rho g r h/2=1000(9.8)(${radiusMetres})(${heightMetres})/2`,
  );
  return repaired === explanation
    ? { explanation, actions: [] }
    : { explanation: repaired, actions: ["CORRECTED_CAPILLARY_SUBSTITUTION_VALUES"] };
}

function repairKineticsVariables(question, values) {
  const variables = [...question.matchAll(/\[([A-Z])\]/g)].map((match) => match[1]);
  const unique = [...new Set(variables)];
  if (!unique.length || unique.length > 2) return { values, actions: [] };
  const questionVariables = new Set(unique);
  const replacements = new Map();
  if (!questionVariables.has("A")) replacements.set("A", unique[0]);
  if (!questionVariables.has("P")) replacements.set("P", unique[1] ?? unique[0]);
  if (!replacements.size) return { values, actions: [] };
  let changed = false;
  const repaired = values.map((value) => value.replace(/\[([AP])\]/g, (full, variable) => {
    const replacement = replacements.get(variable);
    if (!replacement || replacement === variable) return full;
    changed = true;
    return `[${replacement}]`;
  }));
  return { values: repaired, actions: changed ? ["ALIGNED_KINETICS_RATIONALE_VARIABLES"] : [] };
}

function normalize(value) {
  return cleanText(value)
    .toLocaleLowerCase("en")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=<>≡+\-*/|()[\]])\s*/g, "$1")
    .replace(/[^\p{L}\p{N}{}_^=<>≡+\-*/|()[\].]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unorderedIdentity(question, options) {
  return hash(`${normalize(question)}|${options.map(normalize).sort().join("|")}`);
}

function normalizeDifficulty(value) {
  const difficulty = cleanText(value).toUpperCase();
  if (["EASY", "SIMPLE"].includes(difficulty)) return "EASY";
  if (["MEDIUM", "MODERATE", "MID"].includes(difficulty)) return "MODERATE";
  if (["HARD", "TOUGH", "DIFFICULT"].includes(difficulty)) return "TOUGH";
  return null;
}

function solutionTemplate(value) {
  return normalize(value)
    .replace(/(?<![\p{L}])[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/giu, "<n>")
    .replace(/\b(?:aster|beryl|cedar|dune|ember|falcon|fjord|grove|harbor|iris|jasper|maple|solace|zenith)\b/g, "<name>");
}

function questionTemplate(value) {
  return normalize(value)
    .replace(/(?<![\p{L}])[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/giu, "<n>")
    .replace(/\b(?:aster|beryl|cedar|dune|ember|falcon|fjord|grove|harbor|indigo|iris|jasper|keystone|maple|marble|pearl|quartz|solace|timber|zenith)\b/g, "<name>");
}

function numericTokens(value) {
  return [...cleanText(value).matchAll(/(?<![\p{L}])[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/giu)]
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
}

function approximatelyEqual(a, b) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= scale * 0.002;
}

function hasNumericAnswerEvidence(row) {
  if (!['NUMERICAL', 'DATA_INTERPRETATION'].includes(cleanText(row.questionForm).toUpperCase())) return true;
  const optionNumbers = numericTokens(row.options[row.correctIndex]);
  if (!optionNumbers.length) return true;
  const evidenceNumbers = numericTokens(`${row.explanation} ${row.optionExplanations[row.correctIndex]}`);
  return optionNumbers.some((answer) => evidenceNumbers.some((evidence) => approximatelyEqual(answer, evidence)));
}

function hasMalformedMathDelimiters(values) {
  for (const value of values) {
    let depth = 0;
    for (const match of String(value).matchAll(/\\\(|\\\)/g)) {
      if (match[0] === "\\(") {
        if (depth !== 0) return true;
        depth += 1;
      } else {
        if (depth !== 1) return true;
        depth -= 1;
      }
    }
    if (depth !== 0) return true;
  }
  return false;
}

function repairAssertionReasonRationales(questionType, correctIndex, explanation, rationales) {
  if (cleanText(questionType).toUpperCase() !== "ASSERTION_REASON" || rationales.length !== 4 || rationales.every((value) => value.length >= 20)) {
    return { rationales, actions: [] };
  }
  const states = [
    "Both statements are true, and the reason correctly explains the assertion.",
    "Both statements are true, but the reason does not correctly explain the assertion.",
    "The assertion is true, but the reason is false.",
    "The assertion is false, but the reason is true.",
  ];
  const lower = explanation.toLowerCase();
  const direct = /directly explains|correct explanation|explains why/.test(lower) && !/does not explain|not the (?:correct )?explanation|separate consequences|unrelated/.test(lower);
  const replacements = states.map((state, index) => {
    if (index === correctIndex) return `${state} This matches the independently stated classification in the solution.`;
    if (correctIndex === 0 && index === 1) return "This is incorrect because the reason directly explains the assertion, rather than being merely associated with it.";
    if (correctIndex === 1 && index === 0) return "This is incorrect because both statements are true, but the reason does not establish the assertion as its explanation.";
    if ([0, 1].includes(correctIndex) && index === 2) return "This is incorrect because the reason is true; it cannot be classified as false.";
    if ([0, 1].includes(correctIndex) && index === 3) return "This is incorrect because the assertion is true; it cannot be classified as false.";
    if (correctIndex === 2 && index === 0) return "This is incorrect because the reason is false, so both statements cannot be true.";
    if (correctIndex === 2 && index === 1) return "This is incorrect because the reason is false, so the both-true classification cannot apply.";
    if (correctIndex === 2 && index === 3) return "This reverses the truth values: the assertion is true and the reason is false.";
    if (correctIndex === 3 && index === 0) return "This is incorrect because the assertion is false, so both statements cannot be true.";
    if (correctIndex === 3 && index === 1) return "This is incorrect because the assertion is false, so the both-true classification cannot apply.";
    if (correctIndex === 3 && index === 2) return "This reverses the truth values: the assertion is false and the reason is true.";
    return direct ? "This relationship does not match the truth values and causal link established in the solution." : "This relationship does not match the truth values established in the solution.";
  });
  return { rationales: replacements, actions: ["EXPANDED_ASSERTION_REASON_RATIONALES"] };
}

function repairShortCorrectRationale(correctIndex, explanation, rationales) {
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3 || rationales.length !== 4) return { rationales, actions: [] };
  if (rationales[correctIndex].length >= 20 || explanation.length < 25) return { rationales, actions: [] };
  const repaired = [...rationales];
  repaired[correctIndex] = `This option is correct because ${explanation}`;
  return { rationales: repaired, actions: ["EXPANDED_CORRECT_OPTION_RATIONALE"] };
}

function repairThinNumericalExplanation(questionType, correctIndex, options, explanation) {
  if (cleanText(questionType).toUpperCase() !== "NUMERICAL" || explanation.length >= 40 || explanation.length < 20) {
    return { explanation, actions: [] };
  }
  return {
    explanation: `${explanation} Substitution therefore gives ${options[correctIndex]}, matching the marked option.`,
    actions: ["EXPANDED_COMPACT_NUMERICAL_EXPLANATION"],
  };
}

function answerLetterContradiction(row) {
  const matches = [...row.explanation.matchAll(/\boption\s*\(?([A-D])\)?\s+is\s+(?:the\s+)?correct\b/gi)];
  if (!matches.length) return false;
  return matches.some((match) => match[1].toUpperCase().charCodeAt(0) - 65 !== row.correctIndex);
}

function assertionReasonContradiction(row) {
  if (cleanText(row.questionType).toUpperCase() !== "ASSERTION_REASON") return false;
  const explanation = row.explanation.toLowerCase();
  let expected = null;
  if (/both (?:the )?(?:assertion and reason|statements) are true/.test(explanation)) {
    expected = /(?:correct explanation|directly explains|explains the assertion)/.test(explanation) && !/not (?:the )?correct explanation|does not explain|unrelated/.test(explanation) ? 0 : 1;
  } else if (/assertion is true[^.]{0,80}reason is false/.test(explanation)) expected = 2;
  else if (/assertion is false[^.]{0,80}reason is true/.test(explanation)) expected = 3;
  return expected !== null && expected !== row.correctIndex;
}

function qualityScore(row) {
  return row.explanation.length + row.optionExplanations.reduce((sum, value) => sum + value.length, 0) + row.occurrences.length * 20;
}

function canonicalRecord(raw, sourceLocation) {
  const mathQuestion = repairMathText(raw.question);
  const repaired = repairQuestion(mathQuestion.text);
  const mathOptions = Array.isArray(raw.options) ? raw.options.map(repairMathText) : [];
  const options = mathOptions.map((entry) => entry.text);
  const mathExplanation = repairMathText(raw.explanation);
  let explanation = mathExplanation.text;
  const mathRationales = Array.isArray(raw.optionExplanations) ? raw.optionExplanations.map(repairMathText) : [];
  let optionExplanations = mathRationales.map((entry) => entry.text);
  const variableRepair = cleanText(raw.chapter) === "Chemical Kinetics"
    ? repairKineticsVariables(repaired.question, [explanation, ...optionExplanations])
    : { values: [explanation, ...optionExplanations], actions: [] };
  [explanation, ...optionExplanations] = variableRepair.values;
  const correctIndex = Number(raw.correctIndex);
  const capillaryRepair = repairCapillaryExplanation(repaired.question, explanation);
  explanation = capillaryRepair.explanation;
  const numericalRepair = repairThinNumericalExplanation(raw.questionType, correctIndex, options, explanation);
  explanation = numericalRepair.explanation;
  const assertionRepair = repairAssertionReasonRationales(raw.questionType, correctIndex, explanation, optionExplanations);
  optionExplanations = assertionRepair.rationales;
  const correctRationaleRepair = repairShortCorrectRationale(correctIndex, explanation, optionExplanations);
  optionExplanations = correctRationaleRepair.rationales;
  return {
    externalId: cleanText(raw.externalId) || null,
    subject: cleanText(raw.subject),
    classLevel: cleanText(raw.classLevel),
    chapter: cleanText(raw.chapter),
    topic: cleanText(raw.topic) || null,
    difficulty: normalizeDifficulty(raw.difficulty),
    questionForm: cleanText(raw.questionType) || null,
    question: repaired.question,
    options,
    correctIndex,
    explanation,
    optionExplanations,
    source: "AI",
    sourceRef: `User-supplied ChatGPT candidate (${cleanText(raw.externalId) || path.basename(sourceLocation.file)})`.slice(0, 240),
    verified: false,
    isDiagramBased: Boolean(raw.hasDiagram),
    isGraphBased: false,
    visualAssetUrl: cleanText(raw.imagePath) || null,
    occurrences: [sourceLocation],
    repairActions: [
      ...mathQuestion.actions,
      ...mathOptions.flatMap((entry) => entry.actions),
      ...mathExplanation.actions,
      ...mathRationales.flatMap((entry) => entry.actions),
      ...repaired.actions,
      ...variableRepair.actions,
      ...capillaryRepair.actions,
      ...numericalRepair.actions,
      ...assertionRepair.actions,
      ...correctRationaleRepair.actions,
    ],
    originalMetadata: {
      source: cleanText(raw.source) || null,
      verificationStatus: cleanText(raw.verificationStatus) || null,
      qualityStatus: cleanText(raw.qualityStatus) || null,
      eligibleForMock: raw.eligibleForMock === true,
      eligibleForPyq: raw.eligibleForPyq === true,
      generationBatch: raw.generationBatch ?? null,
    },
  };
}

function structuralReasons(row) {
  const reasons = [];
  if (!row.subject) reasons.push("MISSING_SUBJECT");
  if (!row.chapter) reasons.push("MISSING_CHAPTER");
  if (!row.difficulty) reasons.push("UNKNOWN_DIFFICULTY");
  if (row.question.length < 20) reasons.push("THIN_QUESTION");
  if (row.options.length !== 4 || row.options.some((option) => !option || PLACEHOLDER.test(option))) reasons.push("INVALID_OPTIONS");
  if (row.options.length === 4 && new Set(row.options.map(normalize)).size !== 4) reasons.push("DUPLICATE_OPTIONS");
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) reasons.push("INVALID_CORRECT_INDEX");
  const minimumExplanationLength = cleanText(row.questionForm).toUpperCase() === "NUMERICAL" ? 25 : 40;
  if (row.explanation.length < minimumExplanationLength) reasons.push("THIN_EXPLANATION");
  if (row.optionExplanations.length !== 4 || row.optionExplanations.some((value) => value.length < 20)) reasons.push("INCOMPLETE_OPTION_RATIONALES");
  const combined = [row.question, ...row.options, row.explanation, ...row.optionExplanations].join(" ");
  if (MOJIBAKE.test(combined)) reasons.push("UNREADABLE_OR_MOJIBAKE");
  if (GENERATOR_ARTIFACTS.some((pattern) => pattern.test(row.question))) reasons.push("GENERATOR_ARTIFACT_REMAINS");
  if (hasMalformedMathDelimiters([row.question, ...row.options, row.explanation, ...row.optionExplanations])) reasons.push("MALFORMED_NESTED_MATH_DELIMITERS");
  if (/reversible maximum-work path/i.test(combined) && /W_[A-Za-z]?\s*-\s*W_[A-Za-z]?\s*=\s*-/i.test(combined.replace(/\\/g, ""))) {
    reasons.push("REVERSIBLE_WORK_INVARIANT_CONTRADICTION");
  }
  if (row.isDiagramBased && !row.visualAssetUrl) reasons.push("MISSING_REQUIRED_VISUAL");
  if (!hasNumericAnswerEvidence(row)) reasons.push("ANSWER_NOT_SUPPORTED_BY_SOLUTION_NUMBERS");
  if (answerLetterContradiction(row)) reasons.push("ANSWER_LETTER_CONTRADICTION");
  if (assertionReasonContradiction(row)) reasons.push("ASSERTION_REASON_CONTRADICTION");
  return reasons;
}

function addCount(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function sortCounts(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(String(args.source || DEFAULT_SOURCE));
  const outputDir = path.resolve(String(args.out || DEFAULT_OUTPUT));
  await mkdir(outputDir, { recursive: true });
  const files = await walkJsonl(sourceRoot);
  const parseFailures = [];
  const appearances = [];

  for (const file of files) {
    const relativeFile = path.relative(sourceRoot, file).replaceAll("\\", "/");
    for await (const item of jsonLines(file)) {
      if (item.error) parseFailures.push({ file: relativeFile, row: item.row, error: item.error, raw: item.raw });
      else appearances.push(canonicalRecord(item.value, { file: relativeFile, row: item.row }));
    }
  }

  const groups = new Map();
  for (const row of appearances) {
    const key = unorderedIdentity(row.question, row.options);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const candidates = [];
  const quarantined = [];
  const conflictGroups = new Set();
  for (const [identity, group] of groups) {
    const answerTexts = new Set(group.map((row) => normalize(row.options[row.correctIndex])));
    const selected = group.sort((a, b) => qualityScore(b) - qualityScore(a))[0];
    selected.occurrences = group.flatMap((row) => row.occurrences);
    selected.repairActions = [...new Set(group.flatMap((row) => row.repairActions))].sort();
    if (answerTexts.size !== 1) {
      conflictGroups.add(identity);
      quarantined.push({ ...selected, quarantineReasons: ["DUPLICATE_GROUP_ANSWER_CONFLICT"], conflictingAnswers: [...answerTexts] });
      continue;
    }
    const reasons = structuralReasons(selected);
    const validated = validateBankQuestion(selected, false);
    if (!validated.question) reasons.push(`BANK_VALIDATOR: ${validated.reason ?? "unknown"}`);
    if (reasons.length) quarantined.push({ ...selected, quarantineReasons: [...new Set(reasons)].sort() });
    else candidates.push({ ...validated.question, externalId: selected.externalId, occurrences: selected.occurrences, repairActions: selected.repairActions, originalMetadata: selected.originalMetadata });
  }

  const templates = new Map();
  for (const row of candidates) {
    const templateHash = hash(`${row.subject}|${row.chapter}|${questionTemplate(row.question)}|${solutionTemplate(row.explanation)}`);
    if (!templates.has(templateHash)) templates.set(templateHash, []);
    templates.get(templateHash).push(row);
  }

  const acceptedStream = createWriteStream(path.join(outputDir, "structurally-admissible-unverified.jsonl"), { encoding: "utf8" });
  const quarantineStream = createWriteStream(path.join(outputDir, "quarantine.jsonl"), { encoding: "utf8" });
  const sampleStream = createWriteStream(path.join(outputDir, "semantic-review-representatives.jsonl"), { encoding: "utf8" });
  const chapterAccepted = {};
  const chapterQuarantined = {};
  const templateSizes = {};

  for (const [templateHash, rows] of templates) {
    rows.sort((a, b) => b.explanation.length - a.explanation.length || a.contentHash.localeCompare(b.contentHash));
    addCount(templateSizes, rows.length === 1 ? "1" : rows.length <= 5 ? "2-5" : rows.length <= 10 ? "6-10" : rows.length <= 25 ? "11-25" : "26+");
    await writeLine(sampleStream, { templateHash, clusterSize: rows.length, representative: rows[0] });
    for (const row of rows) {
      addCount(chapterAccepted, `${row.subject} | ${row.chapter}`);
      await writeLine(acceptedStream, {
        ...row,
        duplicateClusterId: rows.length > 1 ? `ai-template-${templateHash.slice(0, 24)}` : null,
        verified: false,
        provenanceJson: {
          sourceKind: "AI_GENERATED_USER_SUPPLIED",
          originalExternalId: row.externalId,
          occurrences: row.occurrences,
          repairActions: row.repairActions,
          structuralAudit: "new-json-intake-v1",
          semanticVerificationRequired: true,
          eligibleForPyq: false,
        },
      });
    }
  }
  for (const row of quarantined) {
    addCount(chapterQuarantined, `${row.subject || "Unknown"} | ${row.chapter || "Unknown"}`);
    await writeLine(quarantineStream, row);
  }
  await Promise.all([close(acceptedStream), close(quarantineStream), close(sampleStream)]);

  const reasonCounts = {};
  for (const row of quarantined) for (const reason of row.quarantineReasons) addCount(reasonCounts, reason);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    outputDir,
    files: files.length,
    appearances: appearances.length,
    parseFailures: parseFailures.length,
    uniqueAfterMerge: groups.size,
    duplicateAppearancesRemoved: appearances.length - groups.size,
    duplicateAnswerConflictGroups: conflictGroups.size,
    structurallyAdmissibleUnverified: candidates.length,
    quarantined: quarantined.length,
    templateClusters: templates.size,
    parameterOrTemplateVariants: candidates.length - templates.size,
    templateSizeDistribution: sortCounts(templateSizes),
    acceptedByChapter: sortCounts(chapterAccepted),
    quarantinedByChapter: sortCounts(chapterQuarantined),
    quarantineReasons: sortCounts(reasonCounts),
    policy: {
      sourceStoredAs: "AI",
      eligibleForPyq: false,
      verifiedOnImport: false,
      databaseWrites: 0,
      note: "Structural admission is not independent academic verification. Promotion to VERIFIED_STRICT requires a separate blind academic solve.",
    },
  };
  await Promise.all([
    writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDir, "parse-failures.json"), `${JSON.stringify(parseFailures, null, 2)}\n`, "utf8"),
  ]);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
