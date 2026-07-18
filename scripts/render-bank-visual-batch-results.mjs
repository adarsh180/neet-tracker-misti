import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
const { renderQuestionVisualSvg } = require("../src/lib/question-visual-svg.ts");
const { prepareQuestionVisualAsset } = require("../src/lib/question-visual-assets.ts");

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

function parseJsonArray(text) {
  const cleaned = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const value = JSON.parse(cleaned);
    return Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : null;
  } catch {
    const candidate = firstBalancedArray(cleaned);
    if (!candidate) {
      const salvaged = extractCompleteArrayObjects(cleaned);
      return salvaged.length ? salvaged : null;
    }
    try {
      const value = JSON.parse(candidate);
      return Array.isArray(value) ? value : null;
    } catch {
      try {
        const value = JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
        return Array.isArray(value) ? value : null;
      } catch {
        const salvaged = extractCompleteArrayObjects(cleaned);
        return salvaged.length ? salvaged : null;
      }
    }
  }
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
          // Leave a malformed object for the targeted retry queue.
        }
        objectStart = -1;
      }
    }
  }
  return rows;
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

function resultRows(value) {
  const response = value?.response ?? value?.inlineResponse?.response ?? value?.result?.response;
  const text = (response?.candidates?.[0]?.content?.parts ?? []).map((part) => part?.text ?? "").join("\n");
  return parseJsonArray(text);
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
      const rows = resultRows(value);
      if (!rows) {
        errors.push({ fileName, lineNumber, key: value?.key ?? null, error: value?.error ?? "UNPARSEABLE_RESPONSE" });
        continue;
      }
      for (const row of rows) if (row?.id) byId.set(String(row.id), row);
    }
  }
  return { byId, errors, files };
}

async function loadExpectedIds(batchDir) {
  const expected = new Set();
  for await (const value of jsonLines(path.join(batchDir, "request-manifest.jsonl"))) {
    for (const id of value?.ids ?? []) expected.add(String(id));
  }
  return expected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batch || !args.source) throw new Error("--batch and --source are required");
  const batchDir = path.resolve(String(args.batch));
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out || path.join(batchDir, "rendered")));
  const svgDir = path.join(outputDir, "svg");
  const pngDir = path.join(outputDir, "png-preview");
  await Promise.all([mkdir(svgDir, { recursive: true }), mkdir(pngDir, { recursive: true })]);
  const [responses, expectedIds] = await Promise.all([loadResults(batchDir), loadExpectedIds(batchDir)]);
  const acceptedStream = createWriteStream(path.join(outputDir, "rendered-candidates.jsonl"), { encoding: "utf8" });
  const clearStream = createWriteStream(path.join(outputDir, "clear-visual-flag.jsonl"), { encoding: "utf8" });
  const rejectedStream = createWriteStream(path.join(outputDir, "rejected-visuals.jsonl"), { encoding: "utf8" });
  const counts = { source: 0, modelResults: responses.byId.size, rendered: 0, clearVisualFlag: 0, rejected: 0, missingResult: 0, preparationError: 0, totalSvgBytes: 0, totalPngBytes: 0 };

  for await (const original of jsonLines(sourcePath)) {
    if (!expectedIds.has(String(original.canonicalId))) continue;
    counts.source += 1;
    const result = responses.byId.get(original.canonicalId);
    if (!result) {
      counts.missingResult += 1;
      counts.rejected += 1;
      await writeLine(rejectedStream, { id: original.canonicalId, reason: "MISSING_MODEL_RESULT", original });
      continue;
    }
    if (result.verdict === "CLEAR_VISUAL_FLAG" && Number(result.confidence) >= 0.94) {
      counts.clearVisualFlag += 1;
      await writeLine(clearStream, { id: original.canonicalId, templateHash: original.visualTemplate?.templateHash, memberIds: original.visualTemplate?.memberIds ?? [original.canonicalId], decisionReason: result.decisionReason, confidence: Number(result.confidence) });
      continue;
    }
    if (result.verdict !== "KEEP_VISUAL" || Number(result.confidence) < 0.94 || !result.visualSpec) {
      counts.rejected += 1;
      await writeLine(rejectedStream, { id: original.canonicalId, reason: "MODEL_REJECTED", result, original });
      continue;
    }
    try {
      const rendered = renderQuestionVisualSvg(result.visualSpec);
      if (!rendered) throw new Error("UNRENDERABLE_VISUAL_SPEC");
      const prepared = prepareQuestionVisualAsset(rendered);
      const png = await sharp(prepared.fileData).png().toBuffer();
      const svgPath = path.join(svgDir, `${original.visualTemplate.templateHash}.svg`);
      const pngPath = path.join(pngDir, `${original.visualTemplate.templateHash}.png`);
      await Promise.all([writeFile(svgPath, prepared.fileData), writeFile(pngPath, png)]);
      counts.rendered += 1;
      counts.totalSvgBytes += prepared.byteSize;
      counts.totalPngBytes += png.byteLength;
      await writeLine(acceptedStream, {
        id: original.canonicalId,
        templateHash: original.visualTemplate.templateHash,
        memberIds: original.visualTemplate.memberIds,
        question: original.question,
        options: original.options,
        correctIndex: original.correctIndex,
        explanation: original.explanation,
        kind: prepared.kind,
        altText: prepared.alt,
        contentHash: prepared.contentHash,
        byteSize: prepared.byteSize,
        svgPath,
        pngPreviewPath: pngPath,
        modelConfidence: Number(result.confidence),
        decisionReason: result.decisionReason,
        pixelReviewStatus: "PENDING",
      });
    } catch (error) {
      counts.preparationError += 1;
      counts.rejected += 1;
      await writeLine(rejectedStream, { id: original.canonicalId, reason: "PREPARATION_ERROR", error: error instanceof Error ? error.message : String(error), result, original });
    }
  }
  await Promise.all([close(acceptedStream), close(clearStream), close(rejectedStream)]);
  const report = {
    generatedAt: new Date().toISOString(),
    batchDir,
    sourcePath,
    outputDir,
    counts,
    resultFiles: responses.files,
    responseErrors: responses.errors,
    projectedSvgBytesForTenThousand: counts.rendered ? Math.ceil((counts.totalSvgBytes / counts.rendered) * 10000) : null,
    policy: { databaseWrites: 0, renderedAssetsRemainPendingUntilPixelReview: true, externalSvgReferencesForbidden: true, maxSvgBytes: 20000 },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
