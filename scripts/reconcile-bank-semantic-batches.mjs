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
  let lineNumber = 0;
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    lineNumber += 1;
    if (!line) continue;
    try {
      yield { lineNumber, value: JSON.parse(line) };
    } catch (error) {
      throw new Error(`${filePath}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

function extractText(responseLine) {
  const response = responseLine?.response ?? responseLine?.inlineResponse?.response ?? responseLine?.result?.response ?? null;
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part?.text ?? "").join("\n").trim();
}

function parseJsonArray(text) {
  const cleaned = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : null;
  } catch {
    const candidate = firstBalancedArray(cleaned);
    if (!candidate) {
      const salvaged = extractCompleteArrayObjects(cleaned);
      return salvaged.length ? salvaged : null;
    }
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      try {
        const repaired = candidate.replace(/,\s*([}\]])/g, "$1");
        const parsed = JSON.parse(repaired);
        return Array.isArray(parsed) ? parsed : null;
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

function responseKey(value) {
  return String(value?.key ?? value?.metadata?.key ?? value?.requestKey ?? "");
}

async function loadResponses(directory) {
  const resultsDir = path.join(directory, "results");
  const files = (await readdir(resultsDir)).filter((name) => name.endsWith(".jsonl")).sort();
  const byKey = new Map();
  const errors = [];
  for (const fileName of files) {
    for await (const { lineNumber, value } of jsonLines(path.join(resultsDir, fileName))) {
      const key = responseKey(value);
      const text = extractText(value);
      const parsed = parseJsonArray(text);
      if (!key || !parsed) errors.push({ fileName, lineNumber, key: key || null, error: value?.error ?? "UNPARSEABLE_RESPONSE" });
      else byKey.set(key, parsed);
    }
  }
  return { byKey, errors, files };
}

async function loadManifest(directory) {
  const byKey = new Map();
  for await (const { value } of jsonLines(path.join(directory, "request-manifest.jsonl"))) byKey.set(String(value.key), value);
  return byKey;
}

async function loadSource(sourcePath) {
  const byId = new Map();
  for await (const { value } of jsonLines(sourcePath)) byId.set(String(value.canonicalId), value);
  return byId;
}

function normalize(value, caseSensitive = false) {
  const cleaned = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

function validateLead(value, original) {
  const issues = [];
  if (!value || String(value.id) !== original.canonicalId) issues.push("ID_MISMATCH");
  if (!["KEEP", "REPAIR"].includes(String(value?.verdict))) issues.push("LEAD_REJECTED");
  const question = String(value?.question ?? "").trim();
  const options = Array.isArray(value?.options) ? value.options.map((entry) => String(entry ?? "").trim()) : [];
  const correctIndex = Number(value?.correctIndex);
  const explanation = String(value?.explanation ?? "").trim();
  const rationales = Array.isArray(value?.optionExplanations) ? value.optionExplanations.map((entry) => String(entry ?? "").trim()) : [];
  const caseSensitive = /scientific\s+name|binomial\s+nomenclature|correctly\s+written/i.test(question);
  if (question.length < 8) issues.push("INVALID_STEM");
  if (options.length !== 4 || options.some((entry) => !entry)) issues.push("INVALID_OPTIONS");
  else if (new Set(options.map((entry) => normalize(entry, caseSensitive))).size !== 4) issues.push("DUPLICATE_OPTIONS");
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) issues.push("INVALID_KEY");
  if (explanation.length < 55) issues.push("THIN_EXPLANATION");
  if (rationales.length !== 4 || rationales.some((entry) => entry.length < 18)) issues.push("INCOMPLETE_OPTION_RATIONALES");
  if (Number(value?.confidence) < 0.94) issues.push("LOW_LEAD_CONFIDENCE");
  return { valid: issues.length === 0, issues, question, options, correctIndex, explanation, rationales };
}

function stableHash(question, options) {
  return createHash("sha256").update(`${normalize(question)}\n${options.map((entry) => normalize(entry)).join("\n")}`).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.lead || !args.solver || !args.source) throw new Error("--lead, --solver and --source are required");
  const leadDir = path.resolve(String(args.lead));
  const solverDir = path.resolve(String(args.solver));
  const leadOverlayDirs = args["lead-overlay"] ? String(args["lead-overlay"]).split(";").filter(Boolean).map((value) => path.resolve(value)) : [];
  const solverOverlayDirs = args["solver-overlay"] ? String(args["solver-overlay"]).split(";").filter(Boolean).map((value) => path.resolve(value)) : [];
  const sourcePath = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out || path.join(path.dirname(leadDir), "reconciled")));
  await mkdir(outputDir, { recursive: true });

  const [leadManifest, solverManifest, leadResponses, solverResponses, source] = await Promise.all([
    loadManifest(leadDir),
    loadManifest(solverDir),
    loadResponses(leadDir),
    loadResponses(solverDir),
    loadSource(sourcePath),
  ]);
  const [leadOverlays, solverOverlays] = await Promise.all([
    Promise.all(leadOverlayDirs.map(async (directory) => {
      const [manifest, responses] = await Promise.all([loadManifest(directory), loadResponses(directory)]);
      return { directory, manifest, responses };
    })),
    Promise.all(solverOverlayDirs.map(async (directory) => {
      const [manifest, responses] = await Promise.all([loadManifest(directory), loadResponses(directory)]);
      return { directory, manifest, responses };
    })),
  ]);
  const leadById = new Map();
  const solverById = new Map();
  const leadShardById = new Map();
  const solverShardById = new Map();
  const expectedIds = new Set();
  for (const [key, manifest] of leadManifest) {
    for (const id of manifest.ids ?? []) {
      expectedIds.add(String(id));
      leadShardById.set(String(id), String(manifest.shard ?? ""));
    }
    const rows = leadResponses.byKey.get(key) ?? [];
    for (const row of rows) if (row?.id) leadById.set(String(row.id), row);
    if (rows.length && rows.length !== manifest.ids.length) leadResponses.errors.push({ key, error: "RESULT_COUNT_MISMATCH", expected: manifest.ids.length, actual: rows.length });
  }
  for (const overlay of leadOverlays) {
    for (const [key, manifest] of overlay.manifest) {
      const rows = overlay.responses.byKey.get(key) ?? [];
      for (const row of rows) if (row?.id) leadById.set(String(row.id), row);
      if (rows.length && rows.length !== manifest.ids.length) overlay.responses.errors.push({ key, error: "RESULT_COUNT_MISMATCH", expected: manifest.ids.length, actual: rows.length });
    }
  }
  for (const [key, manifest] of solverManifest) {
    for (const id of manifest.ids ?? []) solverShardById.set(String(id), String(manifest.shard ?? ""));
    const rows = solverResponses.byKey.get(key) ?? [];
    for (const row of rows) if (row?.id) solverById.set(String(row.id), row);
    if (rows.length && rows.length !== manifest.ids.length) solverResponses.errors.push({ key, error: "RESULT_COUNT_MISMATCH", expected: manifest.ids.length, actual: rows.length });
  }
  for (const overlay of solverOverlays) {
    for (const [key, manifest] of overlay.manifest) {
      const rows = overlay.responses.byKey.get(key) ?? [];
      for (const row of rows) if (row?.id) solverById.set(String(row.id), row);
      if (rows.length && rows.length !== manifest.ids.length) overlay.responses.errors.push({ key, error: "RESULT_COUNT_MISMATCH", expected: manifest.ids.length, actual: rows.length });
    }
  }

  const strictStream = createWriteStream(path.join(outputDir, "strict-approved.jsonl"), { encoding: "utf8" });
  const escalationStream = createWriteStream(path.join(outputDir, "needs-escalation.jsonl"), { encoding: "utf8" });
  const rejectedStream = createWriteStream(path.join(outputDir, "rejected-or-unresolved.jsonl"), { encoding: "utf8" });
  const pendingStream = createWriteStream(path.join(outputDir, "pending-batch.jsonl"), { encoding: "utf8" });
  const retryLeadStream = createWriteStream(path.join(outputDir, "retry-lead-source.jsonl"), { encoding: "utf8" });
  const retrySolverStream = createWriteStream(path.join(outputDir, "retry-solver-source.jsonl"), { encoding: "utf8" });
  const repairLeadStream = createWriteStream(path.join(outputDir, "repair-lead-source.jsonl"), { encoding: "utf8" });
  const repairSolverStream = createWriteStream(path.join(outputDir, "repair-solver-source.jsonl"), { encoding: "utf8" });
  const adjudicationStream = createWriteStream(path.join(outputDir, "adjudication-source.jsonl"), { encoding: "utf8" });
  const sourceRows = [...expectedIds].map((id) => source.get(id)).filter(Boolean);
  const completedLeadShards = new Set(leadResponses.files);
  const completedSolverShards = new Set(solverResponses.files);
  const counts = { expected: expectedIds.size, source: sourceRows.length, missingSource: expectedIds.size - sourceRows.length, strictApproved: 0, needsEscalation: 0, rejectedOrUnresolved: 0, pendingBatch: 0, retryLead: 0, retrySolver: 0, repairLead: 0, repairSolver: 0, adjudication: 0, missingLead: 0, missingSolver: 0, leadSolverKeyDisagreement: 0, consensusDiffersFromSource: 0 };

  for (const original of sourceRows) {
    const lead = leadById.get(original.canonicalId);
    const solver = solverById.get(original.canonicalId);
    if (!lead) counts.missingLead += 1;
    if (!solver) counts.missingSolver += 1;
    const leadPending = !lead && !completedLeadShards.has(leadShardById.get(original.canonicalId));
    const solverPending = !solver && !completedSolverShards.has(solverShardById.get(original.canonicalId));
    if (!lead && !leadPending) {
      counts.retryLead += 1;
      await writeLine(retryLeadStream, original);
    }
    if (!solver && !solverPending) {
      counts.retrySolver += 1;
      await writeLine(retrySolverStream, original);
    }
    if (leadPending || solverPending) {
      counts.pendingBatch += 1;
      await writeLine(pendingStream, {
        original,
        pending: { lead: leadPending, solver: solverPending },
        shards: { lead: leadShardById.get(original.canonicalId) ?? null, solver: solverShardById.get(original.canonicalId) ?? null },
      });
      continue;
    }
    const leadCheck = validateLead(lead, original);
    const solverKey = Number(solver?.correctIndex);
    const solverValid = solver?.valid === true && solver?.syllabusAligned === true && Number(solver?.confidence) >= 0.94 && Number.isInteger(solverKey) && solverKey >= 0 && solverKey <= 3;
    const consensus = leadCheck.valid && solverValid && leadCheck.correctIndex === solverKey;
    const sourceAgreement = consensus && leadCheck.correctIndex === original.correctIndex;
    if (leadCheck.valid && solverValid && leadCheck.correctIndex !== solverKey) counts.leadSolverKeyDisagreement += 1;
    if (consensus && !sourceAgreement) counts.consensusDiffersFromSource += 1;
    const audit = {
      lead,
      solver,
      leadValidationIssues: leadCheck.issues,
      sourceCorrectIndex: original.correctIndex,
      templateHash: original.readiness?.templateHash ?? null,
      clusterSize: original.readiness?.clusterSize ?? 1,
    };
    if (!leadCheck.valid && solverValid) {
      counts.repairLead += 1;
      await writeLine(repairLeadStream, original);
    } else if (leadCheck.valid && !solverValid) {
      counts.repairSolver += 1;
      await writeLine(repairSolverStream, original);
    } else if (leadCheck.valid && solverValid && (!consensus || !sourceAgreement)) {
      counts.adjudication += 1;
      await writeLine(adjudicationStream, { original, audit });
    }
    if (consensus && sourceAgreement) {
      counts.strictApproved += 1;
      await writeLine(strictStream, {
        canonicalId: original.canonicalId,
        originalContentHash: original.contentHash,
        contentHash: stableHash(leadCheck.question, leadCheck.options),
        subject: original.subject,
        classLevel: original.classLevel,
        chapter: original.chapter,
        chapterKey: original.chapterKey,
        topic: original.topic,
        difficulty: lead.difficulty,
        questionForm: original.questionForm,
        question: leadCheck.question,
        options: leadCheck.options,
        correctIndex: leadCheck.correctIndex,
        correctOption: leadCheck.options[leadCheck.correctIndex],
        explanation: leadCheck.explanation,
        optionExplanations: leadCheck.rationales,
        visual: original.visual,
        provenance: original.provenance,
        template: { templateHash: original.readiness?.templateHash ?? null, clusterSize: original.readiness?.clusterSize ?? 1, representative: true },
        verification: { status: "STRICT_CONSENSUS", leadConfidence: Number(lead.confidence), solverConfidence: Number(solver.confidence), sourceAgreement: true },
      });
    } else if (leadCheck.valid || solverValid || consensus) {
      counts.needsEscalation += 1;
      await writeLine(escalationStream, { original, audit });
    } else {
      counts.rejectedOrUnresolved += 1;
      await writeLine(rejectedStream, { original, audit });
    }
  }
  await Promise.all([close(strictStream), close(escalationStream), close(rejectedStream), close(pendingStream), close(retryLeadStream), close(retrySolverStream), close(repairLeadStream), close(repairSolverStream), close(adjudicationStream)]);
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePath,
    leadDir,
    solverDir,
    leadOverlayDirs,
    solverOverlayDirs,
    outputDir,
    counts,
    leadResponseFiles: leadResponses.files,
    solverResponseFiles: solverResponses.files,
    responseErrors: { lead: leadResponses.errors, solver: solverResponses.errors },
    overlayResponseErrors: {
      lead: leadOverlays.flatMap((overlay) => overlay.responses.errors.map((error) => ({ directory: overlay.directory, ...error }))),
      solver: solverOverlays.flatMap((overlay) => overlay.responses.errors.map((error) => ({ directory: overlay.directory, ...error }))),
    },
    policy: { sourceRowsModified: false, strictRequiresLeadSolverSourceKeyConsensus: true, strictRequiresFourDetailedOptionRationales: true, sourceKeyChangesRequireEscalation: true },
    databaseWrites: 0,
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
