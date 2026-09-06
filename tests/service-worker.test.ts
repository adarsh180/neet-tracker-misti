import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

function workerHarness(hasActiveWorker: boolean) {
  const handlers = new Map<string, (event: { waitUntil?: (promise: Promise<unknown>) => void; data?: { type: string } }) => void>();
  let activations = 0;
  const deleted: string[] = [];
  const self = {
    location: { hostname: "localhost" },
    registration: { active: hasActiveWorker ? {} : null },
    addEventListener: (name: string, handler: typeof handlers extends Map<string, infer H> ? H : never) => handlers.set(name, handler),
    skipWaiting: async () => { activations++; },
    clients: { claim: async () => undefined },
  };
  const caches = {
    open: async () => ({ add: async () => undefined }),
    keys: async () => ["neet-tracker-pwa-v8", "neet-tracker-pwa-v9", "unrelated-cache"],
    delete: async (key: string) => { deleted.push(key); return true; },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches, Request: class {}, console });
  async function dispatch(name: string) {
    let work: Promise<unknown> | undefined;
    handlers.get(name)?.({ waitUntil: promise => { work = promise; } });
    await work;
  }
  return { handlers, dispatch, deleted, activations: () => activations };
}

test("PWA updates wait for explicit activation instead of interrupting study", async () => {
  const worker = workerHarness(true);
  await worker.dispatch("install");
  assert.equal(worker.activations(), 0);
  worker.handlers.get("message")?.({ data: { type: "SKIP_WAITING" } });
  assert.equal(worker.activations(), 1);
});

test("first installation activates and cleanup preserves unrelated caches", async () => {
  const worker = workerHarness(false);
  await worker.dispatch("install");
  assert.equal(worker.activations(), 1);
  await worker.dispatch("activate");
  assert.deepEqual(worker.deleted, ["neet-tracker-pwa-v8"]);
});
