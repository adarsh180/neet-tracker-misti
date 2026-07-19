import { writeFile } from "node:fs/promises";
import path from "node:path";

import katex from "katex";

import { db } from "../src/lib/db";
import { normalizeQuestionMarkdown } from "../src/lib/question-markdown";

type FieldName = "question" | "option" | "explanation" | "optionExplanation";
type FindingKind = "UNBALANCED_TEX_DELIMITER" | "UNBALANCED_DOLLAR" | "RAW_TEX_COMMAND" | "DAMAGED_TEX_COMMAND" | "KATEX_PARSE_ERROR";
type Finding = { bankQuestionId: string; subject: string; chapter: string; field: FieldName; kind: FindingKind; preview: string; detail?: string };

const MATH_SEGMENT = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
const RAW_TEX_COMMAND = /\\(?:begin|ce|d?frac|mathrm|mathbf|mathit|operatorname|overline|underline|sqrt|text|vec|hat|bar|dot|ddot|times|cdot|div|pm|mp|leq?|geq?|neq|approx|propto|infty|sum|prod|int|lim|log|ln|sin|cos|tan|Delta|delta|theta|alpha|beta|gamma|lambda|mu|nu|pi|rho|sigma|omega)\b/;
const DAMAGED_TEX_COMMAND = /(?:^|[^A-Za-z\\])(?:rac|ext|qrt|egin)\s*\{/i;

function count(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

function preview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 260);
}

function auditText(meta: { id: string; subject: string; chapter: string }, field: FieldName, value: unknown) {
  const original = String(value ?? "");
  if (!original) return [] as Finding[];
  const findings: Finding[] = [];
  const add = (kind: FindingKind, detail?: string) => findings.push({
    bankQuestionId: meta.id,
    subject: meta.subject,
    chapter: meta.chapter,
    field,
    kind,
    preview: preview(original),
    detail,
  });

  if (count(original, /\\\(/g) !== count(original, /\\\)/g) || count(original, /\\\[/g) !== count(original, /\\\]/g)) {
    add("UNBALANCED_TEX_DELIMITER");
  }

  const normalized = normalizeQuestionMarkdown(original);
  const matches = [...normalized.matchAll(MATH_SEGMENT)];
  const dollarCount = count(normalized, /(?<!\\)\$/g);
  if (dollarCount % 2 !== 0) add("UNBALANCED_DOLLAR");

  let outsideMath = normalized;
  for (const match of matches) outsideMath = outsideMath.replace(match[0], " ");
  if (RAW_TEX_COMMAND.test(outsideMath)) add("RAW_TEX_COMMAND");

  for (const match of matches) {
    const expression = match[1] ?? match[2] ?? "";
    if (DAMAGED_TEX_COMMAND.test(expression)) add("DAMAGED_TEX_COMMAND", expression.slice(0, 180));
    try {
      katex.renderToString(expression, { displayMode: match[1] !== undefined, throwOnError: true, strict: "error", output: "html" });
    } catch (error) {
      add("KATEX_PARSE_ERROR", error instanceof Error ? error.message.slice(0, 300) : "Unknown KaTeX error");
    }
  }
  return findings;
}

async function main() {
  const batchSize = 2_000;
  let cursor: string | undefined;
  let auditedQuestions = 0;
  let auditedFields = 0;
  const findings: Finding[] = [];
  const counts: Record<FindingKind, number> = {
    UNBALANCED_TEX_DELIMITER: 0,
    UNBALANCED_DOLLAR: 0,
    RAW_TEX_COMMAND: 0,
    DAMAGED_TEX_COMMAND: 0,
    KATEX_PARSE_ERROR: 0,
  };

  while (true) {
    const rows = await db.bankQuestion.findMany({
      where: { verified: true, qualityStatus: "VERIFIED_STRICT" },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, subject: true, chapter: true, question: true, optionsJson: true, explanation: true, optionExplanationsJson: true },
    });
    if (!rows.length) break;
    for (const row of rows) {
      auditedQuestions += 1;
      const fields: Array<[FieldName, unknown]> = [
        ["question", row.question],
        ...((Array.isArray(row.optionsJson) ? row.optionsJson : []).map((value) => ["option", value] as [FieldName, unknown])),
        ["explanation", row.explanation],
        ...((Array.isArray(row.optionExplanationsJson) ? row.optionExplanationsJson : []).map((value) => ["optionExplanation", value] as [FieldName, unknown])),
      ];
      for (const [field, value] of fields) {
        auditedFields += 1;
        for (const finding of auditText(row, field, value)) {
          counts[finding.kind] += 1;
          if (findings.length < 2_000) findings.push(finding);
        }
      }
    }
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) break;
  }

  const report = { generatedAt: new Date().toISOString(), auditedQuestions, auditedFields, counts, sampleFindings: findings };
  const output = path.resolve("data", "bank-import", "question-rendering-audit.json");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, sampleFindings: findings.slice(0, 25), output }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
