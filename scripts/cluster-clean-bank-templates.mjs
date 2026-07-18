import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
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
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("corpus-")).map((entry) => entry.name).sort();
  if (!directories.length) throw new Error(`No corpus directories found under ${root}`);
  return path.join(root, directories.at(-1));
}

function normalizeTemplate(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[(?:variant|scenario|set|item|question)[^\]]*\]/gi, " ")
    .replace(/\b(?:variant|scenario|setup|set|item|question)\s*(?:code|number|no\.?|label)?\s*[:#-]?\s*[a-z]*\d[\w-]*/gi, " ")
    .replace(/(?<![a-z])[-+]?\d+(?:\.\d+)?(?:\s*[×x]\s*10\^?[-+]?\d+)?/gi, "<n>")
    .replace(/\\(?:,|;|:|!|quad|qquad)\b/g, " ")
    .replace(/\s*([{}_^=+\-*/|()[\],:;])\s*/g, "$1")
    .replace(/[^\p{L}\p{N}<>\\{}_^=+\-*/|()[\],:;]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function qualityScore(row) {
  const reasons = new Set(row.repair?.reasons ?? []);
  let score = 0;
  if (row.repair?.status !== "QUARANTINED_STRUCTURE") score += 1000;
  if (!row.visual?.required) score += 100;
  if (!reasons.has("THIN_EXPLANATION")) score += 50;
  if (!reasons.has("UNVERIFIED_PYQ_PROVENANCE")) score += 20;
  score += Math.min(500, String(row.explanation ?? "").length);
  return score;
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(String(args.root || DEFAULT_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(root);
  const outputDir = path.join(corpusDir, "template-clusters");
  await mkdir(outputDir, { recursive: false });
  const groups = new Map();
  const inputPath = path.join(corpusDir, "canonical-unique.jsonl");
  let records = 0;

  for await (const line of createInterface({ input: createReadStream(inputPath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (!line) continue;
    const row = JSON.parse(line);
    records += 1;
    const normalizedStem = normalizeTemplate(row.question);
    const templateHash = hash(`${row.subject}|${row.chapter}|${normalizedStem}`);
    if (!groups.has(templateHash)) groups.set(templateHash, { templateHash, normalizedStem, subject: row.subject, chapter: row.chapter, members: [] });
    groups.get(templateHash).members.push({ id: row.canonicalId, contentHash: row.contentHash, score: qualityScore(row), question: row.question });
  }

  const indexStream = createWriteStream(path.join(outputDir, "template-index.jsonl"), { encoding: "utf8", flags: "wx" });
  const clusterStream = createWriteStream(path.join(outputDir, "duplicate-template-clusters.jsonl"), { encoding: "utf8", flags: "wx" });
  let clusteredRecords = 0;
  let duplicateClusters = 0;
  let representatives = 0;
  let largestCluster = 0;
  const sizeDistribution = {};

  for (const group of groups.values()) {
    group.members.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const representativeId = group.members[0].id;
    const size = group.members.length;
    representatives += 1;
    largestCluster = Math.max(largestCluster, size);
    const bucket = size === 1 ? "1" : size <= 5 ? "2-5" : size <= 10 ? "6-10" : size <= 25 ? "11-25" : size <= 50 ? "26-50" : "51+";
    sizeDistribution[bucket] = (sizeDistribution[bucket] ?? 0) + 1;
    if (size > 1) {
      duplicateClusters += 1;
      clusteredRecords += size;
      await writeLine(clusterStream, { ...group, size, representativeId });
    }
    for (let rank = 0; rank < group.members.length; rank += 1) {
      const member = group.members[rank];
      await writeLine(indexStream, { id: member.id, contentHash: member.contentHash, templateHash: group.templateHash, clusterSize: size, representativeId, representative: rank === 0, rank: rank + 1 });
    }
  }
  await Promise.all([close(indexStream), close(clusterStream)]);
  const report = {
    generatedAt: new Date().toISOString(),
    corpusDir,
    records,
    templateGroups: groups.size,
    representatives,
    duplicateClusters,
    clusteredRecords,
    duplicateVariantRecords: records - groups.size,
    largestCluster,
    sizeDistribution,
    policy: { questionsDeleted: false, nonRepresentativesServeable: false, numericLiteralsNormalized: true, optionOrderIgnoredByStemClustering: true },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
