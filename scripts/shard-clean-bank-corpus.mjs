import { createWriteStream, createReadStream } from "node:fs";
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
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("corpus-")).map((entry) => entry.name).sort();
  if (!directories.length) throw new Error(`No corpus directories found under ${root}`);
  return path.join(root, directories.at(-1));
}

function slug(value) {
  return String(value ?? "unknown")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

async function writeChunk(stream, text) {
  if (!stream.write(text)) await once(stream, "drain");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(String(args.root || DEFAULT_ROOT));
  const corpusDir = args.dir ? path.resolve(String(args.dir)) : await latestCorpus(root);
  const outputDir = path.join(corpusDir, "chapter-shards");
  await mkdir(outputDir, { recursive: false });
  const inputPath = path.join(corpusDir, "canonical-unique.jsonl");
  const shards = new Map();
  let records = 0;

  for await (const line of createInterface({ input: createReadStream(inputPath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (!line) continue;
    const record = JSON.parse(line);
    const subject = slug(record.subject);
    const classLevel = record.classLevel === "11" || record.classLevel === "12" ? `class-${record.classLevel}` : "class-unknown";
    const chapter = slug(record.chapter);
    const key = `${subject}/${classLevel}/${chapter}`;
    let shard = shards.get(key);
    if (!shard) {
      const directory = path.join(outputDir, subject, classLevel);
      await mkdir(directory, { recursive: true });
      const filePath = path.join(directory, `${chapter}.json`);
      const stream = createWriteStream(filePath, { encoding: "utf8", flags: "wx" });
      await writeChunk(stream, "[\n");
      shard = { key, filePath, stream, count: 0 };
      shards.set(key, shard);
    }
    await writeChunk(shard.stream, `${shard.count ? ",\n" : ""}${line}`);
    shard.count += 1;
    records += 1;
  }

  for (const shard of shards.values()) {
    await writeChunk(shard.stream, "\n]\n");
    shard.stream.end();
  }
  await Promise.all([...shards.values()].map((shard) => once(shard.stream, "finish")));

  let verifiedRecords = 0;
  const manifestShards = [];
  for (const shard of [...shards.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const parsed = JSON.parse(await readFile(shard.filePath, "utf8"));
    if (!Array.isArray(parsed) || parsed.length !== shard.count) throw new Error(`Shard verification failed: ${shard.filePath}`);
    verifiedRecords += parsed.length;
    manifestShards.push({ key: shard.key, file: path.relative(corpusDir, shard.filePath).replaceAll("\\", "/"), records: shard.count });
  }
  if (verifiedRecords !== records) throw new Error(`Shard total ${verifiedRecords} does not match input total ${records}`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    corpusDir,
    outputDir,
    passed: true,
    records,
    verifiedRecords,
    shardCount: shards.size,
    shards: manifestShards,
  };
  const manifestPath = path.join(outputDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ manifestPath, records, verifiedRecords, shardCount: shards.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
