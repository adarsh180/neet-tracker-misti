/**
 * Generates PWA / favicon assets from public/brand/neet-doctor-logo.png
 * Run: node scripts/generate-brand-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/brand/neet-doctor-logo.png");
const publicDir = path.join(root, "public");
const brandDir = path.join(publicDir, "brand");

/** Crop to emblem (above wordmark) for app marks and maskable icons */
async function emblemPipeline() {
  const meta = await sharp(source).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const cropH = Math.round(h * 0.72);
  return sharp(source).extract({ left: 0, top: 0, width: w, height: cropH });
}

async function writeEmblemMark() {
  await emblemPipeline()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .png({ quality: 92, compressionLevel: 9 })
    .toFile(path.join(brandDir, "neet-doctor-mark.png"));
}

async function writeRasterIcons() {
  const emblem = emblemPipeline();

  const sizes = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-icon.png", 180],
    ["favicon-32.png", 32],
    ["maskable-512.png", 512, true],
  ];

  for (const [name, size, maskable] of sizes) {
    let pipe = emblem.clone().resize(size, size, { fit: "cover", position: "centre" });
    if (maskable) {
      const pad = Math.round(size * 0.12);
      const inner = size - pad * 2;
      const innerBuf = await emblem
        .clone()
        .resize(inner, inner, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();
      pipe = sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 30, g: 95, b: 210, alpha: 1 },
        },
      }).composite([{ input: innerBuf, gravity: "centre" }]);
    }
    await pipe.png({ quality: 92, compressionLevel: 9 }).toFile(path.join(publicDir, name));
  }

  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map((s) =>
      emblem.clone().resize(s, s, { fit: "cover", position: "centre" }).png().toBuffer(),
    ),
  );
  await sharp(icoBuffers[0]).toFile(path.join(publicDir, "favicon.ico"));
  for (let i = 1; i < icoBuffers.length; i++) {
    await sharp(path.join(publicDir, "favicon.ico"))
      .resize(icoSizes[i], icoSizes[i])
      .toFile(path.join(publicDir, "favicon.ico"));
  }
}

async function writeAppIconSvg() {
  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1B4FD4"/>
      <stop offset="1" stop-color="#0E2F8C"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(256 210) rotate(90) scale(220)">
      <stop stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="220" fill="url(#glow)"/>
  <image href="/brand/neet-doctor-mark.png" x="56" y="36" width="400" height="400" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  await writeFile(path.join(publicDir, "app-icon.svg"), svg, "utf8");
  await writeFile(path.join(publicDir, "maskable-icon.svg"), svg.replace('rx="112"', 'rx="0"'), "utf8");
}

async function main() {
  await mkdir(brandDir, { recursive: true });
  await writeEmblemMark();
  await writeRasterIcons();
  await writeAppIconSvg();
  console.log("Brand icons generated in public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
