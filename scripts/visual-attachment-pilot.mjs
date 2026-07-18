import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
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
require("@next/env").loadEnvConfig(process.cwd());

const { extractJsonArray } = require("../src/lib/ai-json.ts");
const { chatWithAI } = require("../src/lib/openrouter.ts");
const { renderQuestionVisualSvg } = require("../src/lib/question-visual-svg.ts");
const { prepareQuestionVisualAsset } = require("../src/lib/question-visual-assets.ts");

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

async function representativeIds(corpusDir) {
  const ids = new Set();
  const filePath = path.join(corpusDir, "template-clusters", "template-index.jsonl");
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.representative) ids.add(row.id);
  }
  return ids;
}

async function visualRows(corpusDir, offset, limit) {
  const representatives = await representativeIds(corpusDir);
  const rows = [];
  let eligibleIndex = 0;
  const filePath = path.join(corpusDir, "visual-assets.jsonl");
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (!representatives.has(row.canonicalId)) continue;
    if (eligibleIndex >= offset && rows.length < limit) rows.push(row);
    eligibleIndex += 1;
    if (rows.length >= limit) break;
  }
  return rows;
}

function designerPrompt(rows) {
  const input = rows.map((row) => ({ id: row.canonicalId, subject: row.subject, classLevel: row.classLevel, chapter: row.chapter, question: row.question, options: row.options, correctIndex: row.correctIndex, explanation: row.explanation }));
  return `You design precise, original, copyright-safe scientific visuals for NEET UG MCQs. Decide first whether the question genuinely benefits from a visual. If its visual flag is artificial or the question is fully textual, set visualRequired false. Do not highlight or reveal the correct option.

Return only a JSON array with: id, visualRequired, decisionReason, altText, visualSpec.

When visualRequired is true, visualSpec must use exactly one schema:
1. CARTESIAN_GRAPH: {"kind":"CARTESIAN_GRAPH","title":"...","xLabel":"...","yLabel":"...","xMin":0,"xMax":10,"yMin":0,"yMax":10,"series":[{"label":"...","points":[[0,0],[1,2]]}]}
2. LABELLED_DIAGRAM: {"kind":"LABELLED_DIAGRAM","title":"...","nodes":[{"id":"a","label":"...","x":0-100,"y":0-100,"shape":"CIRCLE|RECT"}],"edges":[{"from":"a","to":"b","label":"..."}]}
3. SCIENTIFIC_SCHEMATIC: {"kind":"SCIENTIFIC_SCHEMATIC","title":"...","caption":"...","elements":[{"type":"CIRCLE|ELLIPSE|RECT|LINE|ARROW|POLYLINE|TEXT","x":0-100,"y":0-100,"x2":0-100,"y2":0-100,"width":2-100,"height":2-100,"radius":2-20,"radiusY":2-20,"points":[[0,0],[10,10]],"label":"...","fill":"WHITE|LIGHT_BLUE|LIGHT_RED|LIGHT_GREEN|LIGHT_AMBER|LIGHT_PURPLE|LIGHT_GRAY|NONE","stroke":"BLACK|SLATE|BLUE|RED|GREEN|AMBER|PURPLE|GRAY","dashed":false}]}

Use normalized coordinates with at least 6% internal margin. Labels must not overlap shapes or leave the canvas. Use no URLs, raster images, arbitrary SVG/path data, decorative detail, or copyrighted layouts.

INPUT:
${JSON.stringify(input)}`;
}

function criticPrompt(rows, designs) {
  const designById = new Map(designs.map((row) => [row.id, row]));
  const input = rows.map((row) => ({ id: row.canonicalId, subject: row.subject, chapter: row.chapter, question: row.question, options: row.options, correctIndex: row.correctIndex, explanation: row.explanation, design: designById.get(row.canonicalId) ?? null }));
  return `You are the final scientific visual critic. Check each proposed visual against the MCQ, answer and explanation. Reject inaccurate anatomy, chemistry, graph scales, overlapping/ambiguous labels, answer-revealing emphasis, decorative-only visuals, or questions that do not genuinely need an image. You may correct the safe visualSpec.

Return only a JSON array with: id, accepted, confidence (0-1), decisionReason, altText, visualSpec. Accept only at confidence >= 0.96.

INPUT:
${JSON.stringify(input)}`;
}

function renderedCriticContent(candidates) {
  const parts = [{
    type: "text",
    text: `You are the final rendered-image examiner for NEET UG scientific figures. Inspect the actual PNGs, not merely their specifications. For every image, reject it if any leader line ends in empty space or points to the wrong structure, a label overlaps/crops/ambiguously points, the title is generic or misleading, anatomy/geometry/scale is inaccurate, the image reveals the answer, or it would confuse a serious student. Do not assume invisible intent. A technically clean but scientifically weak diagram must be rejected. Return only a JSON array with id, accepted, confidence (0-1), and decisionReason. Accept only at confidence >= 0.98. Images follow in the same order as this metadata:\n${JSON.stringify(candidates.map((candidate) => ({ id: candidate.id, question: candidate.question, options: candidate.options, correctIndex: candidate.correctIndex, explanation: candidate.explanation })))}`,
  }];
  for (const candidate of candidates) {
    parts.push({ type: "text", text: `IMAGE ID: ${candidate.id}` });
    parts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${candidate.png.toString("base64")}` } });
  }
  return parts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(String(args.root || DEFAULT_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(root);
  const offset = Math.max(0, Number(args.offset ?? 0));
  const limit = Math.max(1, Math.min(20, Number(args.limit ?? 4)));
  const rows = await visualRows(corpusDir, offset, limit);
  if (!rows.length) throw new Error(`No representative visual rows at offset ${offset}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(corpusDir, "visual-pilots", `${offset}-${timestamp}`);
  await mkdir(path.dirname(outputDir), { recursive: true });
  await mkdir(outputDir, { recursive: false });
  const designResponse = await chatWithAI([{ role: "user", content: designerPrompt(rows) }], 16000, 0.1, 300000, ["gemini-3.1-flash-lite", "gemini-2.5-flash"]);
  const designs = extractJsonArray(designResponse.content) ?? [];
  const criticResponse = await chatWithAI([{ role: "user", content: criticPrompt(rows, designs) }], 16000, 0.05, 300000, ["gemini-2.5-flash", "gemini-3.5-flash"]);
  const criticRows = extractJsonArray(criticResponse.content) ?? [];
  const criticById = new Map(criticRows.map((row) => [row.id, row]));
  const renderedCandidates = [];
  const preparationErrors = new Map();
  for (const row of rows) {
    const critic = criticById.get(row.canonicalId);
    if (critic?.accepted !== true || Number(critic.confidence) < 0.96) continue;
    const rendered = renderQuestionVisualSvg(critic.visualSpec);
    if (!rendered) continue;
    try {
      const prepared = prepareQuestionVisualAsset(rendered);
      const png = await sharp(prepared.fileData).png().toBuffer();
      renderedCandidates.push({ id: row.canonicalId, question: row.question, options: row.options, correctIndex: row.correctIndex, explanation: row.explanation, rendered, prepared, png });
    } catch (error) {
      // The exact database validator is authoritative; invalid candidates stay rejected.
      preparationErrors.set(row.canonicalId, String(error));
    }
  }
  const renderedResponse = renderedCandidates.length
    ? await chatWithAI([{ role: "user", content: renderedCriticContent(renderedCandidates) }], 6000, 0, 300000, ["gemini-3.5-flash"])
    : null;
  const renderedReviews = renderedResponse ? (extractJsonArray(renderedResponse.content) ?? []) : [];
  const renderedReviewById = new Map(renderedReviews.map((row) => [row.id, row]));
  const candidateById = new Map(renderedCandidates.map((candidate) => [candidate.id, candidate]));
  const results = [];
  let accepted = 0;
  let rejected = 0;
  let totalBytes = 0;
  for (const row of rows) {
    const critic = criticById.get(row.canonicalId);
    const candidate = candidateById.get(row.canonicalId);
    const renderedReview = renderedReviewById.get(row.canonicalId);
    const valid = Boolean(candidate && renderedReview?.accepted === true && Number(renderedReview.confidence) >= 0.98);
    const byteSize = candidate?.prepared.byteSize ?? 0;
    if (valid) {
      accepted += 1;
      totalBytes += byteSize;
      await writeFile(path.join(outputDir, `${row.canonicalId}.svg`), candidate.prepared.svg, "utf8");
      await writeFile(path.join(outputDir, `${row.canonicalId}.png`), candidate.png);
    } else rejected += 1;
    results.push({ id: row.canonicalId, accepted: valid, byteSize, kind: candidate?.prepared.kind ?? null, altText: candidate?.prepared.alt ?? null, critic: critic ?? null, renderedReview: renderedReview ?? null, preparationError: preparationErrors.get(row.canonicalId) ?? null, databaseWrites: 0 });
  }
  await writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
  const report = {
    generatedAt: new Date().toISOString(), corpusDir, outputDir, offset, processed: rows.length, accepted, rejected, totalBytes,
    averageBytes: accepted ? totalBytes / accepted : 0,
    projectedTenThousandBytes: accepted ? Math.ceil((totalBytes / accepted) * 10_000) : null,
    models: { designer: designResponse.model, critic: criticResponse.model, renderedCritic: renderedResponse?.model ?? null }, databaseWrites: 0,
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
