import assert from "node:assert/strict";
import { test } from "node:test";
import { cycleWindowError, validCalendarDate } from "../src/lib/cycle-validation";

test("cycle dates reject rollover, timestamp and non-string input", () => {
  for (const value of [null, {}, 2026, "", "2026-02-29", "2026-04-31", "2026-13-01", "2026-09-06T00:00:00Z"]) assert.equal(validCalendarDate(value), false);
  assert.equal(validCalendarDate("2024-02-29"), true);
  assert.equal(validCalendarDate("2026-09-06"), true);
});

test("cycle windows allow an ongoing period but not reversed or malformed end dates", () => {
  assert.equal(cycleWindowError("2026-09-01", null), null);
  assert.equal(cycleWindowError("2026-09-01", "2026-09-01"), null);
  assert.equal(cycleWindowError("2026-09-01", "2026-09-06"), null);
  assert.match(cycleWindowError("2026-09-06", "2026-09-01")!, /before/);
  assert.match(cycleWindowError("2026-09-06", "invalid")!, /end date/);
});
