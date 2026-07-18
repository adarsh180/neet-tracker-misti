import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

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

const DEFAULT_CLEAN_ROOT = "E:/projects/json files cleaned";
const LEAD_MODEL = "gemini-3.1-flash-lite";
const SOLVER_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash"];
const CRITIC_MODEL = "gemini-3.5-flash";

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

async function readJsonLines(filePath, offset, limit) {
  const rows = [];
  let index = 0;
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (!line) continue;
    if (index >= offset && rows.length < limit) rows.push(JSON.parse(line));
    index += 1;
    if (rows.length >= limit) break;
  }
  return rows;
}

function lean(row) {
  return {
    id: row.canonicalId,
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    topic: row.topic,
    difficulty: row.difficulty,
    questionForm: row.questionForm,
    question: row.question,
    options: row.options,
    currentCorrectIndex: row.correctIndex,
    currentExplanation: row.explanation,
    currentReasons: row.repair?.reasons ?? [],
    visualRequired: Boolean(row.visual?.required),
  };
}

function mapById(rows) {
  return new Map((Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === "object" && row.id).map((row) => [String(row.id), row]));
}

function validFinal(row, expected) {
  if (!row || typeof row !== "object" || row.id !== expected.canonicalId) return false;
  if (!Array.isArray(row.options) || row.options.length !== 4 || row.options.some((entry) => !String(entry).trim())) return false;
  const caseSensitive = /scientific\s+name|binomial\s+nomenclature|correctly\s+written/i.test(String(row.question ?? ""));
  if (new Set(row.options.map((entry) => {
    const normalized = String(entry).replace(/\s+/g, " ").trim();
    return caseSensitive ? normalized : normalized.toLowerCase();
  })).size !== 4) return false;
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) return false;
  if (!String(row.question ?? "").trim() || String(row.explanation ?? "").trim().length < 35) return false;
  if (!Array.isArray(row.optionExplanations) || row.optionExplanations.length !== 4 || row.optionExplanations.some((entry) => String(entry).trim().length < 12)) return false;
  return true;
}

function deterministicRejectReason(row) {
  const subject = String(row.subject ?? "").toLowerCase();
  const question = String(row.question ?? "").toLowerCase();
  const biology = subject === "botany" || subject === "zoology" || subject === "biology";
  if (
    biology &&
    /(?:cub(?:e|ical|oid)|cube-shaped)\s+(?:cell|model)/i.test(question) &&
    /surface\s+area\s*(?:to|[:/]\s*)\s*volume|sa\s*[:/]\s*v/i.test(question)
  ) {
    return "TRIVIAL_ARITHMETIC_DISGUISED_AS_BIOLOGY";
  }
  return null;
}

function leadPrompt(batch) {
  return `You are the lead NEET UG question-bank editor. Physics and Chemistry may be JEE Main toughness; Biology must be NCERT-faithful. Repair each supplied MCQ minimally. Do not copy or claim any coaching/PYQ source. Reject questions that cannot be made unambiguous without changing the tested concept.

Return only a JSON array. One object per input with exactly these keys:
id, verdict (KEEP|REPAIR|REJECT), question, options (exactly four unique strings), correctIndex (0-3), explanation (complete worked solution), optionExplanations (exactly four; explicitly explain why each option is correct or wrong), visualRequired (boolean), visualDescription (specific or null), issues (array), confidence (0-1).

The answer, explanation and all four rationales must agree. Remove artificial generator wording. Preserve valid LaTeX and UTF-8. For numerical questions show the calculation. For non-numerical questions explain the misconception in every wrong option.

INPUT:
${JSON.stringify(batch.map(lean))}`;
}

function solverPrompt(batch) {
  return `You are an independent blind NEET UG/JEE Main solver. You have not seen another model's answer. Solve each MCQ from first principles and judge whether the wording and four options permit exactly one answer.

Return only a JSON array with: id, valid (boolean), correctIndex (0-3 or null), workedSolution, issues (array), confidence (0-1). Do not repair or rewrite the question.

INPUT (no existing keys or explanations are provided):
${JSON.stringify(batch.map((row) => ({ id: row.canonicalId, subject: row.subject, classLevel: row.classLevel, chapter: row.chapter, question: row.question, options: row.options })))}`;
}

function criticPrompt(batch, leadRows, solverRows) {
  const lead = mapById(leadRows);
  const solver = mapById(solverRows);
  const input = batch.map((row) => ({ original: lean(row), proposed: lead.get(row.canonicalId) ?? null, blindSolve: solver.get(row.canonicalId) ?? null }));
  return `You are the final strict critic for a production NEET UG question bank. Inspect the original, lead repair and independent blind solve. Accept only when the repaired question is syllabus-relevant, unambiguous, has four plausible unique options, the lead key agrees with the blind solver, the worked explanation is scientifically correct, and all four option rationales specifically justify their option. Biology must be NCERT-faithful. Physics/Chemistry may be JEE Main toughness. Never convert a style question into a PYQ claim. Reject trivial arithmetic disguised as Biology, arbitrary number variants and low-value coaching filler. Do not reject an academically valid question merely because another question in the batch uses a similar stem pattern; template diversity is enforced later by the test assembler. For scientific-name/nomenclature questions, require correct capitalization and explicit Markdown italics around both binomial words; reject formatting that makes multiple options visually identical or omits the tested convention.

Return only a JSON array with: id, accepted (boolean), decisionReason, confidence (0-1), neetRelevance (0-1), authenticity (0-1), question, options, correctIndex, explanation, optionExplanations, visualRequired, visualDescription. For rejected rows, the content fields may be null. Do not accept if confidence, neetRelevance, or authenticity is below 0.94, or if the two keys disagree.

INPUT:
${JSON.stringify(input)}`;
}

async function appendLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cleanRoot = path.resolve(String(args.root || DEFAULT_CLEAN_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(cleanRoot);
  const queue = String(args.queue || "structural-repair");
  if (!/^[a-z-]+$/.test(queue)) throw new Error("Invalid queue name");
  const offset = Math.max(0, Number(args.offset ?? 0));
  const limit = Math.max(1, Math.min(100, Number(args.limit ?? 12)));
  const batchSize = Math.max(1, Math.min(8, Number(args.batch ?? 4)));
  const sourcePath = path.join(corpusDir, `${queue}.jsonl`);
  const sourceRows = await readJsonLines(sourcePath, offset, limit);
  if (!sourceRows.length) throw new Error(`No rows found in ${sourcePath} at offset ${offset}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(corpusDir, "semantic-pilots", `${queue}-${offset}-${timestamp}`);
  await mkdir(path.dirname(outputDir), { recursive: true });
  await mkdir(outputDir, { recursive: false });
  const resultsStream = createWriteStream(path.join(outputDir, "results.jsonl"), { encoding: "utf8", flags: "wx" });
  let accepted = 0;
  let rejected = 0;
  let malformed = 0;
  const usage = { promptTokens: 0, completionTokens: 0 };

  for (let start = 0; start < sourceRows.length; start += batchSize) {
    const batch = sourceRows.slice(start, start + batchSize);
    const candidates = batch.filter((row) => !deterministicRejectReason(row));
    for (const original of batch) {
      const reason = deterministicRejectReason(original);
      if (!reason) continue;
      rejected += 1;
      await appendLine(resultsStream, {
        id: original.canonicalId,
        originalContentHash: original.contentHash,
        accepted: false,
        status: "REJECTED_BY_DETERMINISTIC_PREFILTER",
        final: null,
        audit: { deterministicReason: reason, modelsCalled: [] },
      });
    }
    if (!candidates.length) {
      await writeFile(path.join(outputDir, "checkpoint.json"), `${JSON.stringify({ queue, offset, processed: Math.min(sourceRows.length, start + batch.length), accepted, rejected, malformed, usage }, null, 2)}\n`, "utf8");
      console.log(`processed ${Math.min(sourceRows.length, start + batch.length)}/${sourceRows.length} (accepted=${accepted}, rejected=${rejected})`);
      continue;
    }
    const [leadResponse, solverResponse] = await Promise.all([
      chatWithAI([{ role: "user", content: leadPrompt(candidates) }], 16000, 0.1, 300000, [LEAD_MODEL]),
      chatWithAI([{ role: "user", content: solverPrompt(candidates) }], 8000, 0.05, 300000, SOLVER_MODELS),
    ]);
    const leadRows = extractJsonArray(leadResponse.content) ?? [];
    const solverRows = extractJsonArray(solverResponse.content) ?? [];
    const leadById = mapById(leadRows);
    const solverById = mapById(solverRows);
    const criticCandidates = candidates.filter((original) => {
      const lead = leadById.get(original.canonicalId);
      const solver = solverById.get(original.canonicalId);
      const leadIndex = Number(lead?.correctIndex);
      const solverIndex = Number(solver?.correctIndex);
      return lead && lead.verdict !== "REJECT" && solver?.valid === true && Number(solver.confidence) >= 0.9 && Number.isInteger(leadIndex) && leadIndex === solverIndex;
    });
    for (const original of candidates) {
      if (criticCandidates.includes(original)) continue;
      rejected += 1;
      await appendLine(resultsStream, {
        id: original.canonicalId,
        originalContentHash: original.contentHash,
        accepted: false,
        status: "REJECTED_BY_TWO_MODEL_PREFILTER",
        final: null,
        audit: {
          leadModel: leadResponse.model,
          solverModel: solverResponse.model,
          lead: leadById.get(original.canonicalId) ?? null,
          blindSolve: solverById.get(original.canonicalId) ?? null,
          criticModel: null,
        },
      });
    }
    const criticResponse = criticCandidates.length
      ? await chatWithAI([{ role: "user", content: criticPrompt(criticCandidates, leadRows, solverRows) }], 16000, 0.05, 300000, [CRITIC_MODEL])
      : null;
    const critic = mapById(criticResponse ? (extractJsonArray(criticResponse.content) ?? []) : []);
    for (const response of [leadResponse, solverResponse, criticResponse].filter(Boolean)) {
      usage.promptTokens += response.usage?.prompt_tokens ?? 0;
      usage.completionTokens += response.usage?.completion_tokens ?? 0;
    }
    for (const original of criticCandidates) {
      const final = critic.get(original.canonicalId);
      const schemaValid = final?.accepted === true && validFinal(final, original);
      const consensus = schemaValid && Number(final.confidence) >= 0.94 && Number(final.neetRelevance) >= 0.94 && Number(final.authenticity) >= 0.94;
      const result = {
        id: original.canonicalId,
        originalContentHash: original.contentHash,
        accepted: consensus,
        status: consensus ? (final.visualRequired ? "ACCEPTED_PENDING_VISUAL" : "ACCEPTED_SEMANTIC") : "REJECTED_BY_CRITIC",
        final: consensus ? final : null,
        audit: {
          leadModel: leadResponse.model,
          solverModel: solverResponse.model,
          criticModel: criticResponse?.model ?? null,
          lead: mapById(leadRows).get(original.canonicalId) ?? null,
          blindSolve: mapById(solverRows).get(original.canonicalId) ?? null,
          critic: final ?? null,
        },
      };
      if (!final) malformed += 1;
      if (consensus) accepted += 1;
      else rejected += 1;
      await appendLine(resultsStream, result);
    }
    await writeFile(path.join(outputDir, "checkpoint.json"), `${JSON.stringify({ queue, offset, processed: Math.min(sourceRows.length, start + batch.length), accepted, rejected, malformed, usage }, null, 2)}\n`, "utf8");
    console.log(`processed ${Math.min(sourceRows.length, start + batch.length)}/${sourceRows.length} (accepted=${accepted}, rejected=${rejected})`);
  }
  await close(resultsStream);
  const report = { generatedAt: new Date().toISOString(), corpusDir, sourcePath, outputDir, queue, offset, requested: limit, processed: sourceRows.length, accepted, rejected, malformed, usage, models: { lead: LEAD_MODEL, solver: SOLVER_MODELS, critic: CRITIC_MODEL }, databaseWrites: 0 };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
