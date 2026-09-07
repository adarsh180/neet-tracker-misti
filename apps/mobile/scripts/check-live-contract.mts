/** Read-only contract qualification using a new normal session; never logs credentials. */
import { createRequire } from "node:module";
import path from "node:path";
import {
  apiUrl,
  COOKIE_NAME,
  extractSessionCookie,
  parseMetrics,
  parseSubjects,
  parseTasks,
} from "../src/contracts";
import { parseDay, todayKey, editableTask } from "../src/forms-contract";
import { prepareProgress } from "../src/progress-contract";
const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "package.json"));
require("@next/env").loadEnvConfig(root);
let cookie: string | null = null;
try {
  const login = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.MISTI_EMAIL,
      password: process.env.MISTI_PWD,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!login.ok) throw new Error(`Normal sign-in failed (${login.status})`);
  cookie = extractSessionCookie(login.headers.get("set-cookie"));
  for (const [route, validate] of [
    ["/api/dashboard/metrics", parseMetrics],
    [
      "/api/subjects",
      (body: unknown) => {
        // Validate review inputs only; never submit a progress write in live QA.
        for (const subject of parseSubjects(body)) {
          for (const topic of subject.topics) {
            prepareProgress(
              subject.id,
              [topic],
              { [topic.id]: { selected: true, questions: "0" } },
              null,
              true,
              "",
              todayKey(),
              "00000000-0000-4000-8000-000000000001",
            );
          }
        }
      },
    ],
    ["/api/tasks", (body: unknown) => parseTasks(body).forEach(editableTask)],
    [
      `/api/native/workspace?date=${todayKey()}`,
      (body: unknown) => parseDay(body, todayKey()),
    ],
  ] as const) {
    const response = await fetch(apiUrl(route), {
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`${route}: ${response.status}`);
    validate(await response.json());
    console.log(
      JSON.stringify({
        route,
        contract: "passed",
        transport: "Node HTTP, not a physical device",
      }),
    );
  }
} finally {
  if (cookie)
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
}
