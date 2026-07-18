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

function rowId(row) {
  return String(row?.canonicalId ?? row?.original?.canonicalId ?? row?.variant?.canonicalId ?? row?.wrapper?.original?.canonicalId ?? "");
}

async function writeLine(stream, row) {
  if (!stream.write(`${JSON.stringify(row)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.exclude || !args.out) throw new Error("--source, --exclude and --out are required");
  const sourcePath = path.resolve(String(args.source));
  const excludePath = path.resolve(String(args.exclude));
  const outputPath = path.resolve(String(args.out));
  await mkdir(path.dirname(outputPath), { recursive: true });
  const excluded = new Set();
  for await (const row of jsonLines(excludePath)) {
    const id = rowId(row);
    if (id) excluded.add(id);
  }
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const counts = { source: 0, excludeIds: excluded.size, selected: 0, excluded: 0, missingId: 0 };
  for await (const row of jsonLines(sourcePath)) {
    counts.source += 1;
    const id = rowId(row);
    if (!id) {
      counts.missingId += 1;
      continue;
    }
    if (excluded.has(id)) counts.excluded += 1;
    else {
      counts.selected += 1;
      await writeLine(output, row);
    }
  }
  await close(output);
  const report = { generatedAt: new Date().toISOString(), sourcePath, excludePath, outputPath, counts, databaseWrites: 0 };
  await writeFile(`${outputPath}.report.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
