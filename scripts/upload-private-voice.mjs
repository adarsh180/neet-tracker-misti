#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { put } from "@vercel/blob";

const inputDirectory = process.argv[2];

if (!inputDirectory) {
  throw new Error("Usage: node scripts/upload-private-voice.mjs <generated-mp3-directory>");
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required");
}

const directory = resolve(inputDirectory);
const entries = (await readdir(directory))
  .filter((entry) => entry.endsWith(".mp3"))
  .sort();

if (entries.length !== 32) {
  throw new Error(`Expected 32 private prompt clips, found ${entries.length}`);
}

for (const entry of entries) {
  const path = resolve(directory, entry);
  const info = await stat(path);
  if (!info.isFile() || info.size < 2_000) {
    throw new Error(`Invalid private voice clip: ${entry}`);
  }

  const clipId = basename(entry, ".mp3");
  await put(`voice/adarsh-v1/${clipId}.mp3`, await import("node:fs").then(({ createReadStream }) => createReadStream(path)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "audio/mpeg",
  });
  console.log(`Uploaded ${clipId}`);
}

console.log(`Uploaded ${entries.length} authenticated private voice clips.`);
