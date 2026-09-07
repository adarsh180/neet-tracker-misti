import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const pdfVersion = require("pdfjs-dist/package.json").version;
const base = process.env.RELEASE_URL;
if (!base || !/^https:\/\/neet-tracker-misti(?:-[a-z0-9-]+)?\.vercel\.app$/.test(base)) throw new Error("Provide the exact existing project's Vercel release URL.");
const report = [];
let sessionCookie;
// Use the owner's normal CLI access for protected candidates. The CLI handles
// its protection token; neither it nor the private session is logged/saved here.
async function cliRequest(route, init) {
  const cli = process.env.VERCEL_CLI_PATH;
  if (!cli) throw new Error("Set VERCEL_CLI_PATH to the installed Vercel CLI entry point.");
  const args = [cli, "curl", route, "--deployment", base, "--", "--silent", "--show-error", "--include", "--compressed", "--max-time", "60", "--request", init.method || "GET"];
  for (const [key, value] of Object.entries(init.headers || {})) args.push("--header", `${key}: ${value}`);
  if (init.body) args.push("--data-binary", "@-");
  const raw = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.resume();
    child.on("error", () => reject(new Error("Could not start authenticated release verification.")));
    child.on("close", code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`Authenticated release request failed: ${route}`)));
    child.stdin.on("error", () => {});
    child.stdin.end(init.body || "");
  });
  let cursor = 0;
  let status = 0;
  let headers;
  do {
    const end = raw.indexOf("\r\n\r\n", cursor);
    if (end < 0) throw new Error("Release response headers were incomplete.");
    const lines = raw.subarray(cursor, end).toString("utf8").split("\r\n");
    status = Number(lines.shift()?.match(/^HTTP\/\S+\s+(\d+)/)?.[1]);
    headers = new Headers();
    for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
    cursor = end + 4;
  } while (raw.subarray(cursor, cursor + 5).toString() === "HTTP/");
  if (!status) throw new Error("Release response status was missing.");
  return new Response(raw.subarray(cursor), { status, headers });
}
const request = (route, init = {}) => process.env.RELEASE_VIA_VERCEL === "1" ? cliRequest(route, init) : fetch(`${base}${route}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(60000) });
const record = (route, response, extra = {}) => { const result = { route, status: response.status, ...extra }; report.push(result); console.log(JSON.stringify(result)); };
try {
  const publicPage = await request("/");
  record("/", publicPage);
  assert.equal(publicPage.status, 200);
  const privateVoice = await request("/api/voice/audio/assistant-ready-warm");
  record("/api/voice/audio/assistant-ready-warm", privateVoice, { unauthenticated: true });
  assert.equal(privateVoice.status, 401);
  const nativePrivate = await request("/api/native/workspace?date=2026-01-01");
  assert.equal(nativePrivate.status, 401);
  record("/api/native/workspace", nativePrivate, { unauthenticated: true });
  const signin = await request("/signin");
  assert.equal(signin.status, 200);
  const login = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.MISTI_EMAIL, password: process.env.MISTI_PWD }) });
  record("/api/auth/login", login);
  assert.equal(login.status, 200, "Normal release sign-in must succeed; do not retry invalid credentials.");
  const cookie = login.headers.getSetCookie().map(entry => entry.split(";")[0]).join("; ");
  sessionCookie = cookie;
  assert.ok(cookie.includes("neet_private_session="));
  const headers = { cookie };
  const nativeRead = await request("/api/native/workspace?date=2026-01-01", { headers });
  assert.equal(nativeRead.status, 200);
  const nativeDay = await nativeRead.json();
  assert.equal(nativeDay.date, "2026-01-01");
  assert.ok(Array.isArray(nativeDay.entries));
  assert.match(nativeRead.headers.get("cache-control"), /no-store/);
  record("/api/native/workspace", nativeRead, { privateDayRead: true });
  const nativeInvalid = await request("/api/native/workspace", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "task", operationId: "invalid" }) });
  assert.equal(nativeInvalid.status, 400);
  record("/api/native/workspace", nativeInvalid, { invalidWriteRejected: true });
  for (const route of ["/api/auth/session", "/api/dashboard/metrics", "/api/subjects", "/api/assistant/context", "/api/practice/availability", "/api/reader", "/api/tasks", "/api/cycle", "/api/pyq/questions", "/api/pyq/progress?exam=neet-ug"]) {
    const response = await request(route, { headers });
    assert.equal(response.status, 200, `Release read failed: ${route}`);
    const data = await response.json();
    assert.ok(data && typeof data === "object");
    record(route, response);
  }
  const voice = await request("/api/voice/audio/assistant-ready-warm", { headers });
  assert.equal(voice.status, 200);
  assert.match(voice.headers.get("content-type"), /audio\/mpeg/);
  assert.match(voice.headers.get("cache-control"), /private/);
  const bytes = (await voice.arrayBuffer()).byteLength;
  assert.ok(bytes > 1000);
  record("/api/voice/audio/assistant-ready-warm", voice, { authenticated: true, bytes });
  const range = await request("/api/voice/audio/assistant-ready-warm", { headers: { ...headers, range: "bytes=0-1023" } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 1024);
  record("/api/voice/audio/assistant-ready-warm", range, { rangePlayback: true });
  for (const route of ["/dashboard", "/daily-goals", "/todo", "/reviews", "/ai-insights/neet-guru", "/reader", "/subjects/physics", "/practice", "/ai-insights/cycle-planner", "/pyq", "/pyq/questions"]) {
    const response = await request(route, { headers });
    assert.equal(response.status, 200, `Release page failed: ${route}`);
    record(route, response);
  }
  const workerPath = `/vendor/pdfjs/${pdfVersion}/pdf.worker.min.mjs`;
  const worker = await request(workerPath);
  assert.equal(worker.status, 200);
  record(workerPath, worker);
} finally {
  if (sessionCookie) await request("/api/auth/logout", { method: "POST", headers: { cookie: sessionCookie } }).catch(() => {});
  const output = path.resolve("output", "release-checks");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${new URL(base).hostname}.json`), JSON.stringify({ base, checkedAt: new Date().toISOString(), report }, null, 2));
}
