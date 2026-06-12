import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    target: "ES2020",
  },
});

const { insertBankQuestions } = require("../src/lib/question-bank.ts");

function parseArgs(argv) {
  const args = { files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args.files.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows
    .filter((entry) => entry.some((cellValue) => cellValue.trim()))
    .map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""])));
}

function unwrapJsonRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["rows", "questions", "items", "data"]) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
  }
  throw new Error("JSON import must be an array or contain rows/questions/items/data");
}

async function loadRows(filePath) {
  const text = await readFile(filePath, "utf8");
  if (/\.json$/i.test(filePath)) return unwrapJsonRows(JSON.parse(text));
  if (/\.csv$/i.test(filePath)) return parseCsv(text);
  throw new Error(`Unsupported import file: ${filePath}`);
}

const args = parseArgs(process.argv.slice(2));
const importDir = path.resolve(args.dir || "data/bank-import");
const filePaths = args.files.length
  ? args.files.map((file) => path.resolve(file))
  : (await readdir(importDir))
      .filter((file) => /\.(json|csv)$/i.test(file))
      .map((file) => path.join(importDir, file));

if (!filePaths.length) {
  console.log(`No JSON/CSV files found in ${importDir}`);
  process.exit(0);
}

let grand = { total: 0, valid: 0, inserted: 0, duplicate: 0, invalid: 0 };

for (const filePath of filePaths) {
  const rows = await loadRows(filePath);
  const report = await insertBankQuestions(rows, {
    trusted: Boolean(args.trusted),
    importBatch: path.basename(filePath),
  });
  grand.total += report.total;
  grand.valid += report.valid;
  grand.inserted += report.inserted;
  grand.duplicate += report.duplicate;
  grand.invalid += report.invalid.length;
  console.log(`${path.basename(filePath)} inserted=${report.inserted} duplicate=${report.duplicate} invalid=${report.invalid.length}`);
  for (const invalid of report.invalid.slice(0, 20)) {
    console.log(`invalid\trow=${invalid.index + 1}\t${invalid.reason}`);
  }
}

console.log(
  `TOTAL inserted=${grand.inserted} duplicate=${grand.duplicate} invalid=${grand.invalid} valid=${grand.valid} rows=${grand.total}`,
);
