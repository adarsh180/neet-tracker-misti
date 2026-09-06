import { cp, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Versioned, same-origin worker/font assets; no CDN dependency or PDF upload.
const source = resolve("node_modules/pdfjs-dist");
const { version } = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
const destination = resolve("public/vendor/pdfjs", version);
await mkdir(destination, { recursive: true });
for (const entry of ["cmaps", "standard_fonts", "wasm", "LICENSE"]) {
  await cp(resolve(source, entry), resolve(destination, entry), { recursive: true });
}
await cp(resolve(source, "build/pdf.worker.min.mjs"), resolve(destination, "pdf.worker.min.mjs"));
console.log(`Prepared PDF.js ${version} browser assets.`);
