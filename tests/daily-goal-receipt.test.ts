import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgedDailyGoalIds, reconcileDailyGoalQueue } from "../src/lib/daily-goal-receipt";

test("queued, failed and missing receipts never count as saved study logs", () => {
  const payload = { results: [{ id: "physics", ok: true }] };
  assert.equal(acknowledgedDailyGoalIds(202, payload, ["physics"]).size, 0);
  assert.equal(acknowledgedDailyGoalIds(500, payload, ["physics"]).size, 0);
  assert.equal(acknowledgedDailyGoalIds(200, {}, ["physics"]).size, 0);
});

test("partial daily-goal receipts acknowledge only requested successful entries", () => {
  assert.deepEqual([...acknowledgedDailyGoalIds(207, { results: [
    { id: "physics", ok: true }, { id: "chemistry", ok: false }, { id: "unexpected", ok: true },
  ] }, ["physics", "chemistry", "botany"])], ["physics"]);
});

test("queue reconciliation retains edits made while a previous version was syncing", () => {
  const sent = [{ id: "physics", questions: 20 }, { id: "chemistry", questions: 30 }];
  const current = [{ id: "physics", questions: 45 }, sent[1], { id: "botany", questions: 10 }];
  assert.deepEqual(reconcileDailyGoalQueue(current, sent, new Set(["physics", "chemistry"])), [current[0], current[2]]);
});
