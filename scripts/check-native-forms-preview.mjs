import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const directory = path.resolve("output/mobile-forms-preview"), output = path.resolve("output/mobile-qa");
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const target = path.resolve(directory, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(directory + path.sep)) throw new Error("Outside export");
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" })[path.extname(target)] || "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(8083, "127.0.0.1", resolve));
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const report = [];
try {
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const click = async text => { const button = page.locator(`::-p-text(${text})`); await button.click(); };
  const fill = async (label, value) => page.locator(`[aria-label="${label}"]`).fill(value);
  for (const [name, width, height] of [["phone", 390, 844], ["ipad", 820, 1180], ["wide", 1440, 1000]]) {
    await page.setViewport({ width, height });
    await page.goto("http://127.0.0.1:8083", { waitUntil: "networkidle2" });
    await click("Open day editor");
    await page.waitForSelector('[aria-label="Log Physics"]');
    await page.locator('[aria-label="Log Physics"]').click();
    await fill("Physics · Study hours", "2.5"); await fill("Physics · Questions solved", "80"); await fill("Physics · Intensity · 0–5", "4");
    await fill("Discipline · 0–100", "85"); await fill("Plan completed · %", "90");
    await page.evaluate(() => document.fonts.ready);
    // Include scroll containers in overflow checks, not only the outer document.
    const overflow = await page.evaluate(() => [...document.querySelectorAll("div")].some(el => el.clientWidth > 50 && el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).overflowX !== "hidden"));
    assert.equal(overflow, false, `${name}: horizontal overflow`);
    await page.screenshot({ path: path.join(output, `native-daily-${name}.png`) });
    await click("Review your changes");
    await page.waitForFunction(() => document.body.textContent.includes("2.5 hours · 80 questions"));
    assert.ok(!(await page.evaluate(() => document.body.textContent)).includes("Chemistry · 0"));
    await page.screenshot({ path: path.join(output, `native-daily-review-${name}.png`) });
    await click("Confirm & save"); await page.waitForFunction(() => document.body.textContent.includes("Fixture save confirmed"));
    await click("Open task editor"); await fill("Task title", "Revise Newton’s laws of motion"); await fill("Planned minutes · optional", "45");
    await page.screenshot({ path: path.join(output, `native-task-${name}.png`) });
    await click("Review your changes"); await page.waitForFunction(() => document.body.textContent.includes("45 minutes"));
    await click("Confirm & save"); await page.waitForFunction(() => document.body.textContent.includes("Fixture save confirmed"));
    await click("Open progress editor");
    await page.locator('[aria-label="Select Newton’s laws"]').click();
    await fill("New questions for Newton’s laws", "45");
    await click("Completed");
    await page.locator('[aria-label="Confirm full topic revision"]').click();
    await click("Review topic updates");
    await page.waitForFunction(() => document.body.textContent.includes("20 → 65") && document.body.textContent.includes("2 → 3"));
    const progressOverflow = await page.evaluate(() => [...document.querySelectorAll("div")].some(el => el.clientWidth > 50 && el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).overflowX !== "hidden"));
    assert.equal(progressOverflow, false, `${name}: progress overflow`);
    await page.screenshot({ path: path.join(output, `native-progress-review-${name}.png`) });
    await click("Confirm progress update");
    await page.waitForFunction(() => document.body.textContent.includes("Fixture connection interrupted"));
    await click("Retry this exact update");
    await page.waitForFunction(() => document.body.textContent.includes("Fixture save confirmed"));
    report.push({ viewport: name, overflow, progressOverflow, dailyReview: true, taskReview: true, progressReviewAndRetry: true, fixtureSave: true, source: "React Native Web, fixture-only; not physical device QA" });
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(path.join(output, "forms-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); await browser.close(); server.close(); }
