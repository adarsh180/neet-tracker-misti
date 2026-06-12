import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    target: "ES2020",
  },
});

const { PrismaClient } = require("@prisma/client");
const { extractJsonArray } = require("../src/lib/ai-json.ts");
const { AI_MODELS, chatWithAI } = require("../src/lib/openrouter.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blueprint = JSON.parse(readFileSync(path.join(__dirname, "../src/data/trends/neet-20yr-trend-analysis-blueprint.json"), "utf8"));
const prisma = new PrismaClient();
const DEFAULT_MODELS = [AI_MODELS.fallback1, AI_MODELS.primary, AI_MODELS.emergencyFallback];
const VALID_FORMS = new Set([
  "direct_formula",
  "numerical_calculation",
  "conceptual_statement",
  "graph_based",
  "diagram_based",
  "experiment_based",
  "assertion_reason",
  "match_the_column",
  "ncert_fact",
  "case_based",
]);

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

function trendRowsForSubject(subject) {
  return blueprint.chapter_trends?.[subject] ?? [];
}

function trendContext(subject) {
  return trendRowsForSubject(subject).map((row) => ({
    id: row.id,
    chapter: row.chapter,
    classLevel: row.class_level,
    topics: (row.topic_focus ?? []).map((topic) => ({
      topic: topic.topic,
      priority: topic.trend_priority,
      forms: topic.forms,
      subtopics: topic.subtopics,
    })),
    commonForms: row.nta_question_behaviour?.most_common_forms ?? [],
  }));
}

function normalizeForm(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (VALID_FORMS.has(text)) return text;
  if (/graph/.test(text)) return "graph_based";
  if (/diagram|figure|image|fbd|structure/.test(text)) return "diagram_based";
  if (/experiment|instrument|practical/.test(text)) return "experiment_based";
  if (/match/.test(text)) return "match_the_column";
  if (/assertion|reason/.test(text)) return "assertion_reason";
  if (/numerical|calculation|calc/.test(text)) return "numerical_calculation";
  if (/formula/.test(text)) return "direct_formula";
  if (/ncert|fact/.test(text)) return "ncert_fact";
  return "conceptual_statement";
}

function clamp01(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function rowPayload(row, index) {
  return {
    id: `q${index + 1}`,
    dbId: row.id,
    subject: row.subject,
    classLevel: row.classLevel,
    chapter: row.chapter,
    topic: row.topic,
    source: row.source,
    sourceRef: row.sourceRef,
    difficulty: row.difficulty,
    question: row.question,
    options: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : [],
  };
}

async function enrichBatch(rows, options) {
  const subjects = [...new Set(rows.map((row) => row.subject))];
  const result = await chatWithAI(
    [
      {
        role: "system",
        content:
          "You label NEET question-bank metadata. Respond only with a valid JSON array. Never rewrite question text, options, answer keys, or explanations.",
      },
      {
        role: "user",
        content: `Assign trend metadata for these rows. Return exactly one object per input:
[{ "id": "q1", "trendChapterId": "id from allowed trends or null", "questionForm": "direct_formula|numerical_calculation|conceptual_statement|graph_based|diagram_based|experiment_based|assertion_reason|match_the_column|ncert_fact|case_based", "subtopic": "short snake_case or null", "isDiagramBased": true|false, "isGraphBased": true|false, "duplicateClusterId": "stable short cluster id or null", "sourceQuality": 0-1, "pyqSimilarityScore": 0-1, "confidence": 0-1 }]

Allowed trend rows:
${JSON.stringify(Object.fromEntries(subjects.map((subject) => [subject, trendContext(subject)])))}

Rules:
- trendChapterId must come from the allowed trend rows for the same subject only.
- If no trend row fits, set trendChapterId=null.
- Mark graph/diagram only when the question actually requires visual interpretation or a visual asset.
- sourceQuality estimates whether source/sourceRef looks credible, not whether the answer is correct.
- pyqSimilarityScore estimates similarity to real PYQ style; do not claim exact PYQ identity.
- Do not repair or judge the answer key.

Rows:
${JSON.stringify(rows.map(rowPayload))}`,
      },
    ],
    options.maxTokens,
    0.1,
    options.timeoutMs,
    options.models,
  );

  const labels = extractJsonArray(result.content) ?? [];
  const byId = new Map(labels.map((entry) => [String(entry.id), entry]));
  let updated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const label = byId.get(`q${index + 1}`);
    const allowed = new Set(trendRowsForSubject(row.subject).map((entry) => entry.id));
    const trendChapterId = allowed.has(String(label?.trendChapterId)) ? String(label.trendChapterId) : null;
    const confidence = clamp01(label?.confidence, 0);
    if (!label || confidence < options.minConfidence) {
      console.log(`SKIP\t${row.id}\t${row.subject}\t${row.chapter}\tlow-confidence`);
      continue;
    }

    const data = {
      trendChapterId,
      questionForm: normalizeForm(label.questionForm),
      subtopic: label.subtopic ? String(label.subtopic).trim().slice(0, 160) : null,
      isDiagramBased: Boolean(label.isDiagramBased),
      isGraphBased: Boolean(label.isGraphBased),
      duplicateClusterId: label.duplicateClusterId ? String(label.duplicateClusterId).trim().slice(0, 120) : null,
      sourceQuality: clamp01(label.sourceQuality, row.source === "AI" ? 0.65 : 0.75),
      pyqSimilarityScore: clamp01(label.pyqSimilarityScore, row.source === "NEET_PYQ" ? 0.75 : 0.35),
      trendMetaJson: {
        blueprintVersion: blueprint.schema_version,
        confidence,
        raw: label,
        model: result.model,
        enrichedAt: new Date().toISOString(),
      },
    };

    if (!options.dryRun) {
      await prisma.bankQuestion.update({ where: { id: row.id }, data });
    }
    updated += 1;
    console.log(`ENRICHED\t${row.id}\t${row.subject}\t${row.chapter}\t${data.trendChapterId ?? "-"}\t${data.questionForm}`);
  }

  return { attempted: rows.length, updated, model: result.model };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Math.max(1, Math.min(1000, Number(args.limit ?? 100)));
  const batchSize = Math.max(1, Math.min(20, Number(args.batch ?? 10)));
  const dryRun = args["dry-run"] === true || args.dryRun === true;
  const subject = args.subject ? String(args.subject) : undefined;
  const rows = await prisma.bankQuestion.findMany({
    where: {
      subject,
      qualityStatus: { notIn: ["REJECTED", "NEEDS_VISUAL_ASSET"] },
      OR: [{ trendChapterId: null }, { questionForm: null }, { trendMetaJson: null }],
    },
    orderBy: [{ timesServed: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  const totals = { attempted: 0, updated: 0, batches: 0 };
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const summary = await enrichBatch(batch, {
      dryRun,
      maxTokens: Number(args.maxTokens ?? 5000),
      timeoutMs: Number(args.timeoutMs ?? 300000),
      minConfidence: Number(args.minConfidence ?? 0.55),
      models: DEFAULT_MODELS,
    });
    totals.attempted += summary.attempted;
    totals.updated += summary.updated;
    totals.batches += 1;
    console.log(`BATCH\t${totals.batches}\t${summary.model}\t${summary.updated}/${summary.attempted}`);
  }
  console.log(JSON.stringify({ ...totals, dryRun }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
