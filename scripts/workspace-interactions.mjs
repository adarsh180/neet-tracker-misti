import assert from "node:assert/strict";
import path from "node:path";

// Transport fixtures exist only in this local QA harness. No study records are written.
export async function checkWorkspaceInteractions(page, base, output) {
  const results = [];
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${base}/dashboard`, { waitUntil: "networkidle2" });
  await page.waitForSelector('[aria-label="Search all pages, subjects and chapters"]');
  await page.locator('[aria-label="Search all pages, subjects and chapters"]').click();
  await page.locator('input[aria-label="Search your workspace"]').fill("rank predictor");
  await page.waitForFunction(() => document.querySelector('[role="option"]')?.textContent?.toLowerCase().includes("rank"));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname === "/ai-insights/rank-predictor");
  assert.equal(await page.$eval('dialog[aria-label="Search your workspace"]', dialog => dialog.open), false);
  results.push({ interaction: "Global search opens Rank Predictor with keyboard", passed: true });
  await page.screenshot({ path: path.join(output, "rank-predictor-desktop.png") });

  let responseMode = "failure";
  let failDailyRead = false;
  const rankFixture = {
    currentScore: 400, predictedScoreMin: 390, predictedScoreMax: 440,
    predictedRankMin: 80000, predictedRankMax: 120000, confidence: 35,
    subjectBreakdown: ["Physics", "Chemistry", "Botany", "Zoology"].map(subject => ({ subject, currentLevel: 40, targetLevel: 75, priority: "HIGH" })),
    bluffFlags: [], weeklyPlan: "QA fixture: review the saved test journal.", overallAnalysis: "QA fixture: this is a simulated response, not Misti’s prediction.",
    strictMessage: "", sourceNotes: ["QA fixture only."], model: "deterministic-fallback", historySaved: false,
  };
  await page.setRequestInterception(true);
  const intercept = request => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && failDailyRead && ["/api/subjects", "/api/daily-goals", "/api/screen-time"].includes(pathname)) {
      void request.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "QA simulated read outage" }) });
      return;
    }
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) { void request.continue(); return; }
    if (pathname === "/api/ai/rank") {
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(rankFixture) });
    } else if (pathname === "/api/daily-goals" && responseMode === "dailyQueued") {
      void request.respond({ status: 202, contentType: "application/json", body: JSON.stringify({ offlineQueued: true }) });
    } else if (pathname.startsWith("/api/tasks")) {
      void request.respond({ status: responseMode === "queued" ? 202 : 500, contentType: "application/json", body: JSON.stringify(responseMode === "queued" ? { offlineQueued: true } : { error: "QA simulated failed save" }) });
    } else {
      // Never allow an unexpected test interaction to mutate the shared database.
      void request.abort();
    }
  };
  page.on("request", intercept);
  try {
    await page.locator('button::-p-text(Explore my estimate)').click();
    await page.waitForSelector('[aria-label="Estimated outcome"]');
    assert.match(await page.$eval('[role="status"]', node => node.textContent), /could not be saved/);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({ path: path.join(output, "rank-results-QA-FIXTURE-desktop.png") });
    results.push({ interaction: "Rank results render and disclose unsaved history", transport: "fixture", passed: true });

    await page.goto(`${base}/todo`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".task-card");
    const before = await page.$$eval(".task-card strong", nodes => nodes.map(node => node.textContent));
    await page.locator(".task-card").click();
    page.once("dialog", dialog => void dialog.accept());
    await page.locator(".delete-btn").click();
    await page.waitForSelector('[role="alert"]');
    assert.deepEqual(await page.$$eval(".task-card strong", nodes => nodes.map(node => node.textContent)), before);
    results.push({ interaction: "Failed task deletion preserves every task", transport: "fixture", passed: true });

    await page.locator('button[aria-controls="new-task-panel"]').click();
    await page.locator('#new-task-panel input[placeholder="Finish optics numericals and revise formula traps"]').fill("QA unsaved task — never sent to database");
    await page.locator('button::-p-text(Save Task)').click();
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Could not create"));
    assert.equal(await page.$eval('#new-task-panel input', input => input.value), "QA unsaved task — never sent to database");
    results.push({ interaction: "Failed task creation retains the draft", transport: "fixture", passed: true });

    responseMode = "queued";
    await page.locator('button::-p-text(Save Task)').click();
    await page.waitForFunction(() => document.querySelector('.ai-summary')?.textContent?.includes("queued"));
    assert.deepEqual(await page.$$eval(".task-card strong", nodes => nodes.map(node => node.textContent)), before);
    results.push({ interaction: "Queued task is not displayed as a saved server record", transport: "fixture", passed: true });

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.locator(".task-card").click();
    await page.waitForFunction(() => document.activeElement?.id === "task-detail");
    await page.locator(".back-to-board").click();
    await page.waitForFunction(() => document.activeElement?.id === "task-board");
    results.push({ interaction: "Phone task selection and return move keyboard focus correctly", passed: true });

    await page.goto(`${base}/daily-goals`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".form-panel .save-btn", { timeout: 45000 });
    failDailyRead = true;
    await page.locator('button[aria-label="Previous day"]').click();
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("complete record"));
    assert.equal(await page.$(".form-panel .save-btn"), null);
    results.push({ interaction: "A failed date change cannot save the previous day's form", transport: "fixture", passed: true });
    failDailyRead = false;
    await page.locator('button::-p-text(Retry loading)').click();
    await page.waitForSelector(".form-panel .save-btn", { timeout: 45000 });
    results.push({ interaction: "Retry restores editing only after the selected date loads", passed: true });
    await page.locator('input[aria-label="Physics questions solved"]').fill("1.5");
    await page.locator(".form-panel .save-btn").click();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.includes("Check your numbers")));
    assert.equal(await page.$eval('input[aria-label="Physics questions solved"]', input => input.value), "1.5");
    results.push({ interaction: "Fractional question counts are rejected without truncation or losing the draft", passed: true });
    responseMode = "dailyQueued";
    await page.locator('input[aria-label="Physics questions solved"]').fill("5");
    await page.locator(".form-panel .save-btn").click();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.includes("Queued on this device. Your log")));
    assert.equal(await page.$eval('input[aria-label="Physics questions solved"]', input => input.value), "5");
    assert.doesNotMatch(await page.$eval(".form-panel .save-btn", button => button.textContent), /Recorded/);
    results.push({ interaction: "A queued daily log is not reported as recorded", transport: "fixture", passed: true });
  } finally {
    page.off("request", intercept);
    await page.setRequestInterception(false);
  }
  return results;
}
