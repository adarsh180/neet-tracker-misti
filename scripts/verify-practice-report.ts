import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import puppeteer from "puppeteer-core";

import { buildPracticeReportHtml } from "../src/lib/practice-report";

async function main() {
  const questions = [
    {
      id: "q1",
      subject: "Physics",
      chapter: "Laws of Motion",
      topic: "Friction",
      source: "AI",
      sourceRef: "Automated strict sample",
      difficulty: "MODERATE",
      question: String.raw`A closed gas system absorbs \(550\,\mathrm{J}\) of heat and does \(175\,\mathrm{J}\) of work. What is the change in internal energy?`,
      options: [String.raw`\(725\,\mathrm{J}\)`, String.raw`\(-375\,\mathrm{J}\)`, String.raw`\(375\,\mathrm{J}\)`, String.raw`\(550\,\mathrm{J}\)`],
      correctIndex: 2,
      explanation: String.raw`Using \(\Delta U=Q-W\), the result is \(375\,\mathrm{J}\).`,
      optionExplanations: ["This adds heat and work.", "This reverses the sign.", String.raw`Correct: \(550-175=375\,\mathrm{J}\).`, "This ignores work."],
      verified: true,
    },
    {
      id: "q2",
      subject: "Botany",
      chapter: "8 Photosynthesis in higher plants",
      topic: "Calvin cycle",
      source: "AI",
      sourceRef: "Automated strict sample",
      difficulty: "TOUGH",
      question: "Which molecule is the primary carbon dioxide acceptor in the Calvin cycle?",
      options: ["PEP", "RuBP", "PGA", "Oxaloacetate"],
      correctIndex: 1,
      explanation: "RuBP accepts carbon dioxide in the RuBisCO-catalysed carboxylation step.",
      optionExplanations: ["PEP is the initial acceptor in C4 fixation.", "Correct: RuBP is the Calvin-cycle acceptor.", "PGA is the first stable product, not the acceptor.", "Oxaloacetate is the first stable C4 product."],
      verified: true,
    },
  ];
  const result = {
    score: 3,
    maxScore: 8,
    percentage: 37.5,
    correct: 1,
    wrong: 1,
    skipped: 0,
    attempted: 2,
    timeTakenSeconds: 124,
    subjectScores: [
      { subject: "Physics", correct: 0, wrong: 1, skipped: 0, score: -1, maxScore: 4 },
      { subject: "Botany", correct: 1, wrong: 0, skipped: 0, score: 4, maxScore: 4 },
    ],
  };
  const test = {
    id: "report-fixture",
    title: "NEET Full Mock - PDF Verification",
    mode: "FULL_LENGTH",
    difficulty: "MIXED",
    durationMinutes: 180,
    questionCount: 2,
    completedAt: new Date(),
    totalActiveSeconds: 124,
    resultJson: result,
    questionsJson: questions,
    answersJson: [{ id: "q1", optionIndex: 0 }, { id: "q2", optionIndex: 1 }],
  };
  const reviews = [
    { questionId: "q1", questionNumber: 1, outcome: "WRONG", mistakeTag: "SILLY_MISTAKE", customMistakeText: null, reviewComplete: true },
    { questionId: "q2", questionNumber: 2, outcome: "CORRECT", mistakeTag: null, customMistakeText: null, reviewComplete: true },
  ];
  const outputDir = path.resolve("tmp", "pdfs");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "practice-performance-sample.pdf");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildPracticeReportHtml(test, reviews, "http://localhost:3000"), { waitUntil: "load" });
    const mathAudit = await page.evaluate(() => ({
      katexNodes: document.querySelectorAll(".katex").length,
      hasRawMathCommand: document.body.innerText.includes("\\mathrm"),
    }));
    if (mathAudit.katexNodes < 6 || mathAudit.hasRawMathCommand) {
      throw new Error(`Math rendering audit failed: ${JSON.stringify(mathAudit)}`);
    }
    await page.emulateMediaType("print");
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    await writeFile(outputPath, pdf);
    console.log(outputPath);
  } finally {
    await browser.close();
  }
}

main();
