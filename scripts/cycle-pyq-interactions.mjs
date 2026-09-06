import assert from "node:assert/strict";
import path from "node:path";

// Simulated records only. All mutations are intercepted before reaching the server.
export async function checkCyclePyqInteractions(page, base, output) {
  const results = [];
  const date = new Date().toISOString().slice(0, 10);
  const log = { id: "qa-cycle", startDate: date, endDate: null, flowLevel: "LIGHT", symptoms: null, mood: "NORMAL", notes: "QA fixture, not a personal record", lengthFromPrevious: null, periodDays: null, dayDetails: [] };
  const cycle = {
    generatedAt: new Date().toISOString(), currentPhase: "menstrual", dayOfCycle: 1, lastPeriodStart: date, lastPeriodEnd: null,
    predictedStart: null, predictedWindowStart: null, predictedWindowEnd: null, pmsWindowStart: null, pmsWindowEnd: null,
    ovulationWindowStart: null, ovulationWindowEnd: null, fertileWindowStart: null, fertileWindowEnd: null,
    expectedPeriodLength: 5, averageCycleLength: 28, cycleVariability: 5, cycleLengths: [], confidence: 20, confidenceLabel: "Very low", status: "needs_more_data", daysUntilPredictedStart: null, overdueDays: null,
    evidence: { cycleCount: 1, completedCycleCount: 0, moodEntriesMapped: 0, periodDayDetailCount: 0, ignoredOutliers: [], recentTrendDays: 0, accuracyMeanErrorDays: null, dataNeeded: ["More saved cycle starts"], method: "QA fixture", privacy: "Signed-in account" },
    predictionQuality: { averageMissDays: null, backtestedCycles: 0, ignoredOutliers: [], recentTrendDays: 0, modelBlend: "QA fixture" },
    healthSignals: { cycleRegularity: "learning", periodLengthPattern: "Learning", flowPattern: "Learning", symptomBurden: "learning", averagePain: null, heavyFlowDaysAverage: null, detailDaysLogged: 0, redFlags: [], insight: "No pattern yet — QA fixture." },
    studySignals: { avgEnergy: null, avgFocus: null, avgStress: null, lowEnergyCycleDays: [], highFocusCycleDays: [], mostCommonSymptoms: [], recommendationTone: "balanced", cycleDayInsight: "No mapped mood logs — QA fixture." },
    logs: [log], calendar: [{ date, dayOfCycle: 1, phase: "menstrual", kinds: ["logged-period", "today"], flowLevel: "LIGHT", cycleEntryId: log.id }],
  };
  const question = { id: "qa-pyq", subject: "Physics", classLevel: "11", chapter: "QA chapter", topic: "QA topic", difficulty: "EASY", examYear: 2020, sourceRef: "QA interface fixture — not an historical exam question", question: "QA fixture: select the second option to test answer feedback.", options: ["First", "Second", "Third", "Fourth"], correctIndex: 1, explanation: "This is transport-test content, not an educational bank entry.", optionExplanations: ["First is not the fixture answer.", "Second is the fixture answer."], visualAssetUrl: null };
  const library = { questions: [question], facets: [{ examYear: 2020, subject: "Physics", classLevel: "11", chapter: "QA chapter", count: 1 }], total: 1, pageSize: 20 };
  let mode = "failure", readFails = false, emptyQuestions = false;
  const cyclePosts = [];
  let latestQuery = "";
  const intercept = request => {
    const url = new URL(request.url());
    let status = 200, payload;
    if (url.pathname === "/api/cycle") {
      if (request.method() === "GET") { status = readFails ? 503 : 200; payload = readFails ? { error: "QA unavailable" } : cycle; }
      else {
        const body = request.method() === "DELETE" ? null : JSON.parse(request.postData());
        if (request.method() === "POST") cyclePosts.push(body);
        status = mode === "failure" ? 500 : mode === "queued" ? 202 : 200;
        payload = mode === "failure" ? { error: "QA save failed" } : mode === "queued" ? { offlineQueued: true } : mode === "malformed" ? { entry: { id: "wrong", startDate: "2000-01-01" } } : request.method() === "DELETE" ? { ok: true, deletedId: url.searchParams.get("id"), intelligence: cycle } : { entry: { id: body.id || "qa-new", startDate: body.startDate }, intelligence: cycle };
      }
    } else if (url.pathname === "/api/pyq/questions") {
      latestQuery = url.search;
      status = readFails ? 503 : 200;
      payload = readFails ? { error: "QA unavailable" } : emptyQuestions ? { ...library, questions: [], total: 0 } : library;
    } else if (url.pathname === "/api/pyq/progress") {
      if (request.method() === "GET") payload = [];
      else { status = mode === "queued" ? 202 : 500; payload = mode === "queued" ? { offlineQueued: true } : { error: "QA save failed" }; }
    } else if (["POST", "PATCH", "DELETE", "PUT"].includes(request.method())) { void request.abort(); return; }
    else { void request.continue(); return; }
    void request.respond({ status, contentType: "application/json", body: JSON.stringify(payload) });
  };
  const click = async selector => {
    const target = await page.locator(selector).waitHandle();
    await target.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await target.click();
    await target.dispose();
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  const capture = async name => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await noOverflow(); await page.screenshot({ path: path.join(output, name) }); };
  await page.setRequestInterception(true);
  page.on("request", intercept);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${base}/ai-insights/cycle-planner`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".calendar-grid");
    assert.equal(await page.$eval(".cycle-insights", node => node.open), false);
    assert.ok(await page.$eval(".calendar-card", node => node.getBoundingClientRect().top < 400));
    await capture("cycle-fixture-desktop.png");
    await click('button::-p-text(Log Period)');
    await page.locator('.notes-label textarea').fill("Keep my QA draft.");
    await click('button::-p-text(Save Private Log)');
    await page.waitForSelector('.cycle-error');
    assert.equal(await page.$eval('.notes-label textarea', node => node.value), "Keep my QA draft.");
    mode = "queued";
    await click('button::-p-text(Save Private Log)');
    await page.waitForFunction(() => document.querySelector('.cycle-error')?.textContent.includes("not confirmed saved"));
    mode = "malformed";
    await click('button::-p-text(Save Private Log)');
    await page.waitForFunction(() => document.querySelector('.cycle-error')?.textContent.includes("could not be confirmed"));
    assert.equal(await page.$eval('.notes-label textarea', node => node.value), "Keep my QA draft.");
    assert.equal(new Set(cyclePosts.map(body => body.operationId)).size, 1);
    assert.match(cyclePosts[0].operationId, /^[a-f0-9-]{36}$/);
    results.push({ interaction: "Cycle failed, queued and mismatched receipts preserve draft and stable retry identifier", passed: true, transport: "fixture" });
    mode = "success";
    await click('button::-p-text(Save Private Log)');
    await page.waitForFunction(() => !document.querySelector('.log-panel'));
    assert.match(await page.$eval('.cycle-notice', node => node.textContent), /saved/);
    await click('.history-edit-btn');
    const confirm = dialog => void dialog.accept();
    page.on("dialog", confirm);
    try {
      mode = "queued";
      await click('.danger-action');
      await page.waitForFunction(() => document.querySelector('.cycle-error')?.textContent.includes("Deletion is not confirmed"));
      assert.notEqual(await page.$('.log-panel'), null);
      mode = "success";
      await click('.danger-action');
      await page.waitForFunction(() => !document.querySelector('.log-panel'));
    } finally { page.off("dialog", confirm); }
    results.push({ interaction: "Cycle save and deletion require matching committed receipts", passed: true, transport: "fixture" });
    for (const [width, height] of [[820,1180],[390,844]]) {
      await page.setViewport({ width, height });
      await capture(`cycle-fixture-${width}.png`);
    }
    results.push({ interaction: "Calendar-first Cycle Planner fits desktop, tablet and phone without overflow", passed: true, transport: "fixture" });

    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${base}/pyq/questions`, { waitUntil: "networkidle2" });
    await page.waitForSelector('.pq-options');
    assert.equal(await page.$('.pq-feedback'), null);
    await page.$eval('.pq-options button:nth-child(2)', node => node.scrollIntoView({ block: "center" }));
    await click('.pq-options button:nth-child(2)');
    await page.waitForSelector('.pq-feedback.is-correct');
    assert.match(await page.$eval('.pq-feedback', node => node.textContent), /Well done/);
    assert.equal(await page.$$eval('.pq-options button:disabled', nodes => nodes.length), 4);
    results.push({ interaction: "PYQ hides answers until an attempt and reveals sourced feedback without saving study totals", passed: true, transport: "fixture" });
    readFails = true;
    await page.locator('input[aria-label="Search PYQ questions"]').fill("torque");
    await page.waitForSelector('.pq-state[role="alert"]');
    assert.equal(await page.$eval('input[type="search"]', node => node.value), "torque");
    assert.equal(await page.$('.pq-card'), null);
    readFails = false;
    await click('button::-p-text(Retry loading)');
    await page.waitForSelector('.pq-card');
    assert.match(latestQuery, /q=torque/);
    emptyQuestions = true;
    await page.locator('input[aria-label="Search PYQ questions"]').fill("missing chapter");
    await page.waitForFunction(() => document.querySelector('.pq-state h2')?.textContent.includes("No questions"));
    emptyQuestions = false;
    await click('.pq-state button');
    await page.waitForSelector('.pq-card');
    results.push({ interaction: "PYQ errors retain filters, hide stale results and recover; empty selections have a clear reset", passed: true, transport: "fixture" });
    for (const [width,height] of [[1440,1000],[820,1180],[390,844]]) {
      await page.setViewport({ width,height });
      await capture(`pyq-fixture-${width}.png`);
    }
    results.push({ interaction: "PYQ filters, equations and answer controls fit desktop, tablet and phone", passed: true, transport: "fixture" });
    await page.goto(`${base}/pyq`, { waitUntil: "networkidle2" });
    await page.waitForSelector('.neet-year');
    mode = "queued";
    await page.$eval('.neet-year .completion-check', node => node.scrollIntoView({ block: "center" }));
    await click('.neet-year .completion-check');
    await page.waitForFunction(() => document.querySelector('.delivery-note-error')?.textContent.includes("not confirmed saved"));
    assert.equal(await page.$eval('.neet-year input[type="checkbox"]', input => input.checked), false);
    await noOverflow();
    results.push({ interaction: "NEET archive opens directly and never marks queued progress completed", passed: true, transport: "fixture" });
  } finally {
    page.off("request", intercept);
    await page.setRequestInterception(false);
    await page.emulateMediaFeatures([]);
  }
  return results;
}
