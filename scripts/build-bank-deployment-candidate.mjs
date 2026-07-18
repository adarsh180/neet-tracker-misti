import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
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
    if (line) yield JSON.parse(line);
  }
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function issuesFor(row) {
  const issues = [];
  if (!row?.canonicalId) issues.push("MISSING_ID");
  if (String(row?.question ?? "").trim().length < 8) issues.push("INVALID_STEM");
  if (!Array.isArray(row?.options) || row.options.length !== 4 || row.options.some((entry) => !String(entry ?? "").trim())) issues.push("INVALID_OPTIONS");
  if (!Number.isInteger(row?.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) issues.push("INVALID_KEY");
  if (String(row?.explanation ?? "").trim().length < 55) issues.push("THIN_EXPLANATION");
  if (!Array.isArray(row?.optionExplanations) || row.optionExplanations.length !== 4 || row.optionExplanations.some((entry) => String(entry ?? "").trim().length < 18)) issues.push("INCOMPLETE_OPTION_RATIONALES");
  if (/\uFFFD|Ã.|Â.|â[€-™]|ðŸ/i.test(`${row?.question ?? ""} ${(row?.options ?? []).join(" ")} ${row?.explanation ?? ""}`)) issues.push("MOJIBAKE_SIGNAL");
  if (/coaching institute|weekly (?:biology )?test|objective exercise|worksheet|revision item|lab history|practice set|reliable mcq|standard-book|question bank|pyq-style/i.test(String(row?.question ?? ""))) issues.push("META_OR_GENERATOR_STYLE_STEM");
  if (["Botany", "Zoology"].includes(String(row?.subject)) && /how many .* (?:counted|recorded|listed)|total number of|total .* count/i.test(String(row?.question ?? ""))) issues.push("LOW_VALUE_BIOLOGY_ARITHMETIC");
  if (!row?.verification?.status) issues.push("MISSING_VERIFICATION");
  if (row?.visual?.required && !row?.visual?.asset) issues.push("MISSING_VISUAL_ASSET");
  return issues;
}

function deploymentProvenance(row) {
  const classification = String(row?.provenance?.classification ?? "");
  const sourceLabel = String(row?.provenance?.sourceLabel ?? "");
  const sourceNote = String(row?.provenance?.sourceNote ?? "");
  const verifiedPyq = ["VERIFIED_NEET_PYQ", "VERIFIED_JEE_MAIN_PYQ"].includes(classification)
    && Boolean(row?.provenance?.examYear)
    && Boolean(row?.provenance?.sourceReference);
  const aiOrigin = /^ai$/i.test(sourceLabel) || /ai-generated/i.test(sourceNote);
  return {
    source: row.provenance,
    displaySource: verifiedPyq ? sourceLabel : "Verified Practice Bank",
    authenticityTier: verifiedPyq ? "VERIFIED_PYQ" : "VERIFIED_PRACTICE_ONLY",
    contentOrigin: aiOrigin ? "AI_GENERATED_STORED" : "ORIGINAL_OR_SOURCE_ALIGNED_UNVERIFIED",
    testEligibility: { practice: true, mock: true, pyq: verifiedPyq },
  };
}

function cleanGeneratorLabels(value) {
  return String(value ?? "")
    .replace(/^\s*(?:lengthy\s+)?(?:case|item)\s+\d{1,3}-\d{1,3}\s*:\s*/i, "")
    .replace(/^\s*in\s+test\s+cross\s+case\s+\d{1,3}-\d{1,3}\s*,\s*/i, "In a test cross, ")
    .replace(/^\s*in\s+dihybrid\s+selfing\s+case\s+\d{1,3}-\d{1,3}\s*,\s*/i, "In a dihybrid self-cross, ")
    .replace(/^\s*for\s+x-linked\s+recessive\s+trait\s+case\s+\d{1,3}-\d{1,3}\s*,\s*/i, "For an X-linked recessive trait, ")
    .replace(/\b(?:case|item)\s+\d{1,3}-\d{1,3}\b\s*,?/gi, "")
    .replace(/\btable\s+\d{1,3}-\d{1,3}\b/gi, "table")
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.approved || !args.variants || !args.out) throw new Error("--approved, --variants and --out are required");
  const approvedPath = path.resolve(String(args.approved));
  const variantsPath = path.resolve(String(args.variants));
  const enrichedPath = args.enriched ? path.resolve(String(args.enriched)) : null;
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "deployable-inventory.jsonl");
  const importPath = path.join(outputDir, "bank-import-ready.jsonl");
  const invalidPath = path.join(outputDir, "invalid-after-merge.jsonl");
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const importOutput = createWriteStream(importPath, { encoding: "utf8" });
  const invalid = createWriteStream(invalidPath, { encoding: "utf8" });
  const seen = new Set();
  const counts = { read: 0, deployable: 0, normalAssemblyEligible: 0, storedAiExcludedFromNormalAssembly: 0, invalid: 0, duplicateIds: 0, strictRepresentatives: 0, strictDerivedVariants: 0, strictEnrichedVariants: 0 };
  const bySubject = {};
  const byClass = {};
  const byChapter = {};
  const byDifficulty = {};
  const byVerification = {};
  const byAuthenticity = {};
  const byContentOrigin = {};

  const inventorySources = [[approvedPath, "STRICT_REPRESENTATIVE"], [variantsPath, "STRICT_DERIVED_VARIANT"]];
  if (enrichedPath) inventorySources.push([enrichedPath, "STRICT_ENRICHED_VARIANT"]);
  for (const [filePath, sourceKind] of inventorySources) {
    for await (const row of jsonLines(filePath)) {
      counts.read += 1;
      const preparedRow = { ...row, question: cleanGeneratorLabels(row.question) };
      if (seen.has(preparedRow.canonicalId)) {
        counts.duplicateIds += 1;
        await writeLine(invalid, { reason: "DUPLICATE_CANONICAL_ID", row: preparedRow });
        continue;
      }
      seen.add(preparedRow.canonicalId);
      const issues = issuesFor(preparedRow);
      if (issues.length) {
        counts.invalid += 1;
        await writeLine(invalid, { issues, row: preparedRow });
        continue;
      }
      counts.deployable += 1;
      if (sourceKind === "STRICT_REPRESENTATIVE") counts.strictRepresentatives += 1;
      else if (sourceKind === "STRICT_DERIVED_VARIANT") counts.strictDerivedVariants += 1;
      else counts.strictEnrichedVariants += 1;
      increment(bySubject, preparedRow.subject);
      increment(byClass, `${preparedRow.subject}::${preparedRow.classLevel}`);
      increment(byChapter, preparedRow.chapterKey);
      increment(byDifficulty, preparedRow.difficulty ?? "UNKNOWN");
      increment(byVerification, preparedRow.verification.status);
      const normalizedProvenance = deploymentProvenance(preparedRow);
      const normalAssemblyEligible = normalizedProvenance.contentOrigin !== "AI_GENERATED_STORED";
      if (normalAssemblyEligible) counts.normalAssemblyEligible += 1;
      else counts.storedAiExcludedFromNormalAssembly += 1;
      increment(byAuthenticity, normalizedProvenance.authenticityTier);
      increment(byContentOrigin, normalizedProvenance.contentOrigin);
      await writeLine(output, { ...preparedRow, deploymentProvenance: normalizedProvenance, inventory: { serveEligible: true, normalAssemblyEligible, sourceKind, assembledAt: new Date().toISOString() } });
      await writeLine(importOutput, {
        subject: preparedRow.subject,
        classLevel: preparedRow.classLevel,
        chapter: preparedRow.chapter,
        topic: preparedRow.topic,
        source: normalizedProvenance.contentOrigin === "AI_GENERATED_STORED" ? "AI" : "PLATFORM",
        sourceRef: normalizedProvenance.displaySource,
        difficulty: preparedRow.difficulty,
        question: preparedRow.question,
        options: preparedRow.options,
        correctIndex: preparedRow.correctIndex,
        explanation: preparedRow.explanation,
        optionExplanations: preparedRow.optionExplanations,
        verified: true,
        questionForm: preparedRow.questionForm,
        duplicateClusterId: preparedRow.template?.templateHash ?? preparedRow.readiness?.templateHash ?? null,
        isDiagramBased: false,
        isGraphBased: false,
        verifierRuns: preparedRow.verification,
        provenanceJson: normalizedProvenance,
      });
    }
  }

  await Promise.all([close(output), close(importOutput), close(invalid)]);
  const report = {
    generatedAt: new Date().toISOString(),
    approvedPath,
    variantsPath,
    enrichedPath,
    outputPath,
    importPath,
    invalidPath,
    counts,
    byteSize: (await stat(outputPath)).size,
    importByteSize: (await stat(importPath)).size,
    bySubject,
    byClass,
    byChapter,
    byDifficulty,
    byVerification,
    byAuthenticity,
    byContentOrigin,
    policy: { databaseWrites: 0, onlyStrictlyVerifiedRowsIncluded: true, unresolvedRowsPreservedOutsideDeployableInventory: true, missingVisualsForbidden: true, unverifiedPyqClaimsCannotServeInPyqTests: true },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
