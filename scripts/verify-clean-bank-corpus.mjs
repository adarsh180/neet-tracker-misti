import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

const DEFAULT_ROOT = "E:/projects/json files cleaned";

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

async function latestCorpus(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("corpus-")).map((entry) => entry.name).sort();
  if (!directories.length) throw new Error(`No corpus directories found under ${root}`);
  return path.join(root, directories.at(-1));
}

async function* jsonLines(filePath) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  let lineNumber = 0;
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    lineNumber += 1;
    if (!line) continue;
    try {
      yield { lineNumber, value: JSON.parse(line) };
    } catch (error) {
      throw new Error(`${filePath}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function unreadable(value) {
  return /\ufffd|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|[\u00c2\u00c3\u00e2\u00ce\u00cf][\u0080-\u00ff\u2010-\u203f]?/.test(String(value));
}

function malformedMath(value) {
  return /\b(?:rac|ext|egin)\s*\{|\b(?:heta|imes|ight)\b/.test(String(value));
}

function addError(errors, message) {
  if (errors.length < 200) errors.push(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(String(args.root || DEFAULT_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(root);
  const report = JSON.parse(await readFile(path.join(corpusDir, "cleaning-report.json"), "utf8"));
  const errors = [];
  const canonicalHashes = new Set();
  const canonicalIds = new Set();
  let canonicalLines = 0;
  let allLines = 0;
  let nonStructuralInvalid = 0;
  let unreadableRecords = 0;
  let malformedMathRecords = 0;

  for await (const { lineNumber, value } of jsonLines(path.join(corpusDir, "canonical-unique.jsonl"))) {
    canonicalLines += 1;
    if (!value.contentHash || canonicalHashes.has(value.contentHash)) addError(errors, `canonical:${lineNumber}: duplicate or missing contentHash`);
    else canonicalHashes.add(value.contentHash);
    if (!value.canonicalId || canonicalIds.has(value.canonicalId)) addError(errors, `canonical:${lineNumber}: duplicate or missing canonicalId`);
    else canonicalIds.add(value.canonicalId);
    const text = [value.question, ...(value.options ?? []), value.explanation, ...(value.optionExplanations ?? [])].join(" ");
    if (unreadable(text)) unreadableRecords += 1;
    if (malformedMath(text)) malformedMathRecords += 1;
    const optionsValid = Array.isArray(value.options) && value.options.length === 4 && value.options.every((entry) => String(entry).trim());
    const keyValid = Number.isInteger(value.correctIndex) && value.correctIndex >= 0 && value.correctIndex <= 3;
    if (value.repair?.status !== "QUARANTINED_STRUCTURE" && (!optionsValid || !keyValid || !value.explanation)) nonStructuralInvalid += 1;
  }

  for await (const { lineNumber, value } of jsonLines(path.join(corpusDir, "all-question-appearances.jsonl"))) {
    allLines += 1;
    if (!canonicalHashes.has(value.contentHash)) addError(errors, `appearance:${lineNumber}: contentHash absent from canonical file`);
    if (!value.sourceLocation?.file || !Number.isInteger(value.sourceLocation?.row)) addError(errors, `appearance:${lineNumber}: missing source location`);
  }

  if (allLines !== report.counts.appearancesWritten) addError(errors, `appearance count ${allLines} != report ${report.counts.appearancesWritten}`);
  if (allLines !== report.counts.appearancesRead) addError(errors, `read/write preservation mismatch: ${report.counts.appearancesRead}/${allLines}`);
  if (canonicalLines !== report.counts.uniqueQuestions) addError(errors, `canonical count ${canonicalLines} != report ${report.counts.uniqueQuestions}`);
  if (unreadableRecords) addError(errors, `${unreadableRecords} canonical records retain unreadable text`);
  if (malformedMathRecords) addError(errors, `${malformedMathRecords} canonical records retain malformed math`);
  if (nonStructuralInvalid) addError(errors, `${nonStructuralInvalid} non-structural records have invalid options/key/explanation`);

  const verification = {
    generatedAt: new Date().toISOString(),
    corpusDir,
    passed: errors.length === 0,
    counts: { allLines, canonicalLines, canonicalHashes: canonicalHashes.size, canonicalIds: canonicalIds.size },
    checks: {
      everyAppearanceRetained: allLines === report.counts.appearancesRead,
      everyAppearanceMapsToCanonical: !errors.some((entry) => entry.includes("absent from canonical")),
      canonicalHashesUnique: canonicalHashes.size === canonicalLines,
      canonicalIdsUnique: canonicalIds.size === canonicalLines,
      unreadableRecords,
      malformedMathRecords,
      nonStructuralInvalid,
    },
    errors,
  };
  const outputPath = path.join(corpusDir, "verification-report.json");
  await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, ...verification }, null, 2));
  if (!verification.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
