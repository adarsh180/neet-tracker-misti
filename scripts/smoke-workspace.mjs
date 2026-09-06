import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { checkWorkspaceInteractions } from "./workspace-interactions.mjs";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const base = process.env.QA_BASE_URL || "http://localhost:3000";
if (new URL(base).hostname !== "localhost") throw new Error("This smoke check is local-only.");
const output = path.resolve("output", "workspace-release-qa");
await mkdir(output, { recursive: true });
const executablePath = process.env.QA_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--disable-background-networking", "--no-first-run"] });
const report = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const errors = [];
  const apiErrors = [];
  const pending = new Set();
  page.on("request", request => pending.add(request));
  page.on("requestfinished", request => pending.delete(request));
  page.on("requestfailed", request => pending.delete(request));
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 400) apiErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  const settle = async () => {
    const route = new URL(page.url()).pathname;
    const selector = route === "/dashboard" ? '[aria-label="Saved study totals"]'
      : route.startsWith("/subjects/") ? "h1"
      : route === "/reader" ? 'a[href^="/reader/"]'
      : "#studio-content h1";
    await page.waitForSelector(selector, { timeout: 30000 });
    if (route === "/planner") await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent.includes("Finding your next steps"), { timeout: 45000 });
    if (route === "/ai-insights/cycle-planner") await page.waitForFunction(() => !document.querySelector('.cycle-loading'), { timeout: 45000 });
    // Polling notifications and navigation-aborted auth requests are not page readiness.
    await page.waitForFunction(() => ![...document.querySelectorAll('#studio-content [class*="skeleton"], #studio-content .loading-pulse')].some(node => node.getBoundingClientRect().height > 0), { timeout: 60000 });
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  };
  await page.goto(`${base}/signin`, { waitUntil: "networkidle2", timeout: 60000 });
  const email = process.env.MISTI_EMAIL;
  const password = process.env.MISTI_PWD;
  if (!email || !password) throw new Error("Local preview login credentials are not configured.");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const loginResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/login"));
  await page.locator('button[type="submit"]').click();
  const login = await loginResponse;
  console.log(JSON.stringify({ phase: "login", status: login.status() }));
  if (!login.ok()) throw new Error(`Preview sign-in failed (${login.status()}).`);
  console.log(JSON.stringify({ phase: "cookie-check", cookiePresent: (await browser.cookies()).some(cookie => cookie.name === "neet_private_session") }));
  await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 20000 }).catch(async error => {
    console.log(JSON.stringify({ phase: "login-ui", url: page.url(), alerts: await page.$$eval('[role="alert"]', nodes => nodes.map(node => node.textContent)), errors }));
    throw error;
  });
  const routes = process.env.QA_ROUTES?.split(",") || ["/dashboard", "/subjects/physics", "/subjects/chemistry", "/subjects/botany", "/subjects/zoology", "/daily-goals", "/practice", "/reader", "/todo", "/planner", "/tests", "/tests/error-log", "/reviews", "/ai-insights", "/ai-insights/rank-predictor", "/ai-insights/cycle-planner", "/ai-insights/neet-guru", "/mood", "/pyq", "/pyq/questions"];
  for (const route of routes) {
    errors.length = 0;
    apiErrors.length = 0;
    const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("#studio-content", { timeout: 30000 }).catch(async error => {
      const failure = { route, status: response.status(), errors: [...errors], apiErrors: [...apiErrors], alerts: await page.$$eval('[role="alert"]', nodes => nodes.map(node => node.textContent)) };
      report.push(failure);
      console.log(JSON.stringify(failure));
      await page.screenshot({ path: path.join(output, "route-load-failure.png") });
      throw error;
    });
    await settle();
    const state = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.textContent?.trim() ?? null,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent.trim()).filter(Boolean),
    }));
    report.push({ route, viewport: "desktop", status: response.status(), ...state, errors: [...errors], apiErrors: [...apiErrors] });
    await page.screenshot({ path: path.join(output, `${route.slice(1).replaceAll("/", "-")}-desktop.png`) });
    console.log(JSON.stringify(report.at(-1)));
  }
  for (const [label, width, height] of [["tablet", 820, 1180], ["phone", 390, 844]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (const route of process.env.QA_MOBILE_ROUTES?.split(",") || ["/dashboard", "/subjects/physics", "/daily-goals", "/practice", "/reader", "/tests", "/mood", "/todo", "/planner", "/ai-insights"]) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle2", timeout: 60000 });
      await settle();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      if (route === "/todo" && width === 390) {
        const columns = await page.$eval(".board-grid", grid => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
        if (columns !== 1) throw new Error("Phone Todo must use one readable task column.");
      }
      report.push({ route, viewport: label, overflow });
      await page.screenshot({ path: path.join(output, `${route.slice(1).replaceAll("/", "-")}-${label}.png`) });
      console.log(JSON.stringify(report.at(-1)));
    }
  }
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${base}/reader`, { waitUntil: "networkidle2", timeout: 60000 });
  await settle();
  const chapterHref = await page.$eval('a[href^="/reader/"]', link => link.getAttribute("href"));
  await page.goto(`${base}${chapterHref}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector(".textLayer")?.textContent?.length > 50, { timeout: 60000 });
  await page.screenshot({ path: path.join(output, "reader-page-desktop.png") });
  report.push({ route: chapterHref, pdfRendered: true });
  console.log(JSON.stringify(report.at(-1)));
  const fitWidth = await page.$eval('canvas[aria-label]', canvas => canvas.getBoundingClientRect().width);
  await page.locator('button[aria-label="Zoom in"]').click();
  await page.waitForFunction(width => document.querySelector('canvas[aria-label]')?.getBoundingClientRect().width > width * 1.1, { timeout: 30000 }, fitWidth);
  await page.locator('button[aria-label="Fit PDF to page width"]').click();
  await page.waitForFunction(width => Math.abs(document.querySelector('canvas[aria-label]')?.getBoundingClientRect().width - width) < 2, { timeout: 30000 }, fitWidth);
  report.push({ interaction: "NCERT PDF zoom and fit-width preserve layout", passed: true });
  report.push(...await checkWorkspaceInteractions(page, base, output));
  const { checkReviewInteractions } = await import("./review-interactions.mjs");
  report.push(...await checkReviewInteractions(page, base, output));
  const { checkGuruInteractions } = await import("./guru-interactions.mjs");
  report.push(...await checkGuruInteractions(page, base, output));
  const { checkCyclePyqInteractions } = await import("./cycle-pyq-interactions.mjs");
  report.push(...await checkCyclePyqInteractions(page, base, output));
  console.log(JSON.stringify({ interactions: report.filter(item => item.interaction) }));
} finally {
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
