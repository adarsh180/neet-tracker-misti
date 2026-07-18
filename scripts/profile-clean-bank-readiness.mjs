import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";

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
  const directories = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("corpus-"))
    .map((entry) => entry.name)
    .sort();
  if (!directories.length) throw new Error(`No corpus directories found under ${root}`);
  return path.join(root, directories.at(-1));
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

function addCount(record, key, amount = 1) {
  const normalized = String(key || "UNKNOWN");
  record[normalized] = (record[normalized] ?? 0) + amount;
}

function sorted(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function normalizedOption(value, caseSensitive = false) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function structuralIssues(row) {
  const issues = [];
  const question = String(row.question ?? "").trim();
  const options = Array.isArray(row.options) ? row.options.map((entry) => String(entry ?? "").trim()) : [];
  const caseSensitive = /scientific\s+name|binomial\s+nomenclature|correctly\s+written/i.test(question);
  if (question.length < 8) issues.push("INVALID_STEM");
  if (options.length !== 4 || options.some((entry) => !entry)) issues.push("INVALID_OPTIONS");
  else if (new Set(options.map((entry) => normalizedOption(entry, caseSensitive))).size !== 4) issues.push("DUPLICATE_OPTIONS");
  if (!Number.isInteger(row.correctIndex) || row.correctIndex < 0 || row.correctIndex > 3) issues.push("INVALID_ANSWER_INDEX");
  if (!String(row.explanation ?? "").trim()) issues.push("MISSING_EXPLANATION");
  if (!row.subject || !["11", "12"].includes(String(row.classLevel)) || !row.chapterKey) issues.push("INVALID_SYLLABUS_METADATA");
  if (row.repair?.status === "QUARANTINED_STRUCTURE") issues.push("PRIOR_STRUCTURE_QUARANTINE");
  return [...new Set(issues)];
}

function authenticityIssues(row) {
  const issues = [];
  const subject = String(row.subject ?? "").toLowerCase();
  const question = String(row.question ?? "");
  const biology = subject === "botany" || subject === "zoology" || subject === "biology";
  if (
    biology && (
      (/(?:cub(?:e|ical|oid)|cube-shaped)\s+(?:cell|model)/i.test(question) && /surface\s+area\s*(?:to|[:/]\s*)\s*volume|sa\s*[:/]\s*v/i.test(question)) ||
      /(?:if there are|contains?)\s+\d+[^?.]{0,100}\b(?:each|per)\b[^?.]{0,80}\d+|\b\d+[^?.]{0,100}\beach\b[^?.]{0,80}\d+|total (?:number|entries)|product of the number/i.test(question)
    )
  ) issues.push("LOW_VALUE_BIOLOGY_ARITHMETIC");
  return issues;
}

function answerEvidence(row) {
  const indexes = (Array.isArray(row.answerEvidence) ? row.answerEvidence : [])
    .map((entry) => entry?.resolvedIndex)
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 3);
  const distinct = [...new Set(indexes)];
  return {
    evidenceCount: indexes.length,
    distinctIndexes: distinct,
    consensus: distinct.length === 1 && distinct[0] === row.correctIndex,
    conflict: distinct.length > 1 || (distinct.length === 1 && distinct[0] !== row.correctIndex),
  };
}

function explanationProfile(row) {
  const explanation = String(row.explanation ?? "").replace(/\s+/g, " ").trim();
  const rationales = Array.isArray(row.optionExplanations) ? row.optionExplanations.map((entry) => String(entry ?? "").trim()) : [];
  const question = String(row.question ?? "");
  const numerical = /(?:calculate|find|value of|magnitude|ratio|speed|velocity|acceleration|force|energy|power|current|voltage|resistance|moles?|mass|volume|pressure|temperature|\b\d+(?:\.\d+)?\s*(?:m|s|kg|mol|j|w|v|a|pa|k|°c)\b)/i.test(question);
  return {
    explanationLength: explanation.length,
    thin: explanation.length < 55,
    numerical,
    numericalWorkingLikely: !numerical || /(?:=|\d|\\frac|\\times|therefore|hence|substitut|using)/i.test(explanation),
    rationaleCount: rationales.length,
    rationalesComplete: rationales.length === 4 && rationales.every((entry) => entry.length >= 18),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(String(args.root || DEFAULT_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(root);
  const outputDir = path.resolve(String(args.out || path.join(corpusDir, "strict-inventory-workspace")));
  await mkdir(outputDir, { recursive: true });

  const index = new Map();
  for await (const { value } of jsonLines(path.join(corpusDir, "template-clusters", "template-index.jsonl"))) {
    index.set(value.id, value);
  }

  const streams = {
    manifest: createWriteStream(path.join(outputDir, "readiness-manifest.jsonl"), { encoding: "utf8" }),
    representatives: createWriteStream(path.join(outputDir, "semantic-representatives.jsonl"), { encoding: "utf8" }),
    variants: createWriteStream(path.join(outputDir, "variant-verification.jsonl"), { encoding: "utf8" }),
    visual: createWriteStream(path.join(outputDir, "visual-attachment.jsonl"), { encoding: "utf8" }),
    structural: createWriteStream(path.join(outputDir, "structural-repair.jsonl"), { encoding: "utf8" }),
  };

  const counts = {
    records: 0,
    templateRepresentatives: 0,
    templateVariants: 0,
    structuralRepair: 0,
    visualAttachment: 0,
    answerEvidenceConsensus: 0,
    answerEvidenceConflict: 0,
    answerEvidenceMissing: 0,
    thinExplanations: 0,
    numericalWithoutLikelyWorking: 0,
    completeOptionRationales: 0,
  };
  const bySubject = {};
  const byClass = {};
  const byChapter = {};
  const byReason = {};
  const byLane = {};

  for await (const { value: row } of jsonLines(path.join(corpusDir, "canonical-unique.jsonl"))) {
    counts.records += 1;
    const template = index.get(row.canonicalId);
    if (!template) throw new Error(`Missing template index for ${row.canonicalId}`);
    if (template.representative) counts.templateRepresentatives += 1;
    else counts.templateVariants += 1;
    addCount(bySubject, row.subject);
    addCount(byClass, `${row.subject}::${row.classLevel}`);
    addCount(byChapter, `${row.subject}::${row.classLevel}::${row.chapterKey}`);

    const structure = structuralIssues(row);
    const authenticity = authenticityIssues(row);
    const evidence = answerEvidence(row);
    const explanation = explanationProfile(row);
    const visualRequired = Boolean(row.visual?.required);
    const visualAttached = Boolean(row.visual?.asset);
    if (evidence.conflict) counts.answerEvidenceConflict += 1;
    else if (evidence.consensus) counts.answerEvidenceConsensus += 1;
    else counts.answerEvidenceMissing += 1;
    if (explanation.thin) counts.thinExplanations += 1;
    if (explanation.numerical && !explanation.numericalWorkingLikely) counts.numericalWithoutLikelyWorking += 1;
    if (explanation.rationalesComplete) counts.completeOptionRationales += 1;

    const reasons = new Set(row.repair?.reasons ?? []);
    structure.forEach((reason) => reasons.add(reason));
    authenticity.forEach((reason) => reasons.add(reason));
    if (evidence.conflict) reasons.add("ANSWER_EVIDENCE_CONFLICT");
    if (!evidence.consensus) reasons.add("ANSWER_REQUIRES_SEMANTIC_VERIFICATION");
    if (explanation.thin) reasons.add("THIN_EXPLANATION");
    if (explanation.numerical && !explanation.numericalWorkingLikely) reasons.add("NUMERICAL_WORKING_NOT_DETECTED");
    if (!explanation.rationalesComplete) reasons.add("MISSING_OPTION_RATIONALES");
    if (visualRequired && !visualAttached) reasons.add("MISSING_VISUAL_ASSET");

    let lane;
    if (structure.length || authenticity.length || evidence.conflict) lane = "STRUCTURAL_REPAIR";
    else if (visualRequired && !visualAttached) lane = "VISUAL_ATTACHMENT";
    else if (template.representative) lane = "SEMANTIC_REPRESENTATIVE";
    else lane = "VARIANT_VERIFICATION";
    addCount(byLane, lane);
    for (const reason of reasons) addCount(byReason, reason);

    const queueRow = {
      ...row,
      readiness: {
        lane,
        templateHash: template.templateHash,
        clusterSize: template.clusterSize,
        representativeId: template.representativeId,
        representative: template.representative,
        answerEvidence: evidence,
        explanation,
        reasons: [...reasons].sort(),
      },
    };
    await writeLine(streams.manifest, {
      id: row.canonicalId,
      contentHash: row.contentHash,
      subject: row.subject,
      classLevel: row.classLevel,
      chapter: row.chapter,
      ...queueRow.readiness,
    });
    if (lane === "STRUCTURAL_REPAIR") {
      counts.structuralRepair += 1;
      await writeLine(streams.structural, queueRow);
    } else if (lane === "VISUAL_ATTACHMENT") {
      counts.visualAttachment += 1;
      await writeLine(streams.visual, queueRow);
    } else if (lane === "SEMANTIC_REPRESENTATIVE") {
      await writeLine(streams.representatives, queueRow);
    } else {
      await writeLine(streams.variants, queueRow);
    }
    if (counts.records % 10000 === 0) console.log(`profiled ${counts.records} records`);
  }

  await Promise.all(Object.values(streams).map(close));
  const sourceReport = JSON.parse(await readFile(path.join(corpusDir, "cleaning-report.json"), "utf8"));
  const report = {
    generatedAt: new Date().toISOString(),
    corpusDir,
    outputDir,
    sourceCounts: sourceReport.counts,
    counts,
    byLane: sorted(byLane),
    bySubject: sorted(bySubject),
    byClass: sorted(byClass),
    byChapter: sorted(byChapter),
    byReason: sorted(byReason),
    policy: {
      sourceRowsModified: false,
      sourceRowsDeleted: false,
      readinessIsNotSemanticCertification: true,
      everyRecordAssignedToOneWorkLane: true,
      templateAcceptanceDoesNotAutomaticallyApproveVariants: true,
      visualQuestionsCannotServeWithoutAnAttachedVerifiedAsset: true,
    },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputDir, counts, byLane: report.byLane, bySubject: report.bySubject, topReasons: Object.fromEntries(Object.entries(report.byReason).slice(0, 15)) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
