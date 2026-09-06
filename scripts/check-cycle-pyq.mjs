import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { checkCyclePyqInteractions } from "./cycle-pyq-interactions.mjs";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const base = "http://localhost:3000";
const output = path.resolve("output/workspace-release-qa");
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
page.on("pageerror", error => console.log("Browser error:", error.message));
try {
  await page.goto(`${base}/signin`, { waitUntil: "networkidle2" });
  await page.locator("#email").fill(process.env.MISTI_EMAIL);
  await page.locator("#password").fill(process.env.MISTI_PWD);
  const loginResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/login"));
  await page.locator('button[type="submit"]').click();
  if ((await loginResponse).status() !== 200) throw new Error("Normal preview sign-in failed.");
  await page.waitForFunction(() => location.pathname === "/dashboard");
  const report = await checkCyclePyqInteractions(page, base, output);
  await writeFile(path.join(output, "cycle-pyq-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: path.join(output, "cycle-pyq-failure.png") });
  console.log(JSON.stringify({ url: page.url(), alerts: await page.$$eval('[role="alert"]', nodes => nodes.map(node => node.textContent)), checkboxes: await page.$$eval('.neet-year input', nodes => nodes.slice(0,1).map(node => ({ checked: node.checked, disabled: node.disabled }))) }));
  throw error;
} finally { await browser.close(); }
