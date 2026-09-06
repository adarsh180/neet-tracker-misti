import test from "node:test";
import assert from "node:assert/strict";
import { optionalRating } from "../src/lib/optional-rating";

test("skipped cycle ratings stay unknown rather than zero pain or minimum energy", () => {
  for (const value of [null, undefined, "", "  ", false, true, [], {}, "unknown", NaN, Infinity]) {
    assert.equal(optionalRating(value, 0, 10), null);
    assert.equal(optionalRating(value, 1, 10), null);
  }
});
test("explicit zero pain and supported historical numeric strings are preserved", () => {
  assert.equal(optionalRating(0, 0, 10), 0);
  assert.equal(optionalRating("0", 0, 10), 0);
  assert.equal(optionalRating(" 7 ", 1, 10), 7);
  assert.equal(optionalRating(0, 1, 10), null);
  assert.equal(optionalRating(-1, 0, 10), null);
  assert.equal(optionalRating(11, 0, 10), null);
});
