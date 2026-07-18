import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { canonicalizeChapter, normalizeSubject } = require("../src/data/syllabus/neet-chapters.ts");
const { cleanQuestionText, isPlaceholderText } = require("../src/lib/text-cleanup.ts");

const DEFAULT_SOURCE = "E:/projects/json files";
const DEFAULT_OUTPUT_ROOT = "E:/projects/json files cleaned";
const QUESTION_KEYS = ["question", "question_text"];
const ANSWER_KEYS = [
  "correctIndex",
  "correct_index",
  "correct_option",
  "correctOption",
  "correct_answer",
  "correctAnswer",
  "correct_option_text",
  "answer",
  "answer_text",
];
const SOURCE_KEYS = ["source", "source_type", "source_category", "sourceType", "source_label"];
const SOURCE_NOTE_KEYS = [
  "source_status",
  "source_note",
  "source_authenticity_note",
  "authenticity_note",
  "source_exactness",
  "source_authenticity",
  "sourceRef",
];
const STRUCTURAL_REASONS = new Set([
  "UNKNOWN_SUBJECT",
  "UNKNOWN_CHAPTER",
  "INVALID_OPTIONS",
  "DUPLICATE_OPTIONS",
  "UNRESOLVED_ANSWER",
  "ANSWER_FIELD_CONFLICT",
  "DUPLICATE_GROUP_ANSWER_CONFLICT",
  "MISSING_EXPLANATION",
  "REMAINING_UNREADABLE_TEXT",
  "REMAINING_MALFORMED_MATH",
]);
const GENERATOR_BOILERPLATE = [
  /\bdigital question[- ]bank\b/i,
  /\bteacher-led discussion\b/i,
  /\brapid-fire (?:quiz|round)\b/i,
  /\bstandard textbook-based MCQ drill\b/i,
  /\bsingle-correct MCQ round\b/i,
  /\bwhile revising high-yield\b/i,
  /\btest item labelled setup\s+\d+\b/i,
];
const CP1252_TO_BYTE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86],
  [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
  [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

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

async function walkJsonFiles(root) {
  const output = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await walkJsonFiles(fullPath)));
    else if (entry.isFile() && /\.json$/i.test(entry.name)) output.push(fullPath);
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function collectArrays(value, depth = 0) {
  if (Array.isArray(value)) return [value];
  if (!value || typeof value !== "object" || depth >= 2) return [];
  return Object.values(value).flatMap((child) => collectArrays(child, depth + 1));
}

function valueAsText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["text", "value", "label", "content", "option", "answer", "body", "statement", "name"]) {
      if (typeof value[key] === "string" || typeof value[key] === "number") return String(value[key]);
    }
  }
  return String(value ?? "");
}

function mojibakeScore(value) {
  return (String(value).match(/[\ufffd\u00c2\u00c3\u00e2\u00ce\u00cf\u0080-\u009f]/g) ?? []).length;
}

function decodeMojibakePass(value) {
  let output = "";
  let bytes = [];
  let chunkOriginal = "";
  const flush = () => {
    if (!bytes.length) return;
    const decoded = Buffer.from(bytes).toString("utf8");
    output += decoded.includes("\ufffd") || mojibakeScore(decoded) >= mojibakeScore(chunkOriginal) ? chunkOriginal : decoded;
    bytes = [];
    chunkOriginal = "";
  };
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      chunkOriginal += character;
    } else if (CP1252_TO_BYTE.has(codePoint)) {
      bytes.push(CP1252_TO_BYTE.get(codePoint));
      chunkOriginal += character;
    }
    else {
      flush();
      output += character;
    }
  }
  flush();
  return output;
}

function repairMojibake(value, actions) {
  let text = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const beforeScore = mojibakeScore(text);
    if (beforeScore === 0) break;
    const decoded = decodeMojibakePass(text);
    if (!decoded || mojibakeScore(decoded) >= beforeScore) break;
    text = decoded;
    actions.add("REPAIRED_UTF8_MOJIBAKE");
  }
  return text;
}

function repairMathMarkup(value, actions) {
  let text = value;
  const replacements = [
    [/\text(?=\s*\{)/g, "\\text"],
    [/\frac(?=\s*\{)/g, "\\frac"],
    [/\theta\b/g, "\\theta"],
    [/\times\b/g, "\\times"],
    [/\x08egin(?=\s*\{)/g, "\\begin"],
    [/\x08eta\b/g, "\\beta"],
    [/\right\b/g, "\\right"],
    [/(^|[^\\\p{L}])rac(?=\s*\{)/gu, "$1\\frac"],
    [/(^|[^\\\p{L}])ext(?=\s*\{)/gu, "$1\\text"],
    [/\\pi\s*arepsilon\b/g, "\\pi\\varepsilon"],
    [/(^|[^\\\p{L}])arepsilon(?=\s*[_^{])/gu, "$1\\varepsilon"],
  ];
  for (const [pattern, replacement] of replacements) {
    const repaired = text.replace(pattern, replacement);
    if (repaired !== text) actions.add("REPAIRED_MATH_MARKUP");
    text = repaired;
  }
  return text;
}

function stripNonSemanticLabels(value, actions) {
  let text = value;
  const replacements = [
    [/^\s*\[(?:Institute test-series style|Platform practice style|NCERT-based|AI original|NEET-style single-correct|JEE Main-style single-correct|Previous-year style single-correct)\]\s*/i, ""],
    [/\s*\[(?:Variant|Question code|Item code)\s+[A-Z0-9_-]+\]\s*$/i, ""],
    [/\s*\n?Scenario code:\s*[A-Z0-9_-]+\.?\s*$/i, ""],
    [/^\s*In an? [\p{L}\p{N} -]+ test item labelled setup\s+\d+,\s*/iu, ""],
    [/^\s*Previous-year style single-correct:\s*/i, ""],
    [/^\s*During a teacher-led discussion(?: on [^,]+)?,\s*/i, ""],
    [/^\s*In a standard textbook-based MCQ drill,\s*/i, ""],
    [/^\s*In a digital question-bank review,\s*/i, ""],
    [/^\s*In a single-correct MCQ round,\s*/i, ""],
    [/^\s*While revising high-yield NCERT examples,\s*/i, ""],
    [/^\s*While revising high-yield examples,\s*/i, ""],
    [/^\s*A student is asked:\s*/i, ""],
  ];
  for (const [pattern, replacement] of replacements) {
    const repaired = text.replace(pattern, replacement);
    if (repaired !== text) actions.add("REMOVED_NON_SEMANTIC_GENERATOR_LABEL");
    text = repaired;
  }
  return text.replace(/^([a-z])/, (letter) => letter.toUpperCase());
}

function repairText(value, actions, { question = false } = {}) {
  let text = valueAsText(value);
  text = repairMojibake(text, actions);
  text = repairMathMarkup(text, actions);
  if (question) text = stripNonSemanticLabels(text, actions);
  return cleanQuestionText(text).normalize("NFC");
}

function firstRepairedText(row, keys, actions, options) {
  for (const key of keys) {
    if (row[key] === undefined || row[key] === null) continue;
    const text = repairText(row[key], actions, options);
    if (text) return text;
  }
  return "";
}

function optionArray(row, actions) {
  let raw;
  if (Array.isArray(row.options)) raw = row.options;
  else if (row.options && typeof row.options === "object") raw = ["A", "B", "C", "D"].map((key) => row.options[key] ?? row.options[key.toLowerCase()]);
  else raw = [row.optionA, row.optionB, row.optionC, row.optionD];
  return raw.map((option) => repairText(option, actions));
}

function optionRationales(row, actions) {
  const raw = row.optionExplanations ?? row.option_explanations ?? row.option_rationales;
  return Array.isArray(raw) ? raw.map((entry) => repairText(entry, actions)) : [];
}

function normalizeIdentity(value) {
  return cleanQuestionText(value)
    .toLocaleLowerCase("en")
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/[^\p{L}\p{N}{}_^=+\-*/|()[\].]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contentIdentity(question, options) {
  return sha256(`${normalizeIdentity(question)}|${options.map(normalizeIdentity).join("|")}`);
}

function matchOption(value, options, actions) {
  const normalized = normalizeIdentity(repairText(value, actions));
  if (!normalized) return null;
  const matches = options.map(normalizeIdentity).map((option, index) => ({ option, index })).filter((entry) => entry.option === normalized);
  return matches.length === 1 ? matches[0].index : null;
}

function parseAnswerValue(key, value, options, actions) {
  if (key === "correctIndex" || key === "correct_index") {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 3) return numeric;
  }
  const optionMatch = matchOption(value, options, actions);
  if (optionMatch !== null) return optionMatch;
  const text = repairText(value, actions).toUpperCase();
  if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  const letter = text.match(/^(?:CORRECT\s+)?OPTION\s*[\[(]?\s*([A-D])\s*[\])]?(?:\s|$)/);
  if (letter) return letter[1].charCodeAt(0) - 65;
  const numeric = Number(text);
  if (!["correctIndex", "correct_index"].includes(key) && Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) return numeric - 1;
  return null;
}

function resolveAnswer(row, options, actions) {
  const candidates = [];
  for (const key of ANSWER_KEYS) {
    if (row[key] === undefined || row[key] === null || valueAsText(row[key]).trim() === "") continue;
    const index = parseAnswerValue(key, row[key], options, actions);
    candidates.push({ key, rawValue: valueAsText(row[key]), resolvedIndex: index });
  }
  const indexes = [...new Set(candidates.map((entry) => entry.resolvedIndex).filter((entry) => entry !== null))];
  if (indexes.length <= 1) return { correctIndex: indexes[0] ?? null, conflict: false, repairedConflict: false, repairBasis: null, candidates };

  const preferredKeys = ["answer_text", "correct_option_text", "correct_answer", "correctAnswer", "answer"];
  const preferred = preferredKeys
    .map((key) => candidates.find((candidate) => candidate.key === key && candidate.resolvedIndex !== null))
    .find(Boolean);
  if (preferred) {
    actions.add("REPAIRED_CONFLICTING_ANSWER_FIELD");
    return {
      correctIndex: preferred.resolvedIndex,
      conflict: false,
      repairedConflict: true,
      repairBasis: `preferred exact-match field: ${preferred.key}`,
      candidates,
    };
  }
  return { correctIndex: null, conflict: true, repairedConflict: false, repairBasis: null, candidates };
}

function isQuestionLike(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const hasQuestion = QUESTION_KEYS.some((key) => valueAsText(row[key]).trim());
  const rawOptions = Array.isArray(row.options)
    ? row.options
    : row.options && typeof row.options === "object"
      ? Object.values(row.options)
      : [row.optionA, row.optionB, row.optionC, row.optionD];
  return hasQuestion && rawOptions.filter((entry) => valueAsText(entry).trim()).length >= 2;
}

function inferClassLevel(row, filePath, actions) {
  const text = repairText(row.classLevel ?? row.class ?? row.class_level ?? row.className ?? filePath, actions).toLowerCase();
  if (/\b12\b|class[_ -]?12/.test(text)) return "12";
  if (/\b11\b|class[_ -]?11/.test(text)) return "11";
  return null;
}

function inferSubject(row, filePath, actions) {
  const direct = normalizeSubject(repairText(row.subject, actions));
  if (direct && direct !== "Biology") return direct;
  const discriminator = `${repairText(row.subchapter_label, actions)} ${filePath}`.toLowerCase();
  if (/zoology|structural.organisation.in.animals|human.reproduction|reproductive.health|human.health|breathing|body.fluids|excretory|locomotion|neural|chemical.coordination|evolution|biotechnology/.test(discriminator)) return "Zoology";
  if (/botany|plant|living.world|biological.classification|morphology|anatomy|photosynthesis|respiration|ecosystem|biodiversity|microbes|inheritance|cell/.test(discriminator)) return "Botany";
  if (/physics|\bphy\b/.test(discriminator)) return "Physics";
  if (/chemistry|\bchem\b/.test(discriminator)) return "Chemistry";
  return null;
}

function normalizeDifficulty(value, actions) {
  const difficulty = repairText(value, actions).toUpperCase();
  if (["EASY", "SIMPLE"].includes(difficulty)) return "EASY";
  if (["MODERATE", "MEDIUM", "MID"].includes(difficulty)) return "MODERATE";
  if (["TOUGH", "HARD", "DIFFICULT", "MEDIUM-HARD", "MODERATE-HARD"].includes(difficulty)) return "TOUGH";
  return null;
}

function hasVisualClaim(row) {
  return Boolean(
    row.diagram_based || row.diagram_required || row.isDiagramBased || row.isGraphBased || row.has_diagram_or_graphical_context ||
      row.diagram_or_graph_based || row.is_graphical_or_diagram_based || row.diagram_description || row.diagram_context || row.visual_prompt || row.diagram_prompt,
  );
}

function visualAsset(row, actions) {
  return firstRepairedText(row, ["visualAssetUrl", "visual_asset_url", "imageUrl", "image_url", "assetPath", "asset_path"], actions) || null;
}

function provenance(row, actions) {
  const source = firstRepairedText(row, SOURCE_KEYS, actions).toUpperCase();
  const note = firstRepairedText(row, SOURCE_NOTE_KEYS, actions);
  const combined = `${source} ${note}`;
  const official = Boolean(
    row.provenanceJson && typeof row.provenanceJson === "object" && row.provenanceJson.officialKeyVerified === true &&
      row.provenanceJson.paperUrl && row.provenanceJson.answerKeyUrl,
  );
  if (/FALLBACK|STYLE|ORIGINAL|GENERATED|NOT CLAIMED|NOT COPIED|NOT VERBATIM/i.test(combined)) return "ORIGINAL_OR_GENERATED";
  if (/NEET[_ ]?PYQ|AIPMT/i.test(source)) return official ? "OFFICIAL_NEET_PYQ" : "UNVERIFIED_NEET_PYQ_CLAIM";
  if (/JEE[_ ]?PYQ/i.test(source)) return official ? "OFFICIAL_JEE_PYQ" : "UNVERIFIED_JEE_PYQ_CLAIM";
  if (/NCERT/i.test(source)) return "NCERT_ALIGNED_UNVERIFIED";
  if (/INSTITUTE|ALLEN|AAKASH|AKASH|PHYSICS.?WALLAH|\bPW\b|MOTION/i.test(source)) return "COACHING_STYLE_UNLICENSED";
  return "ORIGINAL_OR_GENERATED";
}

function hasUnreadable(value) {
  return /\ufffd|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?/.test(String(value));
}

function hasMalformedMath(value) {
  return /\b(?:rac|ext|egin)\s*\{|\b(?:heta|imes|ight)\b/.test(String(value));
}

function repairStatus(reasons, visualClaim, asset) {
  if ([...reasons].some((reason) => STRUCTURAL_REASONS.has(reason))) return "QUARANTINED_STRUCTURE";
  if (visualClaim && !asset) return "QUARANTINED_VISUAL";
  return "NEEDS_EXPERT_REVIEW";
}

function addCount(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function closeStream(stream) {
  stream.end();
  await once(stream, "finish");
}

function buildRecord(row, filePath, rowNumber, sourceRoot) {
  const actions = new Set();
  const question = firstRepairedText(row, QUESTION_KEYS, actions, { question: true });
  const options = optionArray(row, actions);
  const explanation = firstRepairedText(row, ["explanation", "solution", "reason"], actions);
  const rationales = optionRationales(row, actions);
  const answer = resolveAnswer(row, options, actions);
  const subject = inferSubject(row, filePath, actions);
  const rawChapter = repairText(row.chapter, actions);
  const canonicalChapter = subject ? canonicalizeChapter(subject, rawChapter) : null;
  const inferredClassLevel = inferClassLevel(row, filePath, actions);
  const visualClaim = hasVisualClaim(row);
  const asset = visualAsset(row, actions);
  const reasons = new Set();

  if (!subject) reasons.add("UNKNOWN_SUBJECT");
  if (!canonicalChapter) reasons.add("UNKNOWN_CHAPTER");
  if (canonicalChapter && inferredClassLevel && canonicalChapter.classLevel !== inferredClassLevel) reasons.add("CLASS_CHAPTER_MISMATCH");
  if (options.length !== 4 || options.some(isPlaceholderText)) reasons.add("INVALID_OPTIONS");
  if (new Set(options.map(normalizeIdentity)).size !== 4) reasons.add("DUPLICATE_OPTIONS");
  if (answer.conflict) reasons.add("ANSWER_FIELD_CONFLICT");
  else if (answer.correctIndex === null) reasons.add("UNRESOLVED_ANSWER");
  if (answer.repairedConflict) reasons.add("ANSWER_FIELD_CONFLICT_REPAIRED");
  if (!explanation) reasons.add("MISSING_EXPLANATION");
  else if (explanation.length < 25) reasons.add("THIN_EXPLANATION");
  if (rationales.length !== 4 || rationales.some((entry) => entry.length < 8)) reasons.add("MISSING_OPTION_RATIONALES");
  if (visualClaim && !asset) reasons.add("MISSING_VISUAL_ASSET");
  if (GENERATOR_BOILERPLATE.some((pattern) => pattern.test(question))) reasons.add("GENERATOR_BOILERPLATE");
  if (hasUnreadable([question, options, explanation, rationales].flat().join(" "))) reasons.add("REMAINING_UNREADABLE_TEXT");
  if (hasMalformedMath([question, options, explanation, rationales].flat().join(" "))) reasons.add("REMAINING_MALFORMED_MATH");
  if (!normalizeDifficulty(row.difficulty, actions)) reasons.add("UNKNOWN_DIFFICULTY");
  const provenanceClass = provenance(row, actions);
  if (provenanceClass.startsWith("UNVERIFIED_")) reasons.add("UNVERIFIED_PYQ_PROVENANCE");
  if (provenanceClass === "COACHING_STYLE_UNLICENSED") reasons.add("UNLICENSED_INSTITUTE_CLAIM");
  reasons.add("NEEDS_SUBJECT_MATTER_VERIFICATION");

  const identity = contentIdentity(question, options);
  return {
    canonicalId: `QB-${identity.slice(0, 24)}`,
    contentHash: identity,
    sourceLocation: { file: path.relative(sourceRoot, filePath).replaceAll("\\", "/"), row: rowNumber },
    originalId: repairText(row.id, actions) || null,
    subject,
    classLevel: canonicalChapter?.classLevel ?? inferredClassLevel,
    chapter: canonicalChapter?.chapter ?? rawChapter,
    chapterKey: canonicalChapter ? `${canonicalChapter.slug}:${canonicalChapter.classLevel}:${normalizeIdentity(canonicalChapter.chapter).replaceAll(" ", "-")}` : null,
    topic: repairText(row.topic ?? row.tags?.[0] ?? row.question_type, actions) || null,
    difficulty: normalizeDifficulty(row.difficulty, actions),
    questionForm: repairText(row.questionForm ?? row.question_type, actions) || null,
    question,
    options,
    correctIndex: answer.correctIndex,
    correctOption: answer.correctIndex === null ? null : options[answer.correctIndex],
    explanation,
    optionExplanations: rationales,
    answerEvidence: answer.candidates,
    answerRepairBasis: answer.repairBasis,
    visual: { required: visualClaim, asset },
    provenance: {
      classification: provenanceClass,
      sourceLabel: firstRepairedText(row, SOURCE_KEYS, actions) || null,
      sourceNote: firstRepairedText(row, SOURCE_NOTE_KEYS, actions) || null,
    },
    repair: {
      actions: [...actions].sort(),
      reasons: [...reasons].sort(),
      status: repairStatus(reasons, visualClaim, asset),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(String(args.source || DEFAULT_SOURCE));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.resolve(String(args.out || path.join(DEFAULT_OUTPUT_ROOT, `corpus-${timestamp}`)));
  await mkdir(path.dirname(outputDir), { recursive: true });
  await mkdir(outputDir, { recursive: false });

  const allStream = createWriteStream(path.join(outputDir, "all-question-appearances.jsonl"), { encoding: "utf8", flags: "wx" });
  const files = await walkJsonFiles(sourceRoot);
  const unique = new Map();
  const failures = [];
  const counts = { files: files.length, parsedFiles: 0, parseFailures: 0, appearancesRead: 0, appearancesWritten: 0, uniqueQuestions: 0, duplicateAppearances: 0 };
  const repairActions = {};
  const repairReasons = {};
  const statuses = {};
  const subjects = {};

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const filePath = files[fileIndex];
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      counts.parsedFiles += 1;
      for (const array of collectArrays(parsed)) {
        for (let rowIndex = 0; rowIndex < array.length; rowIndex += 1) {
          const row = array[rowIndex];
          if (!isQuestionLike(row)) continue;
          counts.appearancesRead += 1;
          const record = buildRecord(row, filePath, rowIndex, sourceRoot);
          const existing = unique.get(record.contentHash);
          const appearance = { ...record, duplicateOf: existing ? existing.record.canonicalId : null };
          await writeLine(allStream, appearance);
          counts.appearancesWritten += 1;
          if (existing) {
            existing.sourceLocations.push(record.sourceLocation);
            existing.occurrences += 1;
            for (const candidate of record.answerEvidence) existing.answerEvidence.push({ ...candidate, sourceLocation: record.sourceLocation });
            if (record.correctIndex !== null) existing.resolvedIndexes.add(record.correctIndex);
            existing.hasAnswerConflict ||= record.repair.reasons.includes("ANSWER_FIELD_CONFLICT");
          } else {
            unique.set(record.contentHash, {
              record: { ...record },
              sourceLocations: [record.sourceLocation],
              occurrences: 1,
              answerEvidence: [...record.answerEvidence],
              resolvedIndexes: new Set(record.correctIndex === null ? [] : [record.correctIndex]),
              hasAnswerConflict: record.repair.reasons.includes("ANSWER_FIELD_CONFLICT"),
            });
          }
          for (const action of record.repair.actions) addCount(repairActions, action);
          for (const reason of record.repair.reasons) addCount(repairReasons, reason);
          addCount(statuses, record.repair.status);
          addCount(subjects, record.subject ?? "UNKNOWN");
        }
      }
    } catch (error) {
      counts.parseFailures += 1;
      failures.push({ file: filePath, error: error instanceof Error ? error.message : String(error) });
    }
    if ((fileIndex + 1) % 250 === 0) console.log(`processed ${fileIndex + 1}/${files.length} files (${counts.appearancesWritten} appearances)...`);
  }
  await closeStream(allStream);

  counts.uniqueQuestions = unique.size;
  counts.duplicateAppearances = counts.appearancesWritten - unique.size;
  const queueNames = ["canonical-unique", "answer-verification", "structural-repair", "rationale-enrichment", "visual-assets", "content-review"];
  const streams = Object.fromEntries(queueNames.map((name) => [name, createWriteStream(path.join(outputDir, `${name}.jsonl`), { encoding: "utf8", flags: "wx" })]));
  const queueCounts = Object.fromEntries(queueNames.map((name) => [name, 0]));
  const uniqueRepairReasons = {};
  const uniqueStatuses = {};

  for (const entry of unique.values()) {
    const resolvedIndexes = [...entry.resolvedIndexes].sort();
    const duplicateAnswerConflict = resolvedIndexes.length > 1;
    const reasons = new Set(entry.record.repair.reasons);
    if (duplicateAnswerConflict) reasons.add("DUPLICATE_GROUP_ANSWER_CONFLICT");
    const canonicalCorrectIndex = entry.hasAnswerConflict || duplicateAnswerConflict ? null : entry.record.correctIndex;
    const record = {
      ...entry.record,
      correctIndex: canonicalCorrectIndex,
      correctOption: canonicalCorrectIndex === null ? null : entry.record.options[canonicalCorrectIndex],
      repair: {
        ...entry.record.repair,
        reasons: [...reasons].sort(),
        status: repairStatus(reasons, entry.record.visual.required, entry.record.visual.asset),
      },
      occurrences: entry.occurrences,
      sourceLocations: entry.sourceLocations,
      answerEvidence: entry.answerEvidence,
    };
    await writeLine(streams["canonical-unique"], record);
    queueCounts["canonical-unique"] += 1;
    for (const reason of reasons) addCount(uniqueRepairReasons, reason);
    addCount(uniqueStatuses, record.repair.status);
    if (reasons.has("ANSWER_FIELD_CONFLICT") || reasons.has("ANSWER_FIELD_CONFLICT_REPAIRED") || reasons.has("UNRESOLVED_ANSWER") || reasons.has("DUPLICATE_GROUP_ANSWER_CONFLICT")) {
      await writeLine(streams["answer-verification"], record);
      queueCounts["answer-verification"] += 1;
    }
    if ([...reasons].some((reason) => STRUCTURAL_REASONS.has(reason))) {
      await writeLine(streams["structural-repair"], record);
      queueCounts["structural-repair"] += 1;
    }
    if (reasons.has("MISSING_OPTION_RATIONALES") || reasons.has("THIN_EXPLANATION") || reasons.has("MISSING_EXPLANATION")) {
      await writeLine(streams["rationale-enrichment"], record);
      queueCounts["rationale-enrichment"] += 1;
    }
    if (reasons.has("MISSING_VISUAL_ASSET")) {
      await writeLine(streams["visual-assets"], record);
      queueCounts["visual-assets"] += 1;
    }
    if (reasons.has("GENERATOR_BOILERPLATE") || reasons.has("NEEDS_SUBJECT_MATTER_VERIFICATION") || reasons.has("UNVERIFIED_PYQ_PROVENANCE")) {
      await writeLine(streams["content-review"], record);
      queueCounts["content-review"] += 1;
    }
  }
  await Promise.all(Object.values(streams).map(closeStream));

  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    outputDir,
    policy: {
      originalsModified: false,
      questionsDeleted: false,
      allAppearancesRetained: true,
      ambiguousAnswersInvented: false,
      missingRationalesInvented: false,
      duplicatesRetainedWithCanonicalGrouping: true,
      unverifiedPyqPromoted: false,
    },
    counts,
    queues: queueCounts,
    repairActions: sortedRecord(repairActions),
    repairReasons: sortedRecord(repairReasons),
    statuses: sortedRecord(statuses),
    uniqueRepairReasons: sortedRecord(uniqueRepairReasons),
    uniqueStatuses: sortedRecord(uniqueStatuses),
    subjects: sortedRecord(subjects),
    parseFailures: failures,
  };
  const reportPath = path.join(outputDir, "cleaning-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
