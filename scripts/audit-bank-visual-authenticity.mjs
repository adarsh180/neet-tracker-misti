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

function increment(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function hasUsableAsset(row) {
  const asset = row?.visual?.asset;
  if (!asset) return false;
  if (typeof asset === "string") return /^(?:https?:\/\/|data:image\/|\/|[a-z]:\\)/i.test(asset);
  return Boolean(asset.url || asset.path || asset.data || asset.assetId);
}

function codeNativeCandidate(row) {
  const core = String(row?.visualTemplate?.visualCore ?? row?.question ?? "");
  const dependency = String(row?.visualTemplate?.visualDependency ?? "");
  if (dependency === "TABLE_DEPENDENT") return core.length >= 55 && /\b(?:row|column|table|value|data)\b/i.test(core);
  if (dependency === "GRAPH_DEPENDENT") return core.length >= 70 && /\b(?:axis|axes|slope|curve|plot|versus|against|intercept|increases|decreases)\b/i.test(core);
  return core.length >= 80 && /\b(?:labelled|shows|consists|contains|with|having|arranged)\b/i.test(core);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.out) throw new Error("--source and --out are required");
  const sourcePath = path.resolve(String(args.source));
  const textCompletePath = args["text-complete"] ? path.resolve(String(args["text-complete"])) : null;
  const outputDir = path.resolve(String(args.out));
  await mkdir(outputDir, { recursive: true });
  const recovery = createWriteStream(path.join(outputDir, "source-asset-recovery-required.jsonl"), { encoding: "utf8" });
  const vectorCandidates = createWriteStream(path.join(outputDir, "code-native-candidates.jsonl"), { encoding: "utf8" });
  const counts = { assetTemplates: 0, affectedQuestions: 0, usableExistingAssets: 0, sourceRecoveryRequired: 0, codeNativeCandidates: 0, textCompleteTemplates: 0, textCompleteAffectedQuestions: 0 };
  const byDependency = {};
  const bySubject = {};
  const bySourceLabel = {};

  for await (const row of jsonLines(sourcePath)) {
    counts.assetTemplates += 1;
    const members = Math.max(1, Number(row?.visualTemplate?.memberCount ?? 1));
    counts.affectedQuestions += members;
    increment(byDependency, String(row?.visualTemplate?.visualDependency ?? "UNKNOWN"), members);
    increment(bySubject, String(row?.subject ?? "UNKNOWN"), members);
    increment(bySourceLabel, String(row?.provenance?.sourceLabel ?? "UNKNOWN"), members);
    if (hasUsableAsset(row)) {
      counts.usableExistingAssets += 1;
      continue;
    }
    counts.sourceRecoveryRequired += 1;
    const candidate = codeNativeCandidate(row);
    if (candidate) {
      counts.codeNativeCandidates += 1;
      await writeLine(vectorCandidates, {
        canonicalId: row.canonicalId,
        visualTemplate: row.visualTemplate,
        subject: row.subject,
        chapterKey: row.chapterKey,
        question: row.question,
        options: row.options,
        correctIndex: row.correctIndex,
        policy: "REQUIRES_DOMAIN_VALIDATION_BEFORE_RENDERING",
      });
    }
    await writeLine(recovery, {
      canonicalId: row.canonicalId,
      templateHash: row?.visualTemplate?.templateHash,
      memberIds: row?.visualTemplate?.memberIds ?? [row.canonicalId],
      memberCount: members,
      subject: row.subject,
      classLevel: row.classLevel,
      chapterKey: row.chapterKey,
      dependency: row?.visualTemplate?.visualDependency ?? "UNKNOWN",
      question: row.question,
      sourceLocations: row.sourceLocations,
      sourceLabelClaim: row?.provenance?.sourceLabel ?? null,
      existingAsset: row?.visual?.asset ?? null,
      recoveryPriority: candidate ? "LICENSED_SOURCE_OR_VALIDATED_CODE_NATIVE" : "LICENSED_SOURCE_REQUIRED",
      serveEligible: false,
    });
  }

  if (textCompletePath) {
    for await (const row of jsonLines(textCompletePath)) {
      counts.textCompleteTemplates += 1;
      counts.textCompleteAffectedQuestions += Math.max(1, Number(row?.visualTemplate?.memberCount ?? 1));
    }
  }
  await Promise.all([close(recovery), close(vectorCandidates)]);
  const report = {
    generatedAt: new Date().toISOString(), sourcePath, textCompletePath, outputDir,
    counts, byDependency, bySubject, bySourceLabel,
    storageBudget: {
      maximumBytes: 500 * 1024 * 1024,
      targetAssetCount: 10000,
      maximumAverageBytesPerAsset: Math.floor((500 * 1024 * 1024) / 10000),
      preferredFormats: ["SVG for diagrams/graphs", "WebP for extracted raster figures"],
      deduplicateBySha256: true,
      preservePaddingAndLabels: true,
    },
    policy: {
      genericAiImagesAccepted: false,
      metadataSourceLabelsDoNotProveAuthenticity: true,
      questionsWithoutExactVerifiedAssetsCannotServe: true,
      codeNativeRenderingRequiresDomainValidation: true,
      databaseWrites: 0,
    },
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
