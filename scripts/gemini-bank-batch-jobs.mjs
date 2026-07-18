import { GoogleGenAI } from "@google/genai";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());

function parseArgs(argv) {
  const [command = "status", ...rest] = argv;
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function readState(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { jobs: [] };
    throw error;
  }
}

async function saveState(filePath, state) {
  state.updatedAt = new Date().toISOString();
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function submit(ai, args, directory, statePath, state) {
  const model = String(args.model || "gemini-3.1-flash-lite");
  const files = (await readdir(directory)).filter((name) => /^(?:lead|solver|visual|adjudication|variant-solver|variant-enrichment)-\d+\.jsonl$/.test(name)).sort();
  const limit = args.limit ? Math.max(1, Number(args.limit)) : files.length;
  let submitted = 0;
  state.pendingUploads ??= {};
  for (const fileName of files) {
    if (submitted >= limit) break;
    if (state.jobs.some((job) => job.inputFile === fileName)) continue;
    let uploadedName = state.pendingUploads[fileName]?.resourceName ?? null;
    if (!uploadedName) {
      const inputPath = path.join(directory, fileName);
      let uploaded;
      try {
        uploaded = await ai.files.upload({ file: inputPath, config: { mimeType: "application/jsonl", displayName: fileName } });
      } catch (error) {
        console.error(`upload failed for ${fileName}; no batch job was created`);
        console.error(error);
        break;
      }
      if (!uploaded.name) throw new Error(`Upload did not return a file name for ${fileName}`);
      uploadedName = uploaded.name;
      state.pendingUploads[fileName] = { resourceName: uploadedName, uploadedAt: new Date().toISOString() };
      await saveState(statePath, state);
    }
    const displayName = `neet-bank-${path.basename(directory)}-${fileName.replace(/\.jsonl$/, "")}-${Date.now()}`.slice(0, 128);
    let job;
    try {
      job = await ai.batches.create({ model, src: uploadedName, config: { displayName } });
    } catch (error) {
      await saveState(statePath, state);
      console.error(`creation failed for ${fileName}; uploaded input is checkpointed as ${uploadedName}`);
      console.error(error);
      break;
    }
    state.jobs.push({
      inputFile: fileName,
      inputFileResource: uploadedName,
      model,
      jobName: job.name,
      displayName: job.displayName,
      state: job.state,
      outputFileResource: job.dest?.fileName ?? null,
      submittedAt: new Date().toISOString(),
    });
    delete state.pendingUploads[fileName];
    await saveState(statePath, state);
    submitted += 1;
    console.log(`submitted ${fileName}: ${job.name} (${job.state})`);
  }
  console.log(JSON.stringify({ submitted, totalTracked: state.jobs.length, statePath }, null, 2));
}

async function refresh(ai, statePath, state, compact = false) {
  for (const tracked of state.jobs) {
    if (!tracked.jobName) continue;
    const job = await ai.batches.get({ name: tracked.jobName });
    tracked.state = job.state;
    tracked.error = job.error ?? null;
    tracked.outputFileResource = job.dest?.fileName ?? tracked.outputFileResource ?? null;
    tracked.updatedAt = new Date().toISOString();
  }
  await saveState(statePath, state);
  const counts = {};
  for (const job of state.jobs) counts[job.state || "UNKNOWN"] = (counts[job.state || "UNKNOWN"] ?? 0) + 1;
  console.log(JSON.stringify({ statePath, counts, ...(compact ? {} : { jobs: state.jobs.map(({ inputFile, model, jobName, state: jobState, outputFileResource, error }) => ({ inputFile, model, jobName, state: jobState, outputFileResource, error })) }) }, null, 2));
}

async function download(ai, directory, statePath, state) {
  const resultsDir = path.join(directory, "results");
  await mkdir(resultsDir, { recursive: true });
  let downloaded = 0;
  for (const tracked of state.jobs) {
    if (tracked.state !== "JOB_STATE_SUCCEEDED" || !tracked.outputFileResource) continue;
    const outputPath = path.join(resultsDir, tracked.inputFile);
    try {
      await readFile(outputPath);
      continue;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await ai.files.download({ file: tracked.outputFileResource, downloadPath: outputPath });
    tracked.downloadedTo = outputPath;
    tracked.downloadedAt = new Date().toISOString();
    downloaded += 1;
    await saveState(statePath, state);
    console.log(`downloaded ${tracked.inputFile}`);
  }
  console.log(JSON.stringify({ downloaded, resultsDir }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = path.resolve(String(args.dir || ""));
  if (!args.dir) throw new Error("--dir is required");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const statePath = path.join(directory, "jobs.json");
  const state = await readState(statePath);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  if (args.command === "submit") return submit(ai, args, directory, statePath, state);
  if (args.command === "status") return refresh(ai, statePath, state, Boolean(args.compact));
  if (args.command === "download") return download(ai, directory, statePath, state);
  throw new Error("Command must be submit, status, or download");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
