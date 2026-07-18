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

function compact(row) {
  return {
    id: row.canonicalId,
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    question: row.question,
    options: row.options,
  };
}

function promptFor(rows) {
  return `Act as an independent NEET UG MCQ solver. Physics and Chemistry may be JEE Main-level but must remain within the NEET syllabus. You are not given any stored answer. Solve every item independently. Reject ambiguous, malformed, out-of-syllabus, low-value filler, or questions with zero/multiple correct options.\n\nReturn only one JSON array in the same order. Each object must contain exactly: id, verdict (KEEP or REJECT), correctIndex (0-3, or -1 when rejected), confidence (0-1), syllabusAligned (boolean), and reason (maximum 35 words). Use confidence >= 0.96 only when the single correct option is clear.\n\nINPUT:\n${JSON.stringify(rows.map(compact))}`;
}

async function loadApprovedIds(filePath) {
  const ids = new Set();
  for await (const row of jsonLines(filePath)) ids.add(String(row.canonicalId));
  return ids;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.approved || !args.out) throw new Error("--source, --approved and --out are required");
  const sourcePath = path.resolve(String(args.source));
  const approvedPath = path.resolve(String(args.approved));
  const outputDir = path.resolve(String(args.out));
  const batchSize = Math.max(1, Math.min(12, Number(args.batch ?? 10)));
  const shardRequests = Math.max(1, Math.min(2000, Number(args["shard-requests"] ?? 400)));
  await mkdir(outputDir, { recursive: true });
  const approvedIds = await loadApprovedIds(approvedPath);
  const manifest = createWriteStream(path.join(outputDir, "request-manifest.jsonl"), { encoding: "utf8" });
  const deferred = createWriteStream(path.join(outputDir, "deferred-unapproved-representative.jsonl"), { encoding: "utf8" });
  let shard = 0;
  let requestIndex = 0;
  let questionCount = 0;
  let deferredCount = 0;
  let currentRequests = 0;
  let stream = null;
  let inputCharacters = 0;
  const shardFiles = [];

  async function openShard() {
    shard += 1;
    const fileName = `variant-solver-${String(shard).padStart(3, "0")}.jsonl`;
    stream = createWriteStream(path.join(outputDir, fileName), { encoding: "utf8" });
    currentRequests = 0;
    shardFiles.push({ fileName, requests: 0, questions: 0 });
  }

  async function flush(rows) {
    if (!rows.length) return;
    if (!stream || currentRequests >= shardRequests) {
      if (stream) await close(stream);
      await openShard();
    }
    requestIndex += 1;
    const key = `variant-solver-${String(requestIndex).padStart(6, "0")}`;
    const prompt = promptFor(rows);
    await writeLine(stream, {
      key,
      request: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generation_config: {
          temperature: 0,
          max_output_tokens: 8192,
          response_mime_type: "application/json",
          thinking_config: { thinking_budget: 512 },
        },
      },
    });
    await writeLine(manifest, { key, mode: "variant-solver", shard: shardFiles.at(-1).fileName, ids: rows.map((row) => row.canonicalId) });
    currentRequests += 1;
    questionCount += rows.length;
    inputCharacters += prompt.length;
    shardFiles.at(-1).requests += 1;
    shardFiles.at(-1).questions += rows.length;
  }

  let batch = [];
  for await (const wrapper of jsonLines(sourcePath)) {
    const variant = wrapper.variant ?? wrapper;
    const representativeId = String(wrapper.representativeId ?? variant.readiness?.representativeId ?? "");
    if (!approvedIds.has(representativeId)) {
      deferredCount += 1;
      await writeLine(deferred, wrapper);
      continue;
    }
    batch.push(variant);
    if (batch.length >= batchSize) {
      await flush(batch);
      batch = [];
    }
  }
  await flush(batch);
  if (stream) await close(stream);
  await Promise.all([close(manifest), close(deferred)]);
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePath,
    approvedPath,
    outputDir,
    batchSize,
    shardRequests,
    requests: requestIndex,
    questions: questionCount,
    deferred: deferredCount,
    shards: shardFiles.length,
    approximateInputTokens: Math.ceil(inputCharacters / 4),
    estimatedOutputTokens: questionCount * 80,
    shardFiles,
    policy: { blindSolverDoesNotReceiveStoredKey: true, representativeMustAlreadyBeStrictApproved: true, databaseWrites: 0 },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
