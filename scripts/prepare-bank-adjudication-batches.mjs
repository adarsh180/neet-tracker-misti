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
  const { original, audit } = row;
  return {
    id: original.canonicalId,
    subject: original.subject,
    classLevel: original.classLevel,
    chapter: original.chapter,
    questionForm: original.questionForm,
    source: { question: original.question, options: original.options, correctIndex: original.correctIndex, explanation: original.explanation },
    lead: audit.lead,
    solver: audit.solver,
  };
}

function promptFor(rows) {
  return `You are the final academic adjudicator for a NEET UG question bank. Physics and Chemistry may be JEE Main-level in difficulty but must remain within the NEET syllabus. Resolve disagreements using independent subject reasoning, not majority voting. Reject ambiguous, out-of-syllabus, low-value filler, malformed, or multi-answer items. Never accept institute/PYQ authenticity claims from metadata.\n\nFor every input return exactly one JSON object in the same order. Output only a JSON array. Each object must contain: id, verdict (KEEP_SOURCE, USE_LEAD, CORRECT, or REJECT), question, options (exactly four), correctIndex (0-3), explanation (complete worked solution or precise concept explanation), optionExplanations (exactly four; for non-numerical questions explain why each option is right/wrong), difficulty (EASY, MODERATE, TOUGH), confidence (0-1), and reason. A deployable answer requires confidence >= 0.97. If rejecting, retain the best available content but explain the defect.\n\nINPUT:\n${JSON.stringify(rows.map(compact))}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.out) throw new Error("--source and --out are required");
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out));
  const batchSize = Math.max(1, Math.min(4, Number(args.batch ?? 2)));
  const shardRequests = Math.max(1, Math.min(1000, Number(args["shard-requests"] ?? 400)));
  await mkdir(outputDir, { recursive: true });
  const manifest = createWriteStream(path.join(outputDir, "request-manifest.jsonl"), { encoding: "utf8" });
  let shard = 0;
  let requestIndex = 0;
  let questionCount = 0;
  let currentRequests = 0;
  let stream = null;
  let inputCharacters = 0;
  const shardFiles = [];

  async function openShard() {
    shard += 1;
    const fileName = `adjudication-${String(shard).padStart(3, "0")}.jsonl`;
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
    const key = `adjudication-${String(requestIndex).padStart(6, "0")}`;
    const prompt = promptFor(rows);
    await writeLine(stream, {
      key,
      request: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generation_config: {
          temperature: 0,
          max_output_tokens: 16384,
          response_mime_type: "application/json",
          thinking_config: { thinking_level: "high" },
        },
      },
    });
    await writeLine(manifest, { key, mode: "adjudication", shard: shardFiles.at(-1).fileName, ids: rows.map((row) => row.original.canonicalId) });
    currentRequests += 1;
    questionCount += rows.length;
    inputCharacters += prompt.length;
    shardFiles.at(-1).requests += 1;
    shardFiles.at(-1).questions += rows.length;
  }

  let batch = [];
  for await (const row of jsonLines(sourcePath)) {
    batch.push(row);
    if (batch.length >= batchSize) {
      await flush(batch);
      batch = [];
    }
  }
  await flush(batch);
  if (stream) await close(stream);
  await close(manifest);
  const report = { generatedAt: new Date().toISOString(), sourcePath, outputDir, batchSize, shardRequests, requests: requestIndex, questions: questionCount, shards: shardFiles.length, approximateInputTokens: Math.ceil(inputCharacters / 4), estimatedOutputTokens: questionCount * 520, shardFiles, databaseWrites: 0 };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
