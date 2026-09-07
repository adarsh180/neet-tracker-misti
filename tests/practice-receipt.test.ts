import { test } from "node:test";
import assert from "node:assert/strict";
import { readPracticeReceipt } from "../src/lib/practice-receipt";
test("practice receipt rejects queued, malformed, wrong-identity and wrong-state acknowledgements", async () => {
  for (const [status, body] of [[202, {test:{id:"a",status:"PAUSED"}}], [200, {}], [200, {test:{id:"b",status:"PAUSED"}}], [200, {test:{id:"a",status:"RUNNING"}}], [503, {error:"Retry"}]] as const) {
    await assert.rejects(readPracticeReceipt(Response.json(body, {status}), "a", "PAUSED"));
  }
  assert.equal((await readPracticeReceipt(Response.json({test:{id:"a",status:"COMPLETED"}}), "a", "COMPLETED")).status, "COMPLETED");
});
