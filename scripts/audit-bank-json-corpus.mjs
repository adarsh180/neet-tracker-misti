import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" },
});

const { canonicalizeChapter, normalizeSubject } = require("../src/data/syllabus/neet-chapters.ts");
const { cleanQuestionOptions, cleanQuestionText, hasUnreadableText, isPlaceholderText } = require("../src/lib/text-cleanup.ts");

const DEFAULT_SOURCE = "E:/projects/json files";
const DEFAULT_REPORT_DIR = "data/bank-import/reports";
const SAMPLE_LIMIT = 40;

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
];
const GENERATOR_BOILERPLATE = [
  /\bdigital question[- ]bank\b/i,
  /\bteacher-led discussion\b/i,
  /\brapid-fire (?:quiz|round)\b/i,
  /\bpractice sheet\b/i,
  /\bstandard textbook-based MCQ drill\b/i,
  /\bsingle-correct MCQ round\b/i,
  /^previous-year style single-correct\s*:/i,
  /\bwhile revising high-yield\b/i,
];
const chapterCache = new Map();

function hasMangledMathMarkup(value) {
  if (Array.isArray(value)) return value.some(hasMangledMathMarkup);
  if (value && typeof value === "object") return Object.values(value).some(hasMangledMathMarkup);
  if (typeof value !== "string") return false;
  return (
    /\text\s*\{|\frac\s*\{|\theta\b|\times\b|\x08egin\s*\{|\x08eta\b|\right\b|\nu\b/.test(value) ||
    /\b(?:ext|rac|egin)\s*\{|\b(?:heta|imes|ight)\b/.test(value)
  );
}

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
  return output;
}

function collectArrays(value, depth = 0) {
  if (Array.isArray(value)) return [value];
  if (!value || typeof value !== "object" || depth >= 2) return [];
  const output = [];
  for (const child of Object.values(value)) output.push(...collectArrays(child, depth + 1));
  return output;
}

function firstText(row, keys) {
  for (const key of keys) {
    const text = cleanQuestionText(row[key]);
    if (text) return text;
  }
  return "";
}

function optionArray(row) {
  if (Array.isArray(row.options)) return cleanQuestionOptions(row.options);
  if (row.options && typeof row.options === "object") {
    return cleanQuestionOptions(["A", "B", "C", "D"].map((letter) => row.options[letter] ?? row.options[letter.toLowerCase()]));
  }
  return cleanQuestionOptions([row.optionA, row.optionB, row.optionC, row.optionD]);
}

function normalizeForIdentity(value) {
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

function rowIdentity(question, options) {
  return sha256(`${normalizeForIdentity(question)}|${options.map(normalizeForIdentity).join("|")}`);
}

function databaseContentHash(question, options) {
  const normalized = `${question} ${options.join("|")}`
    .toLowerCase()
    .replace(/\\[,;:! ]/g, "")
    .replace(/\s*([{}_^=+\-*/|()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return sha256(normalized);
}

function stemIdentity(question) {
  return sha256(normalizeForIdentity(question));
}

function inferClassLevel(row, filePath) {
  const raw = cleanQuestionText(row.classLevel ?? row.class ?? row.class_level ?? row.className ?? filePath).toLowerCase();
  if (/\b12\b|class[_ -]?12/.test(raw)) return "12";
  if (/\b11\b|class[_ -]?11/.test(raw)) return "11";
  return null;
}

function inferSubject(row, filePath) {
  const direct = normalizeSubject(cleanQuestionText(row.subject));
  if (direct && direct !== "Biology") return direct;

  const discriminator = `${cleanQuestionText(row.subchapter_label)} ${filePath}`.toLowerCase();
  if (/zoology|structural.organisation.in.animals|human.reproduction|reproductive.health|human.health|breathing|body.fluids|excretory|locomotion|neural|chemical.coordination|evolution|biotechnology/.test(discriminator)) return "Zoology";
  if (/botany|plant|living.world|biological.classification|morphology|anatomy|photosynthesis|respiration|ecosystem|biodiversity|microbes|inheritance|cell/.test(discriminator)) return "Botany";
  if (/physics|\bphy\b/.test(discriminator)) return "Physics";
  if (/chemistry|\bchem\b/.test(discriminator)) return "Chemistry";

  const chapter = cleanQuestionText(row.chapter);
  for (const subject of ["Botany", "Zoology", "Physics", "Chemistry"]) {
    if (canonicalChapter(subject, chapter)) return subject;
  }
  return null;
}

function canonicalChapter(subject, rawChapter) {
  const chapter = cleanQuestionText(rawChapter);
  const key = `${subject}::${chapter}`;
  if (!chapterCache.has(key)) chapterCache.set(key, canonicalizeChapter(subject, chapter) ?? null);
  return chapterCache.get(key);
}

function normalizeDifficulty(value) {
  const difficulty = cleanQuestionText(value).toUpperCase();
  if (["EASY", "SIMPLE"].includes(difficulty)) return "EASY";
  if (["MODERATE", "MEDIUM", "MID"].includes(difficulty)) return "MODERATE";
  if (["TOUGH", "HARD", "DIFFICULT", "MEDIUM-HARD", "MODERATE-HARD"].includes(difficulty)) return "TOUGH";
  return null;
}

function matchOption(value, options) {
  const normalized = normalizeForIdentity(value);
  if (!normalized) return null;
  const matches = options
    .map((option, index) => ({ index, normalized: normalizeForIdentity(option) }))
    .filter((entry) => entry.normalized === normalized);
  return matches.length === 1 ? matches[0].index : null;
}

function parseAnswerValue(key, value, options) {
  if (key === "correctIndex" || key === "correct_index") {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 3) return numeric;
  }

  const optionMatch = matchOption(value, options);
  if (optionMatch !== null) return optionMatch;

  const text = cleanQuestionText(value).toUpperCase();
  if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  const letterMatch = text.match(/^(?:CORRECT\s+)?OPTION\s*[\[(]?\s*([A-D])\s*[\])]?(?:\s|$)/);
  if (letterMatch) return letterMatch[1].charCodeAt(0) - 65;
  const oneBased = Number(text);
  if (key !== "correctIndex" && key !== "correct_index" && Number.isInteger(oneBased) && oneBased >= 1 && oneBased <= 4) {
    return oneBased - 1;
  }
  return null;
}

function resolveAnswer(row, options) {
  const candidates = [];
  for (const key of ANSWER_KEYS) {
    if (row[key] === undefined || row[key] === null || cleanQuestionText(row[key]) === "") continue;
    const index = parseAnswerValue(key, row[key], options);
    if (index !== null) candidates.push({ key, index });
  }
  const indexes = [...new Set(candidates.map((candidate) => candidate.index))];
  return {
    index: indexes.length === 1 ? indexes[0] : null,
    conflict: indexes.length > 1,
    candidates,
  };
}

function isQuestionLike(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const question = firstText(row, QUESTION_KEYS);
  const options = optionArray(row);
  return Boolean(question) && options.filter(Boolean).length >= 2;
}

function hasVisualClaim(row) {
  return Boolean(
    row.diagram_based ||
      row.diagram_required ||
      row.isDiagramBased ||
      row.isGraphBased ||
      row.has_diagram_or_graphical_context ||
      row.diagram_or_graph_based ||
      row.is_graphical_or_diagram_based ||
      firstText(row, ["diagram_description", "diagram_context", "visual_prompt", "diagram_prompt"]),
  );
}

function hasVisualAsset(row) {
  return Boolean(firstText(row, ["visualAssetUrl", "visual_asset_url", "imageUrl", "image_url", "assetPath", "asset_path"]));
}

function provenanceClassification(row) {
  const source = firstText(row, SOURCE_KEYS).toUpperCase();
  const note = firstText(row, SOURCE_NOTE_KEYS);
  const combined = `${source} ${note}`;
  const hasOfficialEvidence = Boolean(
    row.provenanceJson &&
      typeof row.provenanceJson === "object" &&
      row.provenanceJson.officialKeyVerified === true &&
      row.provenanceJson.paperUrl &&
      row.provenanceJson.answerKeyUrl,
  );

  if (/FALLBACK|STYLE|ORIGINAL|GENERATED|NOT CLAIMED|NOT COPIED|NOT VERBATIM/i.test(combined)) return "ORIGINAL_STYLE_OR_GENERATED";
  if (/NEET[_ ]?PYQ|AIPMT/i.test(source)) return hasOfficialEvidence ? "OFFICIAL_NEET_PYQ" : "UNVERIFIED_NEET_PYQ_CLAIM";
  if (/JEE[_ ]?PYQ/i.test(source)) return hasOfficialEvidence ? "OFFICIAL_JEE_PYQ" : "UNVERIFIED_JEE_PYQ_CLAIM";
  if (/NCERT/i.test(source)) return "NCERT_ALIGNED_UNVERIFIED_REFERENCE";
  if (/INSTITUTE|ALLEN|AAKASH|AKASH|PHYSICS.?WALLAH|\bPW\b|MOTION/i.test(source)) return "COACHING_STYLE_UNLICENSED";
  return "ORIGINAL_STYLE_OR_GENERATED";
}

function addCount(record, key, amount = 1) {
  const normalized = key || "(unknown)";
  record[normalized] = (record[normalized] ?? 0) + amount;
}

function addSample(samples, reason, sample) {
  samples[reason] ??= [];
  if (samples[reason].length < SAMPLE_LIMIT) samples[reason].push(sample);
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function assessRow(row, filePath) {
  const question = firstText(row, QUESTION_KEYS);
  const options = optionArray(row);
  const explanation = firstText(row, ["explanation", "solution", "reason"]);
  const optionExplanations = row.optionExplanations ?? row.option_explanations ?? row.option_rationales;
  const subject = inferSubject(row, filePath);
  const chapterEntry = subject ? canonicalChapter(subject, row.chapter) : null;
  const answer = resolveAnswer(row, options);
  const reasons = [];

  if (!subject) reasons.push("UNKNOWN_SUBJECT");
  if (!chapterEntry) reasons.push("UNKNOWN_CHAPTER");
  if (options.length !== 4 || options.some(isPlaceholderText)) reasons.push("INVALID_OPTIONS");
  if (new Set(options.map(normalizeForIdentity)).size !== 4) reasons.push("DUPLICATE_OPTIONS");
  if (options.some(hasUnreadableText) || hasUnreadableText(question) || hasUnreadableText(explanation)) reasons.push("UNREADABLE_TEXT");
  if (hasMangledMathMarkup(row)) reasons.push("MALFORMED_MATH_MARKUP");
  if (answer.conflict) reasons.push("ANSWER_FIELD_CONFLICT");
  else if (answer.index === null) reasons.push("UNRESOLVED_ANSWER");
  if (!explanation) reasons.push("MISSING_EXPLANATION");
  else if (explanation.length < 25) reasons.push("THIN_EXPLANATION");
  if (!Array.isArray(optionExplanations) || optionExplanations.length !== 4 || optionExplanations.some(isPlaceholderText)) {
    reasons.push("MISSING_OPTION_RATIONALES");
  }
  const visualClaim = hasVisualClaim(row);
  const visualAsset = hasVisualAsset(row);
  if (visualClaim && !visualAsset) reasons.push("MISSING_VISUAL_ASSET");
  if (GENERATOR_BOILERPLATE.some((pattern) => pattern.test(question))) reasons.push("GENERATOR_BOILERPLATE");
  if (!normalizeDifficulty(row.difficulty)) reasons.push("UNKNOWN_DIFFICULTY");

  const provenance = provenanceClassification(row);
  if (provenance.startsWith("UNVERIFIED_")) reasons.push("UNVERIFIED_PYQ_PROVENANCE");
  if (provenance === "COACHING_STYLE_UNLICENSED") reasons.push("UNLICENSED_INSTITUTE_CLAIM");

  return {
    question,
    options,
    explanation,
    optionExplanations,
    subject,
    classLevel: inferClassLevel(row, filePath),
    chapter: chapterEntry?.chapter ?? cleanQuestionText(row.chapter),
    topic: cleanQuestionText(row.topic ?? row.tags?.[0] ?? row.question_type) || null,
    questionForm: cleanQuestionText(row.questionForm ?? row.question_type) || null,
    difficulty: normalizeDifficulty(row.difficulty),
    answer,
    visualClaim,
    visualAsset,
    provenance,
    source: firstText(row, SOURCE_KEYS),
    sourceNote: firstText(row, SOURCE_NOTE_KEYS),
    reasons,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(args.source || DEFAULT_SOURCE);
  const reportDir = path.resolve(args.out || DEFAULT_REPORT_DIR);
  await mkdir(reportDir, { recursive: true });

  const files = await walkJsonFiles(sourceRoot);
  const fileHashes = new Map();
  const uniqueRows = new Map();
  const uniqueStems = new Map();
  const failures = [];
  const samples = {};
  const counts = {
    files: files.length,
    parsedFiles: 0,
    parseFailures: 0,
    arraysInspected: 0,
    arrayEntriesInspected: 0,
    questionAppearances: 0,
    byteDuplicateFileGroups: 0,
    byteDuplicateExtraFiles: 0,
    exactUniqueQuestions: 0,
    exactDuplicateAppearances: 0,
    uniqueStems: 0,
    duplicateStemAppearances: 0,
    duplicateGroupsWithAnswerConflict: 0,
  };

  for (const filePath of files) {
    try {
      const bytes = await readFile(filePath);
      const fileHash = sha256(bytes);
      fileHashes.set(fileHash, [...(fileHashes.get(fileHash) ?? []), filePath]);
      const parsed = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
      counts.parsedFiles += 1;
      const arrays = collectArrays(parsed);
      counts.arraysInspected += arrays.length;
      for (const rows of arrays) {
        counts.arrayEntriesInspected += rows.length;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          if (!isQuestionLike(row)) continue;
          counts.questionAppearances += 1;
          const question = firstText(row, QUESTION_KEYS);
          const options = optionArray(row);
          const identity = rowIdentity(question, options);
          const stemHash = stemIdentity(question);
          const existing = uniqueRows.get(identity);
          if (existing) {
            existing.occurrences += 1;
            const duplicateAnswer = resolveAnswer(row, options);
            if (duplicateAnswer.index !== null) existing.answerIndexes.add(duplicateAnswer.index);
            existing.files.add(filePath);
          } else {
            const assessment = assessRow(row, filePath);
            uniqueRows.set(identity, {
              identity,
              occurrences: 1,
              answerIndexes: new Set(assessment.answer.index === null ? [] : [assessment.answer.index]),
              files: new Set([filePath]),
              reasons: new Set(assessment.reasons),
              assessment,
              originalId: cleanQuestionText(row.id),
              firstFile: filePath,
              firstRow: rowIndex + 1,
            });
          }
          uniqueStems.set(stemHash, (uniqueStems.get(stemHash) ?? 0) + 1);
        }
      }
    } catch (error) {
      counts.parseFailures += 1;
      failures.push({ file: filePath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const fileDuplicateGroups = [...fileHashes.values()].filter((group) => group.length > 1);
  counts.byteDuplicateFileGroups = fileDuplicateGroups.length;
  counts.byteDuplicateExtraFiles = fileDuplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
  counts.exactUniqueQuestions = uniqueRows.size;
  counts.exactDuplicateAppearances = counts.questionAppearances - uniqueRows.size;
  counts.uniqueStems = uniqueStems.size;
  counts.duplicateStemAppearances = counts.questionAppearances - uniqueStems.size;

  const bySubject = {};
  const byChapter = {};
  const byDifficulty = {};
  const byProvenance = {};
  const byReason = {};
  const disposition = { STRICT_READY: 0, NEEDS_REVIEW: 0, NEEDS_VISUAL_ASSET: 0, REJECTED_STRUCTURE: 0 };
  const manifestRows = [];

  for (const entry of uniqueRows.values()) {
    if (entry.answerIndexes.size > 1) {
      entry.reasons.add("DUPLICATE_GROUP_ANSWER_CONFLICT");
      counts.duplicateGroupsWithAnswerConflict += 1;
    }
    const assessment = entry.assessment;
    addCount(bySubject, assessment.subject);
    addCount(byChapter, `${assessment.subject ?? "?"} :: ${assessment.classLevel ?? "?"} :: ${assessment.chapter || "?"}`);
    addCount(byDifficulty, assessment.difficulty);
    addCount(byProvenance, assessment.provenance);
    for (const reason of entry.reasons) {
      addCount(byReason, reason);
      addSample(samples, reason, {
        hash: entry.identity,
        id: entry.originalId || null,
        file: entry.firstFile,
        row: entry.firstRow,
        subject: assessment.subject,
        chapter: assessment.chapter,
        question: assessment.question.slice(0, 320),
        options: assessment.options,
        resolvedAnswer: assessment.answer.index,
        source: assessment.source,
        sourceNote: assessment.sourceNote.slice(0, 320),
      });
    }

    const structural = ["UNKNOWN_SUBJECT", "UNKNOWN_CHAPTER", "INVALID_OPTIONS", "DUPLICATE_OPTIONS", "UNREADABLE_TEXT", "MALFORMED_MATH_MARKUP", "UNRESOLVED_ANSWER", "ANSWER_FIELD_CONFLICT", "DUPLICATE_GROUP_ANSWER_CONFLICT", "MISSING_EXPLANATION"];
    if (structural.some((reason) => entry.reasons.has(reason))) disposition.REJECTED_STRUCTURE += 1;
    else if (entry.reasons.has("MISSING_VISUAL_ASSET")) disposition.NEEDS_VISUAL_ASSET += 1;
    else if (entry.reasons.size > 0) disposition.NEEDS_REVIEW += 1;
    else disposition.STRICT_READY += 1;

    manifestRows.push({
      contentHash: databaseContentHash(assessment.question, assessment.options),
      auditIdentity: entry.identity,
      originalId: entry.originalId || null,
      firstFile: entry.firstFile,
      firstRow: entry.firstRow,
      occurrences: entry.occurrences,
      subject: assessment.subject,
      classLevel: assessment.classLevel,
      chapter: assessment.chapter,
      topic: assessment.topic,
      questionForm: assessment.questionForm,
      resolvedAnswer: assessment.answer.index,
      source: assessment.source,
      sourceNote: assessment.sourceNote,
      provenance: assessment.provenance,
      visualClaim: assessment.visualClaim,
      reasons: [...entry.reasons].sort(),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    policy: {
      note: "This is a deterministic source audit. It does not certify scientific correctness or human review.",
      authenticPyqRequiresOfficialProvenance: true,
      instituteClaimsRequireLicenseEvidence: true,
      visualClaimsRequireStoredAssets: true,
      strictQuestionsRequireFourOptionRationales: true,
    },
    counts,
    disposition,
    bySubject: sortedRecord(bySubject),
    byDifficulty: sortedRecord(byDifficulty),
    byProvenance: sortedRecord(byProvenance),
    byReason: sortedRecord(byReason),
    byChapter: sortedRecord(byChapter),
    parseFailures: failures,
    byteDuplicateFileExamples: fileDuplicateGroups.slice(0, SAMPLE_LIMIT),
    samples,
  };

  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `bank-source-audit-${timestamp}.json`);
  const latestPath = path.join(reportDir, "bank-source-audit-latest.json");
  const manifestPath = path.join(reportDir, `bank-source-manifest-${timestamp}.jsonl`);
  const latestManifestPath = path.join(reportDir, "bank-source-manifest-latest.jsonl");
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  const manifestPayload = `${manifestRows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  await writeFile(reportPath, payload, "utf8");
  await writeFile(latestPath, payload, "utf8");
  await writeFile(manifestPath, manifestPayload, "utf8");
  await writeFile(latestManifestPath, manifestPayload, "utf8");

  console.log(JSON.stringify({ reportPath, latestPath, manifestPath, latestManifestPath, counts, disposition, bySubject: report.bySubject, byProvenance: report.byProvenance, byReason: report.byReason }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
