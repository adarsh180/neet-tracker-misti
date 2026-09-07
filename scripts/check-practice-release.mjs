import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const base = "http://localhost:3000";
const output = "output/workspace-release-qa";
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless:true});
const page = await browser.newPage();
const report = [];
const check = (name, condition) => { if (!condition) throw new Error(name); report.push({name, passed:true}); };
const click = async selector => {
  const handle = await page.locator(selector).waitHandle();
  await handle.evaluate(node => node.scrollIntoView({block:"center",behavior:"instant"}));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await handle.click(); await handle.dispose();
};
try {
  await page.goto(`${base}/signin`, {waitUntil:"networkidle2"});
  await page.locator("#email").fill(process.env.MISTI_EMAIL);
  await page.locator("#password").fill(process.env.MISTI_PWD);
  const login = page.waitForResponse(response => response.url().endsWith("/api/auth/login"));
  await click('button[type="submit"]');
  if (!(await login).ok()) throw new Error("Preview login failed");
  await page.waitForFunction(() => location.pathname === "/dashboard");
  // Hardware and time are simulated; these checks do not qualify a real camera/device.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "standalone", {value:true});
    navigator.mediaDevices.getUserMedia = async () => document.createElement("canvas").captureStream();
    const interval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => interval(callback, delay === 1000 ? 15 : delay, ...args);
  });
  let attempt = {id:"qa-practice", title:"Interface fixture — not an academic paper", mode:"UNIT", status:"READY", questionCount:1, generatedCount:1, durationMinutes:10, remainingSeconds:600, currentQuestionIndex:0, totalActiveSeconds:0, totalPausedSeconds:0, pauseLogs:[], securityEvents:[], answers:[], questionStatuses:{}, createdAt:new Date().toISOString(), result:null, reviews:[], questions:[{id:"qa-question",subject:"Physics",chapter:"QA fixture",topic:null,source:"PLATFORM",sourceRef:"UI test only",difficulty:"EASY",question:"Interface test: choose option A.",options:["Option A","Option B","Option C","Option D"],verified:false,correctIndex:null,explanation:null}]};
  let failPause = true, failResume = true;
  const posts = [];
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.isInterceptResolutionHandled()) return;
    const path = new URL(request.url()).pathname;
    const json = (body, status=200) => request.respond({status,contentType:"application/json",body:JSON.stringify(body)});
    if (path === "/api/practice") return json({tests:[attempt]});
    if (path === "/api/practice/folders") return json({folders:[]});
    if (path === "/api/practice/qa-practice/proctor-report") return json({error:"Simulated auxiliary failure"},503);
    if (path === "/api/practice/qa-practice") {
      if (request.method() === "GET") return json({test:attempt});
      const body = JSON.parse(request.postData() || "{}"); posts.push(body);
      if (body.action === "pause" && failPause) return json({test:{...attempt,status:"PAUSED"}},202);
      if (body.action === "resume" && failResume) return json({error:"Simulated unavailable"},503);
      attempt = {...attempt,...body,status:request.method() === "POST" ? "COMPLETED" : body.action === "pause" ? "PAUSED" : ["start","resume"].includes(body.action) ? "RUNNING" : attempt.status};
      if (attempt.status === "COMPLETED") {
        attempt.questions[0].correctIndex=0;
        attempt.result={score:4,maxScore:4,percentage:100,correct:1,wrong:0,skipped:0,timeTakenSeconds:1,subjectScores:[{subject:"Physics",score:4,maxScore:4,correct:1,wrong:0,skipped:0}]};
      }
      return json({test:attempt});
    }
    if (path.startsWith("/api/") && request.method() !== "GET") return json({error:"QA blocked unrelated mutation"},503);
    return request.continue();
  });
  await page.setViewport({width:1440,height:1000});
  await page.goto(`${base}/practice`, {waitUntil:"networkidle2"});
  await page.waitForSelector(".arena-continue");
  check("unfinished attempts shown before collapsed collections", await page.$eval(".test-folders", node => !node.open));
  await page.screenshot({path:`${output}/practice-new-desktop.png`,fullPage:true});
  await click(".arena-continue > button");
  await click(".camera-button");
  await click(".consent-check");
  await click(".begin-calm");
  await page.waitForSelector(".arena-shell",{timeout:20000});
  await page.waitForFunction(() => !document.querySelector(".arena-main")?.inert);
  await click(".option-btn");
  await click(".top-ghost");
  await page.waitForFunction(() => document.querySelector(".pause-card")?.textContent.includes("Retry saving pause"));
  check("queued pause blocks leaving", await page.$eval(".pause-actions .cbt-ghost", node => node.disabled));
  failPause=false;
  await click(".pause-actions .cbt-primary");
  await page.waitForFunction(() => document.querySelector(".pause-actions .cbt-primary")?.textContent.includes("Resume"));
  await click(".pause-actions .cbt-primary");
  await page.waitForFunction(() => document.querySelector(".pause-card")?.textContent.includes("Could not resume"));
  check("failed resume preserves paused state", Boolean(await page.$(".pause-overlay")));
  failResume=false;
  await click(".pause-actions .cbt-primary");
  await page.waitForFunction(() => !document.querySelector(".pause-overlay"));
  check("answer survives pause/resume retries", attempt.answers[0]?.optionIndex===0);
  await click(".top-submit");
  await click(".submit-actions .danger-btn");
  await page.waitForFunction(() => document.body.classList.contains("cbt-result-active"), {timeout:20000});
  check("confirmed result opens despite failed proctor report", attempt.status==="COMPLETED");
  check("submission retains selected answer", posts.findLast(body => body.submitType)?.answers[0]?.optionIndex===0);
  await page.goto(`${base}/practice?mode=sectional`,{waitUntil:"networkidle2"});
  await page.waitForSelector(".setup-shell",{timeout:30000});
  check("sectional deep link opens test builder", await page.$eval(".cbt-page", node => node.textContent.includes("Class 11") && node.textContent.includes("Class 12")));
  for (const [name,width,height] of [["tablet",820,1180],["phone",390,844]]) {
    await page.setViewport({width,height});
    await page.goto(`${base}/practice`,{waitUntil:"networkidle2"});
    await page.waitForSelector(".cbt-test-row",{timeout:30000});
    check(`${name} practice has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${output}/practice-new-${name}.png`,fullPage:true});
  }
} catch (error) {
  await page.screenshot({path:`${output}/practice-failure.png`,fullPage:true});
  console.log(await page.$eval(".cbt-page", node => node.textContent.slice(-1800)).catch(()=>"No practice page"));
  throw error;
} finally {
  await writeFile(`${output}/practice-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  await browser.close();
}
