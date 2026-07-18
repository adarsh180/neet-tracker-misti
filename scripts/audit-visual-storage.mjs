import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
require("@next/env").loadEnvConfig(process.cwd());

const { questionVisualStorageStats, QUESTION_VISUAL_MAX_BYTES } = require("../src/lib/question-visual-assets.ts");
const { db } = require("../src/lib/db.ts");

const stats = await questionVisualStorageStats();
const invalidMimeTypes = await db.questionVisualAsset.count({ where: { mimeType: { not: "image/svg+xml; charset=utf-8" } } });
const overPerAssetBudget = await db.questionVisualAsset.count({ where: { byteSize: { gt: QUESTION_VISUAL_MAX_BYTES } } });
const projectedTenThousandBytes = stats.assets > 0 ? Math.ceil(stats.averageBytes * 10_000) : null;
console.log(JSON.stringify({ ...stats, invalidMimeTypes, overPerAssetBudget, projectedTenThousandBytes }, null, 2));
await db.$disconnect();
