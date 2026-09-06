import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const pdfVersion = require("pdfjs-dist/package.json").version;
const base = process.env.RELEASE_URL;
if (!base || !/^https:\/\/neet-tracker-misti(?:-[a-z0-9-]+)?\.vercel\.app$/.test(base)) throw new Error("Provide the exact existing project's Vercel release URL.");
const report = [];
const request = (route, init = {}) => fetch(`${base}${route}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(60000) });
const record = (route, response, extra = {}) => { const result = { route, status: response.status, ...extra }; report.push(result); console.log(JSON.stringify(result)); };
try {
  const publicPage = await request("/");
  record("/", publicPage);
  assert.equal(publicPage.status, 200);
  const privateVoice = await request("/api/voice/audio/assistant-ready-warm");
  record("/api/voice/audio/assistant-ready-warm", privateVoice, { unauthenticated: true });
  assert.equal(privateVoice.status, 401);
  const signin = await request("/signin");
  assert.equal(signin.status, 200);
  const login = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.MISTI_EMAIL, password: process.env.MISTI_PWD }) });
  record("/api/auth/login", login);
  assert.equal(login.status, 200, "Normal release sign-in must succeed; do not retry invalid credentials.");
  const cookie = login.headers.getSetCookie().map(entry => entry.split(";")[0]).join("; ");
  assert.ok(cookie.includes("neet_private_session="));
  const headers = { cookie };
  for (const route of ["/api/auth/session", "/api/dashboard/metrics", "/api/subjects", "/api/assistant/context", "/api/practice/availability", "/api/reader", "/api/tasks"]) {
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
  for (const route of ["/dashboard", "/daily-goals", "/todo", "/reviews", "/ai-insights/neet-guru", "/reader", "/subjects/physics", "/practice"]) {
    const response = await request(route, { headers });
    assert.equal(response.status, 200, `Release page failed: ${route}`);
    record(route, response);
  }
  const workerPath = `/vendor/pdfjs/${pdfVersion}/pdf.worker.min.mjs`;
  const worker = await request(workerPath);
  assert.equal(worker.status, 200);
  record(workerPath, worker);
} finally {
  const output = path.resolve("output", "release-checks");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${new URL(base).hostname}.json`), JSON.stringify({ base, checkedAt: new Date().toISOString(), report }, null, 2));
}
