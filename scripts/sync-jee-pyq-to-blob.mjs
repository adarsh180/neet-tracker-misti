import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

const sourceRoot = path.resolve(process.argv[2] || "D:\\NEET\\PYQ\\JEE");
const token = process.env.BLOB_READ_WRITE_TOKEN;
const uploadConcurrency = Number.parseInt(process.env.PYQ_UPLOAD_CONCURRENCY || "4", 10);
const blobAccess = process.env.PYQ_BLOB_ACCESS === "public" ? "public" : "private";

if (!token) {
  throw new Error(
    "BLOB_READ_WRITE_TOKEN is required. Connect a public Vercel Blob store and pull its environment variables first.",
  );
}

const directories = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const files = [];

for (const year of directories) {
  const yearRoot = path.join(sourceRoot, year);
  const pdfs = (await readdir(yearRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));

  for (const pdf of pdfs) {
    const fullPath = path.join(yearRoot, pdf.name);
    const details = await stat(fullPath);

    files.push({
      fullPath,
      bytes: details.size,
      pathname: `pyq/jee/${year}/${pdf.name}`,
    });
  }
}

const uploadedPaths = new Set();
let cursor;

do {
  const page = await list({ prefix: "pyq/jee/", cursor, limit: 1000, token });
  page.blobs.forEach((blob) => uploadedPaths.add(blob.pathname));
  cursor = page.cursor;
} while (cursor);

const pendingFiles = files.filter((file) => !uploadedPaths.has(file.pathname));
console.log(`${uploadedPaths.size} PDFs already uploaded; ${pendingFiles.length} remaining.`);

if (pendingFiles.length === 0) {
  process.exit(0);
}

let nextIndex = 0;
let uploadedCount = 0;
let storeOrigin = "";

async function uploadWorker() {
  while (nextIndex < pendingFiles.length) {
    const index = nextIndex;
    nextIndex += 1;
    const file = pendingFiles[index];
    const blob = await put(file.pathname, createReadStream(file.fullPath), {
      access: blobAccess,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 2592000,
      contentType: "application/pdf",
      multipart: file.bytes > 8 * 1024 * 1024,
      token,
    });

    storeOrigin ||= new URL(blob.url).origin;
    uploadedCount += 1;
    console.log(`[${uploadedCount}/${pendingFiles.length}] ${file.pathname}`);
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(uploadConcurrency, pendingFiles.length) },
    () => uploadWorker(),
  ),
);

console.log(`Uploaded ${uploadedCount} new PDF files.`);
console.log(`Stored files with ${blobAccess} access in ${storeOrigin || "the connected Blob store"}.`);
