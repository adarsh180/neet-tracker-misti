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
          // The malformed item remains unresolved.
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
        // Fall through.
      }
    }
    const salvaged = extractObjects(cleaned);
    return salvaged.length ? salvaged : null;
  }
}

async function loadResults(batchDir) {
  const byId = new Map();
  const errors = [];
  const files = (await readdir(path.join(batchDir, "results"))).filter((name) => name.endsWith(".jsonl")).sort();
  for (const fileName of files) {
    let lineNumber = 0;
    for await (const value of jsonLines(path.join(batchDir, "results", fileName))) {
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

function validated(value, original) {
  const issues = [];
  const question = String(value?.question ?? "").trim();
  const options = Array.isArray(value?.options) ? value.options.map((entry) => String(entry ?? "").trim()) : [];
  const correctIndex = Number(value?.correctIndex);
  const explanation = String(value?.explanation ?? "").trim();
  const rationales = Array.isArray(value?.optionExplanations) ? value.optionExplanations.map((entry) => String(entry ?? "").trim()) : [];
  if (String(value?.id) !== original.canonicalId) issues.push("ID_MISMATCH");
  if (!["KEEP_SOURCE", "USE_LEAD", "CORRECT"].includes(String(value?.verdict))) issues.push("REJECTED");
  if (question.length < 8) issues.push("INVALID_STEM");
  if (options.length !== 4 || options.some((entry) => !entry) || new Set(options.map(normalize)).size !== 4) issues.push("INVALID_OPTIONS");
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) issues.push("INVALID_KEY");
  if (explanation.length < 55) issues.push("THIN_EXPLANATION");
  if (rationales.length !== 4 || rationales.some((entry) => entry.length < 18)) issues.push("INCOMPLETE_RATIONALES");
  if (Number(value?.confidence) < 0.97) issues.push("LOW_CONFIDENCE");
  return { valid: issues.length === 0, issues, question, options, correctIndex, explanation, rationales };
}

function correctOptionFromLead(lead) {
  const index = Number(lead?.correctIndex);
  return Array.isArray(lead?.options) && Number.isInteger(index) ? lead.options[index] : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batch || !args.source || !args.out) throw new Error("--batch, --source and --out are required");
  const batchDir = path.resolve(String(args.batch));
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const results = await loadResults(batchDir);
  const accepted = createWriteStream(path.join(outputDir, "strict-adjudicated.jsonl"), { encoding: "utf8" });
  const unresolved = createWriteStream(path.join(outputDir, "unresolved.jsonl"), { encoding: "utf8" });
  const counts = { source: 0, modelResults: results.byId.size, strictAdjudicated: 0, unresolved: 0, missingResult: 0, insufficientIndependentSupport: 0, invalidOutput: 0 };

  for await (const wrapper of jsonLines(sourcePath)) {
    counts.source += 1;
    const { original, audit } = wrapper;
    const result = results.byId.get(original.canonicalId);
    if (!result) {
      counts.missingResult += 1;
      counts.unresolved += 1;
      await writeLine(unresolved, { reason: "MISSING_RESULT", wrapper });
      continue;
    }
    const check = validated(result, original);
    if (!check.valid) {
      counts.invalidOutput += 1;
      counts.unresolved += 1;
      await writeLine(unresolved, { reason: "INVALID_ADJUDICATION_OUTPUT", issues: check.issues, result, wrapper });
      continue;
    }
    const adjudicatedOption = normalize(check.options[check.correctIndex]);
    const evidence = {
      source: normalize(original.options?.[original.correctIndex]),
      lead: normalize(correctOptionFromLead(audit.lead)),
      solver: normalize(original.options?.[Number(audit.solver?.correctIndex)]),
    };
    const supporters = Object.entries(evidence).filter(([, option]) => option && option === adjudicatedOption).map(([name]) => name);
    if (!supporters.length) {
      counts.insufficientIndependentSupport += 1;
      counts.unresolved += 1;
      await writeLine(unresolved, { reason: "ADJUDICATOR_HAS_NO_INDEPENDENT_SUPPORT", supporters, result, wrapper });
      continue;
    }
    counts.strictAdjudicated += 1;
    await writeLine(accepted, {
      canonicalId: original.canonicalId,
      originalContentHash: original.contentHash,
      contentHash: stableHash(check.question, check.options),
      subject: original.subject,
      classLevel: original.classLevel,
      chapter: original.chapter,
      chapterKey: original.chapterKey,
      topic: original.topic,
      difficulty: result.difficulty,
      questionForm: original.questionForm,
      question: check.question,
      options: check.options,
      correctIndex: check.correctIndex,
      correctOption: check.options[check.correctIndex],
      explanation: check.explanation,
      optionExplanations: check.rationales,
      visual: original.visual,
      provenance: original.provenance,
      template: { templateHash: original.readiness?.templateHash ?? null, clusterSize: original.readiness?.clusterSize ?? 1, representative: true },
      verification: { status: "STRICT_ADJUDICATED", adjudicatorConfidence: Number(result.confidence), supportingEvidence: supporters, sourceKeyChanged: evidence.source !== adjudicatedOption, reason: result.reason },
    });
  }

  await Promise.all([close(accepted), close(unresolved)]);
  const report = { generatedAt: new Date().toISOString(), batchDir, sourcePath, outputDir, counts, resultFiles: results.files, responseErrors: results.errors, policy: { adjudicatorRequiresConfidenceAtLeast: 0.97, adjudicatorRequiresAtLeastOneIndependentSupportingAnswer: true, databaseWrites: 0 } };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
