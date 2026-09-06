import assert from "node:assert/strict";
import path from "node:path";

// Isolated browser transport fixtures, never persisted or shipped as product data.
export async function checkReviewInteractions(page, base, output) {
  const results = [];
  const verdict = { integrityScore: 80, verdict: "MOSTLY_HONEST", perQuestion: [], message: "QA fixture: compare the saved entries.", consequence: "" };
  const makeCard = (id, start, hours, options = {}) => ({
    id, period: "WEEKLY", periodStart: start, periodEnd: start,
    status: "COMPLETED", verdict,
    questions: [{ id: "reflection", question: "QA fixture: did you revise the chapter?", options: ["Yes, end to end", "Only selected topics"] }],
    review: {
      title: "QA fixture · a week of steady work", summary: "Simulated review data for layout and save checks, not Misti’s actual study record.", grade: "B",
      wins: ["Consistent revision sessions."], gaps: ["Bring one unfinished topic into the next plan."],
      subjectBreakdown: [{ subject: "Physics", hours, questions: 120, verdictLine: "Practice and revision recorded." }],
      trend: { hoursDelta: 2, questionsDelta: 10, line: "Compare this period with your earlier saved work." },
      focusForNextPeriod: ["Revisit the questions you marked for review."], integritySignals: [],
      metrics: { hours, questions: 120, activeDays: 4, periodDays: 7, topicsCompleted: 2, revisions: 3, testsTaken: 1, avgTestPercentage: 60, distractionHours: 2 },
    }, ...options,
  });
  const current = makeCard("qa-current", "2026-08-24", 24, { status: "AWAITING_ANSWERS", verdict: null });
  const old = makeCard("qa-legacy", "2026-08-10", 12);
  delete old.review.metrics;
  // Deliberately unordered to exercise chronological selection and charts.
  const cards = [old, current, makeCard("qa-previous", "2026-08-17", 18)];
  let mode = "failure";
  let failRead = false;
  let posts = 0;
  const intercept = request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/reviews" && request.method() === "GET") {
      void request.respond({ status: failRead ? 503 : 200, contentType: "application/json", body: JSON.stringify(failRead ? { error: "QA simulated refresh failure" } : { cards }) });
    } else if (pathname === "/api/reviews/qa-current" && request.method() === "POST") {
      posts += 1;
      const body = JSON.parse(request.postData());
      assert.deepEqual(body.answers, [{ id: "reflection", optionIndex: 0 }]);
      const payload = mode === "queued" ? { offlineQueued: true }
        : mode === "malformed" ? { card: { id: "different-card", status: "COMPLETED" } }
        : mode === "success" ? { card: { ...current, status: "COMPLETED", verdict } }
        : { error: "QA simulated review save failure" };
      void request.respond({ status: mode === "failure" ? 500 : mode === "queued" ? 202 : 200, contentType: "application/json", body: JSON.stringify(payload) });
    } else if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) { void request.abort(); }
    else { void request.continue(); }
  };
  await page.setRequestInterception(true);
  page.on("request", intercept);
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${base}/reviews`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#review-qa-current");
    assert.match(await page.$eval(".rc-top", node => node.textContent), /24 Aug/);
    await page.locator('.pc-metrics button::-p-text(Study index)').click();
    await page.locator(".pc-values summary").click();
    const rows = await page.$$eval(".pc-values tbody tr", nodes => nodes.map(node => [...node.querySelectorAll("th,td")].map(cell => cell.textContent)));
    assert.deepEqual(rows.map(row => row[1]), ["12", "18", "24"]);
    assert.equal(rows[0][3], "—");
    assert.equal(await page.$$eval(".recharts-yAxis", nodes => nodes.length), 1);
    results.push({ interaction: "Review chart sorts periods, uses one axis and leaves unmeasured legacy index blank", transport: "fixture", passed: true });
    await page.locator('.pc-metrics button::-p-text(Questions)').click();
    await page.waitForSelector(".recharts-bar");
    await page.locator('.pc-tabs button::-p-text(Monthly)').click();
    await page.waitForSelector(".pc-empty");
    await page.locator('.pc-tabs button::-p-text(Weekly)').click();

    await page.locator('#review-qa-current input[type="radio"]').click();
    const chosen = () => page.$eval('#review-qa-current input[type="radio"]', input => input.checked);
    failRead = true;
    await page.locator('button[aria-label="Refresh reviews"]').click();
    await page.waitForSelector('.rv-state[role="alert"]');
    assert.equal(await chosen(), true);
    results.push({ interaction: "Failed review refresh preserves visible cards and selected answers", transport: "fixture", passed: true });
    failRead = false;
    await page.locator('button[aria-label="Refresh reviews"]').click();
    await page.waitForFunction(() => !document.querySelector('.rv-state[role="alert"]'));
    await page.locator(".rc-submit").click();
    await page.waitForSelector('.rc-err[role="alert"]');
    assert.equal(await chosen(), true);
    mode = "queued";
    await page.locator(".rc-submit").click();
    await page.waitForFunction(() => document.querySelector('.rc-truth [role="status"]')?.textContent.includes("not yet reviewed"));
    assert.equal(await chosen(), true);
    assert.notEqual(await page.$(".rc-submit"), null);
    mode = "malformed";
    await page.locator(".rc-submit").click();
    await page.waitForFunction(() => document.querySelector('.rc-err')?.textContent.includes("could not be confirmed"));
    assert.equal(await chosen(), true);
    results.push({ interaction: "Failed, queued and mismatched review receipts never clear selections or report completion", transport: "fixture", passed: true });

    mode = "success";
    await page.locator(".rc-submit").click();
    await page.waitForSelector("#review-qa-current .rc-verdict");
    assert.equal(await page.$("#review-qa-current .rc-submit"), null);
    assert.equal(posts, 4);
    results.push({ interaction: "Only a matching completed review receipt updates the card", transport: "fixture", passed: true });

    for (const [label, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1180], ["phone", 390, 844]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await page.screenshot({ path: path.join(output, `reviews-QA-FIXTURE-${label}.png`), fullPage: true });
    }
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.screenshot({ path: path.join(output, "reviews-QA-FIXTURE-phone-light.png"), fullPage: true });
    results.push({ interaction: "Review desktop, tablet, phone and reduced-motion light presentation render without overflow", transport: "fixture", passed: true });
  } finally {
    await page.emulateMediaFeatures([]);
    page.off("request", intercept);
    await page.setRequestInterception(false);
  }
  return results;
}
