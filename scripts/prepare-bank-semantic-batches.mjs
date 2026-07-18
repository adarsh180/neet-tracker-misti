import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";

const DEFAULT_ROOT = "E:/projects/json files cleaned";
const VALID_MODES = new Set(["lead", "solver", "visual"]);

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

function leadInput(row) {
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
    sourceCorrectIndex: row.correctIndex,
    sourceExplanation: row.explanation,
    answerEvidenceCount: row.readiness?.answerEvidence?.evidenceCount ?? 0,
  };
}

function solverInput(row) {
  return {
    id: row.canonicalId,
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    question: row.question,
    options: row.options,
  };
}

function visualInput(row) {
  return {
    id: row.canonicalId,
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    question: row.question,
    options: row.options,
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    visualDependency: row.visualTemplate?.visualDependency,
    visualCore: row.visualTemplate?.visualCore,
  };
}

function leadPrompt(rows) {
  return `You are the lead editor for a private NEET UG question bank. Process every MCQ independently. Biology must be NCERT-faithful. Physics and Chemistry may reach JEE Main difficulty while remaining within the NEET syllabus.

Return only a JSON array in the same order. Each object must contain exactly:
id, verdict (KEEP|REPAIR|REJECT), question, options (four unique strings), correctIndex (0-3), difficulty (EASY|MODERATE|TOUGH), explanation, optionExplanations (exactly four strings), issues (array), confidence (0-1).

Rules:
- Solve the question; do not blindly trust sourceCorrectIndex.
- Preserve the tested concept and wording when already valid. Repair minimally.
- The explanation must be precise and question-specific. Numerical items require formula, substitution, working, unit and option match. Conceptual items require the governing NCERT/scientific fact.
- Each optionExplanations entry must explicitly explain why that exact option is correct or incorrect. Do not use generic phrases such as "not correct".
- Reject ambiguity, multiple/no correct options, missing data, false premise, irrelevant coaching filler, arithmetic disguised as Biology, or a question that requires a missing visual.
- Do not claim a question is a PYQ or belongs to any institute.
- Preserve valid UTF-8 and LaTeX. Scientific names must retain meaningful capitalization and Markdown italics when the convention is tested.
- Similar stem patterns are not a rejection reason; repetition is controlled separately by template IDs.

INPUT:
${JSON.stringify(rows.map(leadInput))}`;
}

function solverPrompt(rows) {
  return `Act as an independent blind NEET UG/JEE Main solver. You are not given the source key or explanation. Solve every MCQ independently and judge whether it has exactly one defensible answer within the stated syllabus.

Return only a JSON array in the same order. Each object must contain exactly:
id, valid (boolean), correctIndex (0-3 or null), workedSolution, issues (array), confidence (0-1), syllabusAligned (boolean).

Do not rewrite the question. Mark valid=false for ambiguity, missing information, multiple/no correct choices, scientifically false premises, irrelevant filler, arithmetic disguised as Biology, or dependence on an absent visual. For numerical items show enough calculation to independently verify the key.

INPUT:
${JSON.stringify(rows.map(solverInput))}`;
}

function visualPrompt(rows) {
  return `Design precise, original and copyright-safe scientific visuals for NEET UG MCQs. Treat each item independently. The visual must show exactly the information described by the stem without highlighting or revealing the correct option.

Return only a JSON array in the same order. Each object must contain exactly: id, verdict (KEEP_VISUAL|CLEAR_VISUAL_FLAG|REJECT), decisionReason, confidence (0-1), altText, visualSpec.

When verdict is KEEP_VISUAL, visualSpec must use exactly one schema:
1. CARTESIAN_GRAPH: {"kind":"CARTESIAN_GRAPH","title":"...","xLabel":"...","yLabel":"...","xMin":0,"xMax":10,"yMin":0,"yMax":10,"series":[{"label":"...","points":[[0,0],[1,2]]}]}
2. LABELLED_DIAGRAM: {"kind":"LABELLED_DIAGRAM","title":"...","nodes":[{"id":"a","label":"...","x":0-100,"y":0-100,"shape":"CIRCLE|RECT"}],"edges":[{"from":"a","to":"b","label":"..."}]}
3. SCIENTIFIC_SCHEMATIC: {"kind":"SCIENTIFIC_SCHEMATIC","title":"...","caption":"...","elements":[{"type":"CIRCLE|ELLIPSE|RECT|LINE|ARROW|POLYLINE|TEXT","x":0-100,"y":0-100,"x2":0-100,"y2":0-100,"width":2-100,"height":2-100,"radius":2-20,"radiusY":2-20,"points":[[0,0],[10,10]],"label":"...","fill":"WHITE|LIGHT_BLUE|LIGHT_RED|LIGHT_GREEN|LIGHT_AMBER|LIGHT_PURPLE|LIGHT_GRAY|NONE","stroke":"BLACK|SLATE|BLUE|RED|GREEN|AMBER|PURPLE|GRAY","dashed":false}]}

Rules:
- Use normalized coordinates with at least 6% internal margin.
- Reject when the stem omits numerical graph data, essential labels, structures or relationships that would have to be invented.
- Use CLEAR_VISUAL_FLAG when the stem is already fully textual and an image would be decorative.
- Do not invent anatomy, reaction conditions, graph points, table values or labels.
- No URLs, raster images, arbitrary SVG/path data, decorative details or copyrighted layouts.
- Labels must not overlap, crop, or ambiguously point.

INPUT:
${JSON.stringify(rows.map(visualInput))}`;
}

function requestFor(mode, rows) {
  const prompt = mode === "lead" ? leadPrompt(rows) : mode === "solver" ? solverPrompt(rows) : visualPrompt(rows);
  return {
    prompt,
    request: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generation_config: {
        temperature: mode === "solver" ? 0.0 : 0.1,
        max_output_tokens: mode === "solver" ? 12288 : 24576,
        response_mime_type: "application/json",
        thinking_config: mode === "solver" ? { thinking_budget: 1024 } : { thinking_level: "minimal" },
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(String(args.root || DEFAULT_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(root);
  const mode = String(args.mode || "lead");
  if (!VALID_MODES.has(mode)) throw new Error(`--mode must be one of: ${[...VALID_MODES].join(", ")}`);
  const source = path.resolve(String(args.source || path.join(corpusDir, "strict-inventory-workspace", "semantic-representatives.jsonl")));
  const batchSize = Math.max(1, Math.min(16, Number(args.batch ?? 8)));
  const shardRequests = Math.max(1, Math.min(2000, Number(args["shard-requests"] ?? 400)));
  const limit = args.limit ? Math.max(1, Number(args.limit)) : Number.POSITIVE_INFINITY;
  const outputDir = path.resolve(String(args.out || path.join(corpusDir, "strict-inventory-workspace", "gemini-batches", mode)));
  await mkdir(outputDir, { recursive: true });

  let shard = 0;
  let requestIndex = 0;
  let questionCount = 0;
  let inputCharacters = 0;
  let currentRequests = 0;
  let currentStream = null;
  const requestManifest = createWriteStream(path.join(outputDir, "request-manifest.jsonl"), { encoding: "utf8" });
  const shardFiles = [];

  async function openShard() {
    shard += 1;
    const fileName = `${mode}-${String(shard).padStart(3, "0")}.jsonl`;
    const filePath = path.join(outputDir, fileName);
    currentStream = createWriteStream(filePath, { encoding: "utf8" });
    currentRequests = 0;
    shardFiles.push({ fileName, filePath, requests: 0, questions: 0 });
  }

  async function flushBatch(rows) {
    if (!rows.length) return;
    if (!currentStream || currentRequests >= shardRequests) {
      if (currentStream) await close(currentStream);
      await openShard();
    }
    requestIndex += 1;
    const key = `${mode}-${String(requestIndex).padStart(6, "0")}`;
    const built = requestFor(mode, rows);
    await writeLine(currentStream, { key, request: built.request });
    await writeLine(requestManifest, { key, mode, shard: shardFiles.at(-1).fileName, ids: rows.map((row) => row.canonicalId) });
    currentRequests += 1;
    questionCount += rows.length;
    inputCharacters += built.prompt.length;
    shardFiles.at(-1).requests += 1;
    shardFiles.at(-1).questions += rows.length;
  }

  let batch = [];
  for await (const row of jsonLines(source)) {
    if (questionCount + batch.length >= limit) break;
    batch.push(row);
    if (batch.length >= batchSize) {
      await flushBatch(batch);
      batch = [];
    }
  }
  await flushBatch(batch);
  if (currentStream) await close(currentStream);
  await close(requestManifest);
  const expectedOutputTokensPerQuestion = mode === "lead" ? 420 : mode === "solver" ? 170 : 480;
  const report = {
    generatedAt: new Date().toISOString(),
    corpusDir,
    source,
    outputDir,
    mode,
    batchSize,
    shardRequests,
    requests: requestIndex,
    questions: questionCount,
    shards: shardFiles.length,
    inputCharacters,
    approximateInputTokens: Math.ceil(inputCharacters / 4),
    estimatedOutputTokens: questionCount * expectedOutputTokensPerQuestion,
    shardFiles,
    databaseWrites: 0,
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
