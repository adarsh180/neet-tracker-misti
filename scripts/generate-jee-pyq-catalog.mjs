import { readdir, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve(process.argv[2] || "D:\\NEET\\PYQ\\JEE");
const outputFile = path.resolve(
  process.argv[3] || "src/data/pyq/jee-catalog.json",
);

function cleanTitle(fileName) {
  const title = fileName
    .replace(/\.pdf$/i, "")
    .replace(/\s+Previous Year Paper with Answer Keys\s*-\s*MathonGo$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title.includes("-")) {
    return title;
  }

  return title
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const directoryEntries = await readdir(sourceRoot, { withFileTypes: true });
const yearNames = directoryEntries
  .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => Number(b) - Number(a));

const years = [];

for (const year of yearNames) {
  const yearRoot = path.join(sourceRoot, year);
  const files = (await readdir(yearRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  if (files.length === 0) {
    continue;
  }

  const papers = await Promise.all(
    files.map(async (file, index) => {
      const details = await stat(path.join(yearRoot, file.name));

      return {
        id: `jee-${year}-${String(index + 1).padStart(2, "0")}`,
        year,
        title: cleanTitle(file.name),
        fileName: file.name,
        pathname: `pyq/jee/${year}/${file.name}`,
        bytes: details.size,
      };
    }),
  );

  years.push({
    year,
    papers,
    totalBytes: papers.reduce((total, paper) => total + paper.bytes, 0),
  });
}

const catalog = {
  exam: "JEE Main",
  firstYear: years.at(-1)?.year ?? null,
  lastYear: years.at(0)?.year ?? null,
  totalPapers: years.reduce((total, year) => total + year.papers.length, 0),
  totalBytes: years.reduce((total, year) => total + year.totalBytes, 0),
  years,
};

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

console.log(
  `Generated ${catalog.totalPapers} JEE Main papers (${catalog.firstYear}-${catalog.lastYear}) at ${outputFile}`,
);
