import { createHash } from "node:crypto";
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

function dependency(row) {
  const question = String(row.question ?? "");
  if (/\b(?:table|tabular|data set)\b/i.test(question)) return "TABLE_DEPENDENT";
  if (/\b(?:graph|plot|curve|histogram|bar chart|line chart)\b/i.test(question)) return "GRAPH_DEPENDENT";
  if (/\b(?:circuit|ray diagram|optical arrangement)\b/i.test(question)) return "SCHEMATIC_DEPENDENT";
  if (/\b(?:diagram|figure|image|micrograph|photograph|labelled|shown (?:below|above|here)|given (?:below|above))\b/i.test(question)) return "DIAGRAM_DEPENDENT";
  return "TEXT_COMPLETE_CANDIDATE";
}

function visualCore(question) {
  return String(question ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^.*?\b(?:diagram-based question|diagram-based single-correct|graph-based question)\s*:\s*/i, "")
    .replace(/^(?:previous-year style\s+)?(?:table-based|table\/matching|matching table)\s+(?:item\s+)?\d+(?:-\d+)?\s*:\s*/i, "table: ")
    .replace(/^(?:during|while|in)\s+[^,:]{1,140}[,:]\s*/i, "")
    .replace(/\b(?:worksheet|item|set|question)\s*(?:code|number|no\.?|label)?\s*[:#-]?\s*[a-z]*\d[\w-]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticVisualHash(row) {
  return createHash("sha256")
    .update(`${row.subject}|${row.chapterKey}|${visualCore(row.question)}`)
    .digest("hex");
}

function score(row) {
  let value = String(row.explanation ?? "").length;
  if (row.readiness?.answerEvidence?.consensus) value += 1000;
  if (!row.readiness?.explanation?.thin) value += 300;
  if (row.readiness?.representative) value += 100;
  return value;
}

function addCount(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function sorted(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source) throw new Error("--source is required");
  const source = path.resolve(String(args.source));
  const outputDir = path.resolve(String(args.out || path.join(path.dirname(source), "visual-template-workspace")));
  await mkdir(outputDir, { recursive: true });
  const groups = new Map();
  let records = 0;
  for await (const row of jsonLines(source)) {
    records += 1;
    const templateHash = semanticVisualHash(row);
    if (!groups.has(templateHash)) groups.set(templateHash, []);
    groups.get(templateHash).push(row);
  }

  const representatives = createWriteStream(path.join(outputDir, "visual-template-representatives.jsonl"), { encoding: "utf8" });
  const textClear = createWriteStream(path.join(outputDir, "text-complete-review.jsonl"), { encoding: "utf8" });
  const assetQueue = createWriteStream(path.join(outputDir, "asset-design-review.jsonl"), { encoding: "utf8" });
  const membership = createWriteStream(path.join(outputDir, "visual-template-membership.jsonl"), { encoding: "utf8" });
  const byDependency = {};
  const bySubject = {};
  let textCompleteTemplates = 0;
  let assetTemplates = 0;

  for (const [templateHash, members] of groups) {
    members.sort((a, b) => score(b) - score(a) || a.canonicalId.localeCompare(b.canonicalId));
    const representative = members[0];
    const visualDependency = dependency(representative);
    addCount(byDependency, visualDependency);
    addCount(bySubject, `${representative.subject}::${visualDependency}`);
    const output = { ...representative, visualTemplate: { templateHash, visualCore: visualCore(representative.question), sourceTemplateHashes: [...new Set(members.map((row) => row.readiness?.templateHash).filter(Boolean))], memberCount: members.length, visualDependency, memberIds: members.map((row) => row.canonicalId) } };
    await writeLine(representatives, output);
    await writeLine(membership, { templateHash, representativeId: representative.canonicalId, visualDependency, memberIds: output.visualTemplate.memberIds });
    if (visualDependency === "TEXT_COMPLETE_CANDIDATE") {
      textCompleteTemplates += 1;
      await writeLine(textClear, output);
    } else {
      assetTemplates += 1;
      await writeLine(assetQueue, output);
    }
  }
  await Promise.all([close(representatives), close(textClear), close(assetQueue), close(membership)]);
  const report = {
    generatedAt: new Date().toISOString(),
    source,
    outputDir,
    records,
    templates: groups.size,
    textCompleteTemplates,
    assetTemplates,
    byDependency: sorted(byDependency),
    bySubject: sorted(bySubject),
    policy: {
      sourceRowsModified: false,
      textCompleteClassificationRequiresSemanticConfirmation: true,
      oneVerifiedAssetMayBeReusedOnlyWithinTheSameVisualTemplate: true,
      visualFlagsAreNotTrustedWithoutQuestionTextEvidence: true,
    },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
