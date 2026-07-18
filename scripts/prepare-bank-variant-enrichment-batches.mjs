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

async function loadById(filePath) {
  const rows = new Map();
  for await (const row of jsonLines(filePath)) rows.set(String(row.canonicalId), row);
  return rows;
}

async function loadIds(filePath) {
  const ids = new Set();
  if (!filePath) return ids;
  for await (const row of jsonLines(filePath)) ids.add(String(row.canonicalId));
  return ids;
}

function compact(wrapper, representative) {
  const variant = wrapper.variant;
  return {
    id: variant.canonicalId,
    subject: variant.subject,
    classLevel: variant.classLevel,
    chapter: variant.chapter,
    questionForm: variant.questionForm,
    question: variant.question,
    options: variant.options,
    independentlyVerifiedCorrectIndex: Number(wrapper.solver.correctIndex),
    representativeReference: representative
      ? {
          question: representative.question,
          options: representative.options,
          correctIndex: representative.correctIndex,
          explanation: representative.explanation,
          optionExplanations: representative.optionExplanations,
        }
      : null,
  };
}

function promptFor(rows, representatives) {
  return `You are enriching already independently answer-key-verified NEET UG questions. Physics and Chemistry may be JEE Main-level in difficulty but must remain within the NEET syllabus. Re-solve each exact question before writing its solution. The representative reference is verified context from the same source cluster, but it may not be identical; never copy it blindly. Reject ambiguity, multiple/no correct options, malformed content, out-of-syllabus content, or a supplied verified key that your own reasoning cannot support.

Return only one JSON array in the same order. Each object must contain exactly: id, verdict (KEEP or REJECT), correctIndex (0-3, or -1 if rejected), explanation, optionExplanations (exactly four strings aligned to the supplied options), difficulty (EASY, MODERATE, or TOUGH), confidence (0-1), and reason. Do not rewrite the stem or options. The explanation must be a complete worked solution for numerical questions and a precise, self-contained concept solution otherwise. For non-numerical questions, explicitly explain why the correct option is correct and why each distractor is wrong. Do not invent citations, exam years, institutes, figures, or facts. Use confidence >= 0.97 only when the item is unambiguous and the solution is fully reliable.

INPUT:
${JSON.stringify(rows.map((row, index) => compact(row, representatives[index])))}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.approved || !args.out) throw new Error("--source, --approved and --out are required");
  const sourcePath = path.resolve(String(args.source));
  const approvedPath = path.resolve(String(args.approved));
  const excludedPath = args.exclude ? path.resolve(String(args.exclude)) : null;
  const outputDir = path.resolve(String(args.out));
  const batchSize = Math.max(1, Math.min(6, Number(args.batch ?? 4)));
  const shardRequests = Math.max(1, Math.min(1000, Number(args["shard-requests"] ?? 400)));
  await mkdir(outputDir, { recursive: true });
  const approved = await loadById(approvedPath);
  const excluded = await loadIds(excludedPath);
  const manifest = createWriteStream(path.join(outputDir, "request-manifest.jsonl"), { encoding: "utf8" });
  const deferred = createWriteStream(path.join(outputDir, "deferred.jsonl"), { encoding: "utf8" });
  let shard = 0;
  let requestIndex = 0;
  let questionCount = 0;
  let excludedAlreadyStrict = 0;
  let missingRepresentative = 0;
  let currentRequests = 0;
  let stream = null;
  let inputCharacters = 0;
  const shardFiles = [];

  async function openShard() {
    shard += 1;
    const fileName = `variant-enrichment-${String(shard).padStart(3, "0")}.jsonl`;
    stream = createWriteStream(path.join(outputDir, fileName), { encoding: "utf8" });
    currentRequests = 0;
    shardFiles.push({ fileName, requests: 0, questions: 0 });
  }

  async function flush(rows, representatives) {
    if (!rows.length) return;
    if (!stream || currentRequests >= shardRequests) {
      if (stream) await close(stream);
      await openShard();
    }
    requestIndex += 1;
    const key = `variant-enrichment-${String(requestIndex).padStart(6, "0")}`;
    const prompt = promptFor(rows, representatives);
    await writeLine(stream, {
      key,
      request: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generation_config: {
          temperature: 0,
          max_output_tokens: 16384,
          response_mime_type: "application/json",
          thinking_config: { thinking_budget: 768 },
        },
      },
    });
    await writeLine(manifest, { key, mode: "variant-enrichment", shard: shardFiles.at(-1).fileName, ids: rows.map((row) => row.variant.canonicalId) });
    currentRequests += 1;
    questionCount += rows.length;
    inputCharacters += prompt.length;
    shardFiles.at(-1).requests += 1;
    shardFiles.at(-1).questions += rows.length;
  }

  let rows = [];
  let representatives = [];
  for await (const wrapper of jsonLines(sourcePath)) {
    const id = String(wrapper.variant?.canonicalId ?? "");
    if (excluded.has(id)) {
      excludedAlreadyStrict += 1;
      continue;
    }
    const representative = approved.get(String(wrapper.representativeId ?? wrapper.variant?.readiness?.representativeId ?? ""));
    if (!representative) {
      missingRepresentative += 1;
      await writeLine(deferred, { reason: "STRICT_REPRESENTATIVE_MISSING", wrapper });
      continue;
    }
    rows.push(wrapper);
    representatives.push(representative);
    if (rows.length >= batchSize) {
      await flush(rows, representatives);
      rows = [];
      representatives = [];
    }
  }
  await flush(rows, representatives);
  if (stream) await close(stream);
  await Promise.all([close(manifest), close(deferred)]);
  const report = {
    generatedAt: new Date().toISOString(), sourcePath, approvedPath, excludedPath, outputDir,
    batchSize, shardRequests, requests: requestIndex, questions: questionCount,
    excludedAlreadyStrict, missingRepresentative, shards: shardFiles.length,
    approximateInputTokens: Math.ceil(inputCharacters / 4), estimatedOutputTokens: questionCount * 360,
    shardFiles,
    policy: { storedKeyAlreadyBlindSolverVerified: true, representativeMustBeStrictApproved: true, modelMustResolveExactVariant: true, databaseWrites: 0 },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
