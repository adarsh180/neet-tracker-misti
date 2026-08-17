import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";

const require = createRequire(import.meta.url);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), "src", request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node", target: "ES2020" } });
require("@next/env").loadEnvConfig(process.cwd());

const { db } = require("../src/lib/db.ts");
const { CURRENT_NEET_CHAPTERS, NEET_2026_SYLLABUS_SOURCE } = require("../src/data/syllabus/neet-2026.ts");

await db.$transaction(async (tx) => {
  await tx.syllabusVersion.updateMany({ where: { exam: "NEET_UG", isActive: true }, data: { isActive: false } });
  const version = await tx.syllabusVersion.upsert({
    where: { slug: NEET_2026_SYLLABUS_SOURCE.slug },
    create: {
      slug: NEET_2026_SYLLABUS_SOURCE.slug,
      exam: NEET_2026_SYLLABUS_SOURCE.exam,
      examYear: NEET_2026_SYLLABUS_SOURCE.examYear,
      title: NEET_2026_SYLLABUS_SOURCE.title,
      sourceUrl: NEET_2026_SYLLABUS_SOURCE.sourceUrl,
      sourceSha256: NEET_2026_SYLLABUS_SOURCE.sha256,
      publishedAt: new Date(`${NEET_2026_SYLLABUS_SOURCE.publishedOn}T00:00:00.000Z`),
      isActive: true,
    },
    update: { sourceUrl: NEET_2026_SYLLABUS_SOURCE.sourceUrl, sourceSha256: NEET_2026_SYLLABUS_SOURCE.sha256, isActive: true },
  });
  await tx.syllabusNode.deleteMany({ where: { versionId: version.id } });
  await tx.syllabusNode.createMany({
    data: CURRENT_NEET_CHAPTERS.map((chapter, position) => ({
      versionId: version.id,
      kind: "CHAPTER",
      subject: chapter.subject,
      classLevel: chapter.classLevel,
      title: chapter.chapter,
      canonicalKey: `${chapter.slug}:${chapter.classLevel}:${chapter.chapter}`,
      aliasesJson: chapter.aliases,
      status: "ACTIVE",
      position,
    })),
  });
  console.log(JSON.stringify({ version: version.slug, chapters: CURRENT_NEET_CHAPTERS.length, sourceSha256: version.sourceSha256 }, null, 2));
}, { timeout: 60000 });
await db.$disconnect();
