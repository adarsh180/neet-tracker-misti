import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
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

function stableHash(question, options) {
  return createHash("sha256").update(`${normalize(question)}\n${options.map(normalize).join("\n")}`).digest("hex");
}

function firstBalancedArray(value) {
  const start = value.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}

function extractObjects(value) {
  const start = value.indexOf("[");
  if (start < 0) return [];
  const rows = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        try {
          rows.push(JSON.parse(value.slice(objectStart, index + 1).replace(/,\s*([}\]])/g, "$1")));
        } catch {
          // Leave the malformed item for a retry pass.
        }
        objectStart = -1;
      }
    }
  }
  return rows;
}

function parseRows(text) {
  const cleaned = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : null;
  } catch {
    const balanced = firstBalancedArray(cleaned);
    if (balanced) {
      try {
        const parsed = JSON.parse(balanced.replace(/,\s*([}\]])/g, "$1"));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Try object-level recovery next.
      }
    }
    const salvaged = extractObjects(cleaned);
    return salvaged.length ? salvaged : null;
  }
}

async function loadResults(batchDir) {
  const byId = new Map();
  const errors = [];
  const resultsDir = path.join(batchDir, "results");
  const files = (await readdir(resultsDir)).filter((name) => name.endsWith(".jsonl")).sort();
  for (const fileName of files) {
    let lineNumber = 0;
    for await (const value of jsonLines(path.join(resultsDir, fileName))) {
      lineNumber += 1;
      const response = value?.response ?? value?.inlineResponse?.response ?? value?.result?.response;
      const text = (response?.candidates?.[0]?.content?.parts ?? []).map((part) => part?.text ?? "").join("\n");
      const rows = parseRows(text);
      if (!rows) errors.push({ fileName, lineNumber, key: value?.key ?? null, error: value?.error ?? "UNPARSEABLE_RESPONSE" });
      else for (const row of rows) if (row?.id) byId.set(String(row.id), row);
    }
  }
  return { byId, files, errors };
}

function validate(result, wrapper) {
  const issues = [];
  const variant = wrapper.variant;
  const correctIndex = Number(result?.correctIndex);
  const expectedIndex = Number(wrapper.solver?.correctIndex);
  const explanation = String(result?.explanation ?? "").trim();
  const rationales = Array.isArray(result?.optionExplanations) ? result.optionExplanations.map((value) => String(value ?? "").trim()) : [];
  const numerical = Boolean(variant?.readiness?.explanation?.numerical);
  if (String(result?.id) !== String(variant?.canonicalId)) issues.push("ID_MISMATCH");
  if (String(result?.verdict) !== "KEEP") issues.push("REJECTED");
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) issues.push("INVALID_KEY");
  if (correctIndex !== expectedIndex || correctIndex !== Number(variant?.correctIndex)) issues.push("KEY_DISAGREEMENT");
  if (explanation.length < (numerical ? 70 : 55)) issues.push("THIN_EXPLANATION");
  if (rationales.length !== 4 || rationales.some((value) => value.length < 18)) issues.push("INCOMPLETE_RATIONALES");
  if (!["EASY", "MODERATE", "TOUGH"].includes(String(result?.difficulty))) issues.push("INVALID_DIFFICULTY");
  if (Number(result?.confidence) < 0.97) issues.push("LOW_CONFIDENCE");
  if (/\b(?:cannot determine|insufficient information|as an ai|placeholder|refer to (?:the )?(?:figure|diagram))\b/i.test(explanation)) issues.push("UNUSABLE_EXPLANATION");
  return { issues, correctIndex, explanation, rationales, numerical };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batch || !args.source || !args.out) throw new Error("--batch, --source and --out are required");
  const batchDir = path.resolve(String(args.batch));
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const results = await loadResults(batchDir);
  const deployable = createWriteStream(path.join(outputDir, "strict-enriched-nonvisual.jsonl"), { encoding: "utf8" });
  const visualPending = createWriteStream(path.join(outputDir, "strict-enriched-visual-pending.jsonl"), { encoding: "utf8" });
  const retry = createWriteStream(path.join(outputDir, "retry-source.jsonl"), { encoding: "utf8" });
  const counts = { source: 0, modelResults: results.byId.size, strictEnriched: 0, deployableNonVisual: 0, visualPending: 0, retry: 0, missingResult: 0, invalidOutput: 0 };

  for await (const wrapper of jsonLines(sourcePath)) {
    counts.source += 1;
    const variant = wrapper.variant;
    const result = results.byId.get(String(variant.canonicalId));
    if (!result) {
      counts.missingResult += 1;
      counts.retry += 1;
      await writeLine(retry, { reason: "MISSING_RESULT", wrapper });
      continue;
    }
    const check = validate(result, wrapper);
    if (check.issues.length) {
      counts.invalidOutput += 1;
      counts.retry += 1;
      await writeLine(retry, { reason: "INVALID_ENRICHMENT_OUTPUT", issues: check.issues, result, wrapper });
      continue;
    }
    const enriched = {
      ...variant,
      contentHash: stableHash(variant.question, variant.options),
      correctIndex: check.correctIndex,
      correctOption: variant.options[check.correctIndex],
      explanation: check.explanation,
      optionExplanations: check.rationales,
      difficulty: result.difficulty,
      verification: {
        status: "STRICT_VARIANT_ENRICHED",
        representativeId: wrapper.representativeId,
        sourceKeyAgreement: Number(variant.correctIndex) === check.correctIndex,
        blindSolverConfidence: Number(wrapper.solver?.confidence),
        enrichmentConfidence: Number(result.confidence),
        independentSolutionCompleted: true,
      },
    };
    counts.strictEnriched += 1;
    if (variant.visual?.required) {
      counts.visualPending += 1;
      await writeLine(visualPending, enriched);
    } else {
      counts.deployableNonVisual += 1;
      await writeLine(deployable, enriched);
    }
  }

  await Promise.all([close(deployable), close(visualPending), close(retry)]);
  const report = {
    generatedAt: new Date().toISOString(), batchDir, sourcePath, outputDir,
    counts, resultFiles: results.files, responseErrors: results.errors,
    policy: {
      confidenceAtLeast: 0.97,
      keyMustMatchSourceAndBlindSolver: true,
      fullSolutionAndFourRationalesRequired: true,
      visualQuestionsHeldUntilAuthenticAssetAttached: true,
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
