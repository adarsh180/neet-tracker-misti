import { createHash } from "node:crypto";

import { db } from "./db";

export const QUESTION_VISUAL_MAX_BYTES = 20_000;
export const QUESTION_VISUAL_DATABASE_BUDGET_BYTES = 500_000_000;
export const QUESTION_VISUAL_MIME_TYPE = "image/svg+xml; charset=utf-8";

type RenderedQuestionVisual = {
  kind: "GRAPH" | "DIAGRAM";
  alt: string;
  svg: string;
};

function minifySvg(svg: string) {
  return svg.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}

function validateSvg(svg: string) {
  if (!svg.startsWith("<svg ") || !svg.endsWith("</svg>")) throw new Error("Visual renderer did not return a complete SVG document");
  if (!/viewBox="0 0 900 560"/.test(svg)) throw new Error("Question SVG must use the fixed padded 900x560 viewBox");
  if (/<(?:script|foreignObject|image|use|iframe|object|embed)\b/i.test(svg)) throw new Error("Question SVG contains a forbidden active or external element");
  if (/\b(?:href|xlink:href)\s*=/i.test(svg)) throw new Error("Question SVG contains an external reference");
  if (/\b(?:src|style)\s*=\s*["'][^"']*(?:https?:|data:|javascript:)/i.test(svg)) throw new Error("Question SVG contains an unsafe external value");
  if (/url\((?!#[A-Za-z][\w:.-]*\))/i.test(svg)) throw new Error("Question SVG contains a non-local CSS URL");
}

export function prepareQuestionVisualAsset(rendered: RenderedQuestionVisual) {
  const svg = minifySvg(rendered.svg);
  validateSvg(svg);
  const fileData = Buffer.from(svg, "utf8");
  if (fileData.byteLength > QUESTION_VISUAL_MAX_BYTES) {
    throw new Error(`Question SVG is ${fileData.byteLength} bytes; maximum is ${QUESTION_VISUAL_MAX_BYTES}`);
  }
  const contentHash = createHash("sha256").update(fileData).digest("hex");
  return {
    ...rendered,
    alt: rendered.alt.trim().slice(0, 2000),
    svg,
    fileData,
    byteSize: fileData.byteLength,
    contentHash,
  };
}

export async function storeQuestionVisualAsset(rendered: RenderedQuestionVisual) {
  const prepared = prepareQuestionVisualAsset(rendered);
  const { fileData, contentHash } = prepared;
  const existing = await db.questionVisualAsset.findUnique({ where: { contentHash } });
  if (existing) return { asset: existing, deduplicated: true, databaseBytesAfter: null as number | null };

  return db.$transaction(async (transaction) => {
    const insideTransaction = await transaction.questionVisualAsset.findUnique({ where: { contentHash } });
    if (insideTransaction) return { asset: insideTransaction, deduplicated: true, databaseBytesAfter: null as number | null };
    const aggregate = await transaction.questionVisualAsset.aggregate({ _sum: { byteSize: true } });
    const currentBytes = aggregate._sum.byteSize ?? 0;
    const databaseBytesAfter = currentBytes + prepared.byteSize;
    if (databaseBytesAfter > QUESTION_VISUAL_DATABASE_BUDGET_BYTES) {
      throw new Error(`Question visual database budget exceeded: ${databaseBytesAfter}/${QUESTION_VISUAL_DATABASE_BUDGET_BYTES} bytes`);
    }
    const asset = await transaction.questionVisualAsset.create({
      data: {
        contentHash,
        mimeType: QUESTION_VISUAL_MIME_TYPE,
        kind: prepared.kind,
        altText: prepared.alt,
        byteSize: prepared.byteSize,
        fileData,
      },
    });
    return { asset, deduplicated: false, databaseBytesAfter };
  }, { isolationLevel: "Serializable" });
}

export async function questionVisualStorageStats() {
  const [count, aggregate, linkedQuestions] = await Promise.all([
    db.questionVisualAsset.count(),
    db.questionVisualAsset.aggregate({ _sum: { byteSize: true }, _avg: { byteSize: true }, _max: { byteSize: true } }),
    db.bankQuestion.count({ where: { visualAssetId: { not: null } } }),
  ]);
  const totalBytes = aggregate._sum.byteSize ?? 0;
  return {
    assets: count,
    linkedQuestions,
    totalBytes,
    averageBytes: aggregate._avg.byteSize ?? 0,
    maximumBytes: aggregate._max.byteSize ?? 0,
    budgetBytes: QUESTION_VISUAL_DATABASE_BUDGET_BYTES,
    remainingBytes: QUESTION_VISUAL_DATABASE_BUDGET_BYTES - totalBytes,
    utilization: totalBytes / QUESTION_VISUAL_DATABASE_BUDGET_BYTES,
  };
}
