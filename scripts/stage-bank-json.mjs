import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    target: "ES2020",
  },
});

const {
  canonicalizeChapter,
  normalizeSubject,
} = require("../src/data/syllabus/neet-chapters.ts");
const { validateBankQuestion } = require("../src/lib/question-bank.ts");

const EXCLUDE_FILE = /(validation|manifest|combined|report|summary)/i;
const QUESTION_KEYS = ["question", "options", "optionA", "correctIndex", "correct_answer", "answer", "explanation"];
const STAGE_SIZE = 5000;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function walkJsonFiles(root) {
  const results = [];
  const entries = await import("node:fs/promises").then((fs) => fs.readdir(root, { withFileTypes: true }));
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...(await walkJsonFiles(full)));
    else if (entry.isFile() && /\.json$/i.test(entry.name)) results.push(full);
  }
  return results;
}

function unwrapRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["questions", "rows", "items", "data", "batches"]) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  return null;
}

function isQuestionLike(row) {
  if (!row || typeof row !== "object") return false;
  return QUESTION_KEYS.filter((key) => key in row).length >= 3 && typeof row.question === "string";
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00c3\u0097/g, "\\times")
    .replace(/\u00ce\u00a9/g, "\\Omega")
    .replace(/\u00cf\u0081/g, "\\rho")
    .replace(/\u00c2\u00b5/g, "\\mu")
    .replace(/\u00c2\u00b0/g, " degree")
    .replace(/\u00e2\u0088\u0092/g, "-")
    .replace(/\u00e2\u0080\u0093|\u00e2\u0080\u0094/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function inferClassLevel(row, filePath) {
  const raw = row.classLevel ?? row.class ?? row.class_level ?? row.className;
  const text = cleanText(raw || filePath).toLowerCase();
  if (/\b12\b|class12|class 12/.test(text)) return "12";
  if (/\b11\b|class11|class 11/.test(text)) return "11";
  return null;
}

function normalizeDifficulty(raw) {
  const text = cleanText(raw).toUpperCase();
  if (["TOUGH", "HARD", "DIFFICULT"].includes(text)) return "TOUGH";
  if (["MODERATE", "MEDIUM", "MID"].includes(text)) return "MODERATE";
  if (["EASY", "SIMPLE"].includes(text)) return "EASY";
  return "MODERATE";
}

function normalizeSource(row) {
  const raw = cleanText(row.source ?? row.source_type ?? row.sourceType ?? row.source_label ?? "AI").toUpperCase();
  if (/JEE/.test(raw)) return "JEE_PYQ";
  if (/NEET|AIPMT/.test(raw)) return "NEET_PYQ";
  if (/NCERT/.test(raw)) return "NCERT";
  if (/INSTITUTE|COACH|ALLEN|AAKASH|AKASH|PW|PHYSICSWALLAH|MOTION|TEST/.test(raw)) return "INSTITUTE";
  if (/PLATFORM|BOOK|STANDARD|NOTES|MODULE/.test(raw)) return "PLATFORM";
  return "AI";
}

function optionArray(row) {
  if (Array.isArray(row.options)) return row.options.map(cleanText);
  if (row.options && typeof row.options === "object") {
    return ["A", "B", "C", "D"].map((letter) => cleanText(row.options[letter] ?? row.options[letter.toLowerCase()]));
  }
  return [row.optionA, row.optionB, row.optionC, row.optionD].map(cleanText);
}

function correctIndex(row, options) {
  const raw = row.correctIndex ?? row.correct_index ?? row.answer ?? row.correctOption ?? row.correct_option ?? row.correct_answer;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  const text = cleanText(raw).toUpperCase();
  if (/^[0-3]$/.test(text)) return Number(text);
  if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  const letterMatch = text.match(/(?:OPTION\s*)?[\(\[]?\s*([A-D])\s*[\)\].:]?/);
  if (letterMatch) return letterMatch[1].charCodeAt(0) - 65;
  const rawAsAnswer = cleanText(raw);
  if (rawAsAnswer) {
    const found = options.findIndex((option) => option.toLowerCase() === rawAsAnswer.toLowerCase());
    if (found >= 0) return found;
  }
  const answerText = cleanText(row.answer_text ?? row.correctAnswer ?? row.correct_answer_text ?? row.correct_answer);
  if (answerText) {
    const found = options.findIndex((option) => option.toLowerCase() === answerText.toLowerCase());
    if (found >= 0) return found;
  }
  return Number.NaN;
}

function inferSubject(row, filePath) {
  const rawSubject = cleanText(row.subject ?? row.subchapter_label ?? "");
  const direct = normalizeSubject(rawSubject);
  if (direct && direct !== "Biology") return direct;

  const pathText = filePath.toLowerCase();
  if (/zoology|human|animal|breathing|circulation|excretion|locomotion|neural|coordination|reproduction|health|evolution|biotechnology/.test(pathText)) {
    return "Zoology";
  }
  if (/botany|plant|morphology|anatomy|photosynthesis|respiration|ecosystem|biodiversity|microbes|inheritance|living_world|classification|cell/.test(pathText)) {
    return "Botany";
  }
  if (/physics|phy/.test(pathText)) return "Physics";
  if (/chemistry|chem/.test(pathText)) return "Chemistry";

  const chapter = cleanText(row.chapter);
  for (const subject of ["Botany", "Zoology", "Physics", "Chemistry"]) {
    if (canonicalizeChapter(subject, chapter)) return subject;
  }
  return null;
}

function sourceRef(row, source) {
  const explicit = cleanText(row.sourceRef ?? row.source_ref ?? row.source_note ?? row.reference ?? "");
  if (explicit) return explicit.slice(0, 240);
  if (source === "NCERT") return "NCERT aligned";
  if (source === "INSTITUTE") return "Original coaching/test-series style";
  if (source === "PLATFORM") return "Original standard-book/notes style";
  if (source === "NEET_PYQ") return "NEET PYQ";
  if (source === "JEE_PYQ") return "JEE Main PYQ";
  return "Original";
}

function normalizeRow(row, filePath) {
  const subject = inferSubject(row, filePath);
  const options = optionArray(row);
  let source = normalizeSource(row);
  if (source === "JEE_PYQ" && subject !== "Physics" && subject !== "Chemistry") source = "PLATFORM";
  return {
    subject,
    classLevel: inferClassLevel(row, filePath),
    chapter: cleanText(row.chapter),
    topic: cleanText(row.topic ?? row.tags?.[0] ?? row.question_type ?? "") || null,
    source,
    sourceRef: sourceRef(row, source),
    difficulty: normalizeDifficulty(row.difficulty),
    question: cleanText(row.question),
    optionA: options[0],
    optionB: options[1],
    optionC: options[2],
    optionD: options[3],
    correctIndex: correctIndex(row, options),
    explanation: cleanText(row.explanation ?? row.solution ?? row.reason ?? ""),
  };
}

function rowHash(row) {
  const text = `${row.question} ${row.optionA}|${row.optionB}|${row.optionC}|${row.optionD}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(args.source || "E:/projects/json files");
  const outDir = path.resolve(args.out || "data/bank-import/staged");
  const reportDir = path.resolve(args.reportDir || "data/bank-import/reports");

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });

  const files = await walkJsonFiles(sourceRoot);
  const report = {
    sourceRoot,
    scannedFiles: files.length,
    excludedFiles: 0,
    parseFailedFiles: [],
    nonQuestionFiles: 0,
    questionFiles: 0,
    rawRows: 0,
    stagedRows: 0,
    duplicateRowsInSource: 0,
    invalidRows: [],
    bySubject: {},
    byChapter: {},
  };

  const staged = [];
  const seen = new Set();

  for (const file of files) {
    if (EXCLUDE_FILE.test(path.basename(file))) {
      report.excludedFiles += 1;
      continue;
    }

    let rows;
    try {
      rows = unwrapRows(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      report.parseFailedFiles.push({ file, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    if (!rows || rows.filter(isQuestionLike).length < Math.max(1, Math.floor(rows.length * 0.5))) {
      report.nonQuestionFiles += 1;
      continue;
    }

    report.questionFiles += 1;
    rows.forEach((row, index) => {
      report.rawRows += 1;
      const normalized = normalizeRow(row, file);
      const hash = rowHash(normalized);
      if (seen.has(hash)) {
        report.duplicateRowsInSource += 1;
        return;
      }
      seen.add(hash);

      const validation = validateBankQuestion(
        {
          subject: normalized.subject,
          classLevel: normalized.classLevel,
          chapter: normalized.chapter,
          topic: normalized.topic,
          source: normalized.source,
          sourceRef: normalized.sourceRef,
          difficulty: normalized.difficulty,
          question: normalized.question,
          optionA: normalized.optionA,
          optionB: normalized.optionB,
          optionC: normalized.optionC,
          optionD: normalized.optionD,
          correctIndex: normalized.correctIndex,
          explanation: normalized.explanation,
        },
        false,
      );

      if (!validation.question) {
        report.invalidRows.push({
          file,
          row: index + 1,
          reason: validation.reason,
          subject: normalized.subject,
          chapter: normalized.chapter,
          question: normalized.question.slice(0, 100),
        });
        return;
      }

      const valid = {
        subject: validation.question.subject,
        classLevel: validation.question.classLevel,
        chapter: validation.question.chapter,
        topic: validation.question.topic,
        source: validation.question.source,
        sourceRef: validation.question.sourceRef,
        difficulty: validation.question.difficulty,
        question: validation.question.question,
        optionA: validation.question.options[0],
        optionB: validation.question.options[1],
        optionC: validation.question.options[2],
        optionD: validation.question.options[3],
        correctIndex: validation.question.correctIndex,
        explanation: validation.question.explanation,
      };

      staged.push(valid);
      report.stagedRows += 1;
      report.bySubject[valid.subject] = (report.bySubject[valid.subject] ?? 0) + 1;
      const chapterKey = `${valid.subject} :: ${valid.classLevel ?? "?"} :: ${valid.chapter}`;
      report.byChapter[chapterKey] = (report.byChapter[chapterKey] ?? 0) + 1;
    });
  }

  for (let i = 0; i < staged.length; i += STAGE_SIZE) {
    const chunk = staged.slice(i, i + STAGE_SIZE);
    const name = `bank-staged-${String(i / STAGE_SIZE + 1).padStart(3, "0")}.json`;
    await writeFile(path.join(outDir, name), `${JSON.stringify(chunk, null, 2)}\n`, "utf8");
  }

  await writeFile(path.join(reportDir, "bank-json-stage-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(reportDir, "bank-json-stage-summary.json"),
    `${JSON.stringify(
      {
        scannedFiles: report.scannedFiles,
        excludedFiles: report.excludedFiles,
        parseFailedFiles: report.parseFailedFiles.length,
        nonQuestionFiles: report.nonQuestionFiles,
        questionFiles: report.questionFiles,
        rawRows: report.rawRows,
        stagedRows: report.stagedRows,
        duplicateRowsInSource: report.duplicateRowsInSource,
        invalidRows: report.invalidRows.length,
        stagedFiles: Math.ceil(staged.length / STAGE_SIZE),
        bySubject: report.bySubject,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`scanned=${report.scannedFiles}`);
  console.log(`questionFiles=${report.questionFiles} rawRows=${report.rawRows}`);
  console.log(`stagedRows=${report.stagedRows} duplicatesInSource=${report.duplicateRowsInSource} invalidRows=${report.invalidRows.length}`);
  console.log(`stagedDir=${outDir}`);
  console.log(`report=${path.join(reportDir, "bank-json-stage-report.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
