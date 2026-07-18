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
  let lineNumber = 0;
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    lineNumber += 1;
    if (!line) continue;
    yield { lineNumber, value: JSON.parse(line) };
  }
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
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

function extractCompleteArrayObjects(value) {
  const arrayStart = value.indexOf("[");
  if (arrayStart < 0) return [];
  const rows = [];
  let objectStart = -1;
  let objectDepth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart + 1; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (objectDepth === 0) objectStart = index;
      objectDepth += 1;
    } else if (character === "}" && objectDepth > 0) {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        try {
          rows.push(JSON.parse(value.slice(objectStart, index + 1).replace(/,\s*([}\]])/g, "$1")));
        } catch {
          // A malformed object remains in the retry lane.
        }
        objectStart = -1;
      }
    }
  }
  return rows;
}

function parseJsonArray(text) {
  const cleaned = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : null;
  } catch {
    const candidate = firstBalancedArray(cleaned);
    if (candidate) {
      try {
        const parsed = JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fall through to partial-object salvage.
      }
    }
    const salvaged = extractCompleteArrayObjects(cleaned);
    return salvaged.length ? salvaged : null;
  }
}

function resultRows(value) {
  const response = value?.response ?? value?.inlineResponse?.response ?? value?.result?.response;
  const text = (response?.candidates?.[0]?.content?.parts ?? []).map((part) => part?.text ?? "").join("\n");
  return parseJsonArray(text);
}

async function loadManifest(batchDir) {
  const byKey = new Map();
  const shardById = new Map();
  const expectedIds = new Set();
  for await (const { value } of jsonLines(path.join(batchDir, "request-manifest.jsonl"))) {
    byKey.set(String(value.key), value);
    for (const id of value.ids ?? []) {
      expectedIds.add(String(id));
      shardById.set(String(id), String(value.shard ?? ""));
    }
  }
  return { byKey, shardById, expectedIds };
}

async function loadResponses(batchDir) {
  const resultsDir = path.join(batchDir, "results");
  let files = [];
  try {
    files = (await readdir(resultsDir)).filter((name) => name.endsWith(".jsonl")).sort();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const byId = new Map();
  const errors = [];
  for (const fileName of files) {
    for await (const { lineNumber, value } of jsonLines(path.join(resultsDir, fileName))) {
      const rows = resultRows(value);
      if (!rows) {
        errors.push({ fileName, lineNumber, key: value?.key ?? null, error: value?.error ?? "UNPARSEABLE_RESPONSE" });
        continue;
      }
      for (const row of rows) if (row?.id) byId.set(String(row.id), row);
    }
  }
  return { byId, files, errors };
}

async function loadSource(filePath) {
  const byId = new Map();
  for await (const { value } of jsonLines(filePath)) {
    const variant = value.variant ?? value;
    if (variant?.canonicalId) byId.set(String(variant.canonicalId), value);
  }
  return byId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batch || !args.source || !args.out) throw new Error("--batch, --source and --out are required");
  const batchDir = path.resolve(String(args.batch));
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const [manifest, responses, source] = await Promise.all([loadManifest(batchDir), loadResponses(batchDir), loadSource(sourcePath)]);
  const completedShards = new Set(responses.files);
  const consensusStream = createWriteStream(path.join(outputDir, "key-consensus-source.jsonl"), { encoding: "utf8" });
  const reviewStream = createWriteStream(path.join(outputDir, "needs-review.jsonl"), { encoding: "utf8" });
  const retryStream = createWriteStream(path.join(outputDir, "retry-source.jsonl"), { encoding: "utf8" });
  const pendingStream = createWriteStream(path.join(outputDir, "pending-batch.jsonl"), { encoding: "utf8" });
  const counts = { expected: manifest.expectedIds.size, source: 0, keyConsensus: 0, solverDisagreement: 0, solverRejected: 0, retry: 0, pending: 0, missingSource: 0 };

  for (const id of manifest.expectedIds) {
    const wrapper = source.get(id);
    if (!wrapper) {
      counts.missingSource += 1;
      continue;
    }
    counts.source += 1;
    const variant = wrapper.variant ?? wrapper;
    const solver = responses.byId.get(id);
    const shard = manifest.shardById.get(id);
    if (!solver) {
      if (!completedShards.has(shard)) {
        counts.pending += 1;
        await writeLine(pendingStream, { variant, representativeId: wrapper.representativeId ?? variant.readiness?.representativeId, shard });
      } else {
        counts.retry += 1;
        await writeLine(retryStream, variant);
      }
      continue;
    }
    const solverKey = Number(solver.correctIndex);
    const solverValid = solver.verdict === "KEEP" && solver.syllabusAligned === true && Number(solver.confidence) >= 0.96 && Number.isInteger(solverKey) && solverKey >= 0 && solverKey <= 3;
    if (!solverValid) {
      counts.solverRejected += 1;
      await writeLine(reviewStream, { reason: "SOLVER_REJECTED_OR_LOW_CONFIDENCE", variant, solver, representativeId: wrapper.representativeId ?? variant.readiness?.representativeId });
    } else if (solverKey !== Number(variant.correctIndex)) {
      counts.solverDisagreement += 1;
      await writeLine(reviewStream, { reason: "SOLVER_SOURCE_KEY_DISAGREEMENT", variant, solver, representativeId: wrapper.representativeId ?? variant.readiness?.representativeId });
    } else {
      counts.keyConsensus += 1;
      await writeLine(consensusStream, { variant, solver, representativeId: wrapper.representativeId ?? variant.readiness?.representativeId });
    }
  }

  await Promise.all([close(consensusStream), close(reviewStream), close(retryStream), close(pendingStream)]);
  const report = { generatedAt: new Date().toISOString(), batchDir, sourcePath, outputDir, counts, resultFiles: responses.files, responseErrors: responses.errors, policy: { keyConsensusIsNotYetDeployable: true, fullSolutionAndFourRationalesStillRequired: true, databaseWrites: 0 } };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
