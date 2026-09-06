import assert from "node:assert/strict";
import path from "node:path";

export async function checkGuruInteractions(page, base, output) {
  const results = [];
  const chats = ["a", "b"].map(id => ({ id: `qa-${id}`, title: `QA fixture chat ${id}`, mode: "neet-guru", updatedAt: "2026-09-06T10:00:00Z" }));
  let mode = "failure";
  let failChat = false;
  let posts = 0;
  let held = null;
  const respond = (request, status, payload) => request.respond({ status, contentType: "application/json", body: JSON.stringify(payload) });
  const intercept = request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/ai/conversations") { void respond(request, 200, chats); }
    else if (pathname.startsWith("/api/ai/conversations/qa-")) {
      const id = pathname.split("/").at(-1);
      if (request.method() === "DELETE") void respond(request, 500, { error: "QA failed deletion" });
      else void respond(request, failChat ? 503 : 200, failChat ? { error: "QA failed chat load" } : { id, messages: [{ id: `${id}-message`, role: "assistant", content: `QA fixture history ${id}. This is not a real student conversation.`, createdAt: "2026-09-06T10:00:00Z" }] });
    } else if (pathname === "/api/ai/chat" && request.method() === "POST") {
      posts += 1;
      if (mode === "hold") { held = request; return; }
      if (mode === "success") void request.respond({ status: 200, contentType: "text/event-stream", body: 'data: {"text":"QA fixture reply. Verify the worked example in your book.","conversationId":"qa-a"}\n\ndata: {"done":true,"conversationId":"qa-a","model":"QA fixture"}\n\n' });
      else void respond(request, mode === "queued" ? 202 : 503, mode === "queued" ? { offlineQueued: true } : { error: "QA failed generation" });
    } else if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) void request.abort();
    else void request.continue();
  };
  await page.setRequestInterception(true);
  page.on("request", intercept);
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${base}/ai-insights/neet-guru`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".ng-suggestion-card");
    await page.locator(".ng-suggestion-card").click();
    const draft = await page.$eval(".ng-textarea", input => input.value);
    assert.ok(draft.length > 10);
    assert.equal(posts, 0);
    await page.locator('button[aria-label="Send message"]').click();
    await page.waitForSelector('.ng-error-banner[role="alert"]');
    assert.equal(await page.$eval(".ng-textarea", input => input.value), draft);
    mode = "queued";
    await page.locator('button[aria-label="Send message"]').click();
    await page.waitForFunction(() => document.querySelector('.ng-error-banner')?.textContent.includes("queued"));
    assert.equal(await page.$eval(".ng-textarea", input => input.value), draft);
    assert.equal(await page.$(".ng-message-row.assistant"), null);
    results.push({ interaction: "Guru quick prompts do not auto-send; failed and queued replies preserve the draft without inventing an answer", transport: "fixture", passed: true });

    page.once("dialog", dialog => void dialog.accept());
    await page.locator('.ng-topbar button[aria-label="New chat"]').click();
    mode = "success";
    await page.locator(".ng-textarea").fill("QA fixture request");
    await page.locator('button[aria-label="Send message"]').click();
    await page.waitForSelector(".ng-message-row.assistant");
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Stop generating"]'));
    assert.equal(await page.$$eval(".ng-message-row.assistant", nodes => nodes.length), 1);
    assert.equal(await page.$(".ng-delivery"), null);
    results.push({ interaction: "Guru renders one completed reply only after the stream receipt", transport: "fixture", passed: true });
    const before = await page.$eval(".ng-message-list", node => node.textContent);
    page.once("dialog", dialog => void dialog.accept());
    await page.locator('button[aria-label="Delete chat: QA fixture chat a"]').click();
    await page.waitForSelector('.ng-error-banner[role="alert"]');
    assert.equal(await page.$eval(".ng-message-list", node => node.textContent), before);
    assert.equal(await page.$$eval(".ng-history-item", nodes => nodes.length), 2);
    failChat = true;
    await page.locator('.ng-history-open::-p-text(QA fixture chat b)').click();
    await page.waitForFunction(() => document.querySelector('.ng-error-banner')?.textContent.includes("could not be opened"));
    assert.equal(await page.$eval(".ng-message-list", node => node.textContent), before);
    results.push({ interaction: "Failed Guru deletion and chat loading keep the existing conversation visible", transport: "fixture", passed: true });
    failChat = false;

    mode = "hold";
    await page.locator(".ng-textarea").fill("QA delayed reply");
    await page.locator('button[aria-label="Send message"]').click();
    await page.waitForSelector('button[aria-label="Stop generating"]');
    page.once("dialog", dialog => void dialog.accept());
    await page.locator('.ng-topbar button[aria-label="New chat"]').click();
    if (held) await held.respond({ status: 200, contentType: "text/event-stream", body: 'data: {"text":"STALE_REPLY_MUST_NOT_APPEAR","conversationId":"qa-a"}\n\ndata: {"done":true,"conversationId":"qa-a"}\n\n' }).catch(() => {});
    // The deliberately aborted/held request need not become network-idle.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.$(".ng-message-list"), null);
    assert.doesNotMatch(await page.$eval(".ng-main", node => node.textContent), /STALE_REPLY/);
    results.push({ interaction: "Starting a new Guru chat cancels display of an old response", transport: "fixture", passed: true });

    for (const [label, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1180], ["phone", 390, 844]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); window.scrollTo(0, 0); });
      await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      const composer = await page.$eval(".ng-input-container", node => ({ bottom: node.getBoundingClientRect().bottom, height: innerHeight }));
      assert.ok(composer.bottom < composer.height - 60);
      await page.screenshot({ path: path.join(output, `guru-QA-FIXTURE-${label}.png`) });
    }
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({ path: path.join(output, "guru-QA-FIXTURE-phone-light.png") });
    results.push({ interaction: "Guru responsive composer remains above navigation on desktop, tablet and phone", transport: "fixture", passed: true });
  } finally {
    if (held && !held.isInterceptResolutionHandled()) await held.abort().catch(() => {});
    page.off("request", intercept);
    await page.setRequestInterception(false);
    await page.emulateMediaFeatures([]);
  }
  return results;
}
