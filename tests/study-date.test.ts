import assert from "node:assert/strict";
import test from "node:test";
import { indiaDateKey, requestedStudyDate } from "../src/lib/study-date";

test("study memory resolves today and yesterday across India midnight", () => {
  const now = new Date("2026-09-06T19:00:00.000Z");
  assert.equal(indiaDateKey(now), "2026-09-07");
  assert.equal(requestedStudyDate("What did I study today?", now), "2026-09-07");
  assert.equal(requestedStudyDate("What did I study yesterday?", now), "2026-09-06");
  assert.equal(requestedStudyDate("What have I studied recently?", now), null);
});
