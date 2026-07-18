import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";

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

async function* jsonLines(filePath) {
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function writeLine(stream, row) {
  if (!stream.write(`${JSON.stringify(row)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function issuesFor(row) {
  const issues = [];
  const options = Array.isArray(row?.options) ? row.options.map(normalize) : [];
  const rationales = Array.isArray(row?.optionExplanations) ? row.optionExplanations.map(normalize) : [];
  if (row?.source !== "PLATFORM") issues.push("NOT_NON_AI_PLATFORM_SOURCE");
  if (row?.verified !== true) issues.push("NOT_VERIFIED");
  if (!/^[a-f0-9]{64}$/i.test(String(row?.contentHash ?? ""))) issues.push("INVALID_CONTENT_HASH");
  if (!normalize(row?.question) || normalize(row.question).length < 8) issues.push("INVALID_QUESTION");
  if (options.length !== 4 || options.some((option) => !option) || new Set(options.map((option) => option.toLowerCase())).size !== 4) issues.push("INVALID_OPTIONS");
  if (!Number.isInteger(row?.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) issues.push("INVALID_KEY");
  if (normalize(row?.explanation).length < 55) issues.push("THIN_EXPLANATION");
  if (rationales.length !== 4 || rationales.some((rationale) => rationale.length < 18)) issues.push("INCOMPLETE_OPTION_RATIONALES");
  if (row?.isDiagramBased || row?.isGraphBased || row?.visualAssetId || row?.visualAssetUrl) issues.push("VISUAL_ROW_NOT_ALLOWED_IN_TEXT_DEPLOYMENT");
  const text = `${row?.question ?? ""} ${options.join(" ")} ${row?.explanation ?? ""} ${rationales.join(" ")}`;
  if (/\uFFFD|Ãƒ.|Ã‚.|Ã¢[â‚¬-â„¢]|Ã°Å¸/i.test(text)) issues.push("MOJIBAKE_SIGNAL");
  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.out) throw new Error("--source and --out are required");
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "production-non-ai-bank.jsonl");
  const rejectedPath = path.join(outputDir, "production-rejected.jsonl");
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const rejected = createWriteStream(rejectedPath, { encoding: "utf8" });
  const seen = new Set();
  const counts = { read: 0, nonAiCandidates: 0, ready: 0, rejected: 0, duplicateHashes: 0, aiExcluded: 0 };
  const bySubject = {};
  const byClass = {};
  const byChapter = {};
  const byDifficulty = {};
  const bySubjectDifficulty = {};

  for await (const row of jsonLines(sourcePath)) {
    counts.read += 1;
    if (row?.source !== "PLATFORM") {
      counts.aiExcluded += 1;
      continue;
    }
    counts.nonAiCandidates += 1;
    const hash = String(row.contentHash ?? "");
    if (seen.has(hash)) {
      counts.duplicateHashes += 1;
      await writeLine(rejected, { issues: ["DUPLICATE_CONTENT_HASH"], row });
      continue;
    }
    seen.add(hash);
    const issues = issuesFor(row);
    if (issues.length) {
      counts.rejected += 1;
      await writeLine(rejected, { issues, row });
      continue;
    }
    counts.ready += 1;
    increment(bySubject, row.subject);
    increment(byClass, `${row.subject}::${row.classLevel ?? "UNKNOWN"}`);
    increment(byChapter, `${row.subject}::${row.classLevel ?? "UNKNOWN"}::${row.chapter}`);
    increment(byDifficulty, row.difficulty ?? "UNKNOWN");
    increment(bySubjectDifficulty, `${row.subject}::${row.difficulty ?? "UNKNOWN"}`);
    await writeLine(output, row);
  }

  await Promise.all([close(output), close(rejected)]);
  const chapterRows = Object.entries(byChapter)
    .map(([key, count]) => {
      const [subject, classLevel, ...chapterParts] = key.split("::");
      return { subject, classLevel, chapter: chapterParts.join("::"), count };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject) || left.classLevel.localeCompare(right.classLevel) || left.chapter.localeCompare(right.chapter));
  const report = {
    generatedAt: new Date().toISOString(), sourcePath, outputDir, outputPath, rejectedPath,
    counts, bySubject, byClass, byDifficulty, bySubjectDifficulty, chapters: chapterRows,
    policy: {
      aiRowsExcluded: true,
      visualRowsExcludedUntilExactAssetRecovery: true,
      completeSolutionAndFourRationalesRequired: true,
      uniqueContentHashRequired: true,
      productionDatabaseWrites: 0,
    },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "chapter-counts.csv"), `subject,classLevel,chapter,count\n${chapterRows.map((row) => `${JSON.stringify(row.subject)},${JSON.stringify(row.classLevel)},${JSON.stringify(row.chapter)},${row.count}`).join("\n")}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
