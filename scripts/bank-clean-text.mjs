import { createRequire } from "node:module";

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
const { cleanQuestionOptions, cleanQuestionText, hasUnreadableText } = require("../src/lib/text-cleanup.ts");

const prisma = new PrismaClient();
const BAD_MARKERS = ["\u00c2", "\u00c3", "\u00e2", "\u00ce", "\u00cf", "\ufffd"];

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

function changedRow(row) {
  const options = Array.isArray(row.optionsJson) ? cleanQuestionOptions(row.optionsJson) : row.optionsJson;
  const next = {
    question: cleanQuestionText(row.question),
    optionsJson: options,
    explanation: cleanQuestionText(row.explanation),
    sourceRef: cleanQuestionText(row.sourceRef),
  };
  const before = JSON.stringify({
    question: row.question,
    optionsJson: row.optionsJson,
    explanation: row.explanation,
    sourceRef: row.sourceRef,
  });
  const after = JSON.stringify(next);
  return before === after ? null : next;
}

async function cleanBankRows(options) {
  const where = {
    OR: BAD_MARKERS.flatMap((marker) => [
      { question: { contains: marker } },
      { explanation: { contains: marker } },
      { sourceRef: { contains: marker } },
    ]),
  };
  const rows = await prisma.bankQuestion.findMany({
    where,
    select: { id: true, subject: true, chapter: true, question: true, optionsJson: true, explanation: true, sourceRef: true },
    take: options.limit,
  });

  let updated = 0;
  for (const row of rows) {
    const beforeHasIssue =
      hasUnreadableText(row.question) ||
      hasUnreadableText(row.explanation) ||
      hasUnreadableText(row.sourceRef) ||
      (Array.isArray(row.optionsJson) && row.optionsJson.some(hasUnreadableText));
    if (!beforeHasIssue) continue;
    const next = changedRow(row);
    if (!next) continue;
    updated += 1;
    if (!options.dryRun) await prisma.bankQuestion.update({ where: { id: row.id }, data: next });
    console.log(`${options.dryRun ? "WOULD_CLEAN" : "CLEANED"}\t${row.id}\t${row.subject}\t${row.chapter}`);
  }
  return { scanned: rows.length, updated };
}

async function cleanPracticeTests(options) {
  const tests = await prisma.practiceTest.findMany({
    where: {
      status: { in: ["GENERATING", "READY", "RUNNING", "PAUSED"] },
      questionsJson: { not: [] },
    },
    select: { id: true, questionsJson: true },
    take: options.limit,
  });
  let updated = 0;
  for (const test of tests) {
    const questions = Array.isArray(test.questionsJson) ? test.questionsJson : [];
    let changed = false;
    const nextQuestions = questions.map((question) => {
      if (!question || typeof question !== "object") return question;
      const next = {
        ...question,
        question: cleanQuestionText(question.question),
        options: Array.isArray(question.options) ? cleanQuestionOptions(question.options) : question.options,
        explanation: cleanQuestionText(question.explanation),
        sourceRef: cleanQuestionText(question.sourceRef),
      };
      if (JSON.stringify(next) !== JSON.stringify(question)) changed = true;
      return next;
    });
    if (!changed) continue;
    updated += 1;
    if (!options.dryRun) await prisma.practiceTest.update({ where: { id: test.id }, data: { questionsJson: nextQuestions } });
    console.log(`${options.dryRun ? "WOULD_CLEAN_TEST" : "CLEANED_TEST"}\t${test.id}`);
  }
  return { scanned: tests.length, updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    dryRun: args["dry-run"] === true || args.dryRun === true,
    limit: Math.max(1, Math.min(200000, Number(args.limit ?? 200000))),
  };
  const bank = await cleanBankRows(options);
  const practiceTests = args["practice-tests"] ? await cleanPracticeTests(options) : { scanned: 0, updated: 0 };
  console.log(JSON.stringify({ bank, practiceTests, dryRun: options.dryRun }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
