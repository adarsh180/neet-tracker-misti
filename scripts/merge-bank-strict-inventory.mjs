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

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function validate(row) {
  const issues = [];
  const options = Array.isArray(row?.options) ? row.options : [];
  const rationales = Array.isArray(row?.optionExplanations) ? row.optionExplanations : [];
  if (!row?.canonicalId) issues.push("MISSING_ID");
  if (String(row?.question ?? "").trim().length < 8) issues.push("INVALID_STEM");
  if (options.length !== 4 || options.some((option) => !String(option).trim())) issues.push("INVALID_OPTIONS");
  if (new Set(options.map(normalize)).size !== 4) issues.push("DUPLICATE_OPTIONS");
  if (!Number.isInteger(row?.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) issues.push("INVALID_KEY");
  if (String(row?.explanation ?? "").trim().length < 55) issues.push("THIN_EXPLANATION");
  if (rationales.length !== 4 || rationales.some((rationale) => String(rationale ?? "").trim().length < 18)) issues.push("INCOMPLETE_RATIONALES");
  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.consensus || !args.adjudicated || !args.out) throw new Error("--consensus, --adjudicated and --out are required");
  const consensusPath = path.resolve(String(args.consensus));
  const adjudicatedPath = path.resolve(String(args.adjudicated));
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });

  const merged = new Map();
  const invalid = createWriteStream(path.join(outputDir, "invalid-merge-input.jsonl"), { encoding: "utf8" });
  const overlap = createWriteStream(path.join(outputDir, "overlap-audit.jsonl"), { encoding: "utf8" });
  const counts = {
    consensusInput: 0,
    adjudicatedInput: 0,
    consensusAccepted: 0,
    adjudicatedAccepted: 0,
    invalidConsensus: 0,
    invalidAdjudicated: 0,
    overlap: 0,
    overlapSameAnswerText: 0,
    overlapDifferentAnswerText: 0,
    mergedStrict: 0,
  };

  for await (const row of jsonLines(consensusPath)) {
    counts.consensusInput += 1;
    const issues = validate(row);
    if (issues.length) {
      counts.invalidConsensus += 1;
      await writeLine(invalid, { source: "CONSENSUS", issues, row });
    } else {
      counts.consensusAccepted += 1;
      merged.set(String(row.canonicalId), row);
    }
  }

  for await (const row of jsonLines(adjudicatedPath)) {
    counts.adjudicatedInput += 1;
    const issues = validate(row);
    if (issues.length) {
      counts.invalidAdjudicated += 1;
      await writeLine(invalid, { source: "ADJUDICATED", issues, row });
      continue;
    }
    const id = String(row.canonicalId);
    const existing = merged.get(id);
    if (existing) {
      counts.overlap += 1;
      const consensusAnswer = normalize(existing.options[existing.correctIndex]);
      const adjudicatedAnswer = normalize(row.options[row.correctIndex]);
      const sameAnswerText = consensusAnswer === adjudicatedAnswer;
      if (sameAnswerText) counts.overlapSameAnswerText += 1;
      else counts.overlapDifferentAnswerText += 1;
      await writeLine(overlap, {
        canonicalId: id,
        sameAnswerText,
        selected: "CONSENSUS_AFTER_REPAIR",
        consensusAnswer: existing.options[existing.correctIndex],
        adjudicatedAnswer: row.options[row.correctIndex],
        consensusVerification: existing.verification,
        adjudicatedVerification: row.verification,
      });
      continue;
    }
    counts.adjudicatedAccepted += 1;
    merged.set(id, row);
  }

  const outputPath = path.join(outputDir, "strict-approved-merged.jsonl");
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const ordered = [...merged.values()].sort((left, right) => String(left.canonicalId).localeCompare(String(right.canonicalId)));
  for (const row of ordered) await writeLine(output, row);
  counts.mergedStrict = ordered.length;
  await Promise.all([close(output), close(invalid), close(overlap)]);

  const report = {
    generatedAt: new Date().toISOString(),
    consensusPath,
    adjudicatedPath,
    outputDir,
    outputPath,
    counts,
    policy: {
      invalidRowsExcluded: true,
      overlapPreference: "STRICT_CONSENSUS_AFTER_REPAIR",
      overlapNeverDoubleCounted: true,
      databaseWrites: 0,
    },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
