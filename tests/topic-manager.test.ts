import assert from "node:assert/strict";
import test from "node:test";

import { findLikelyDuplicateTopic } from "../src/lib/topic-manager";

test("recognizes spoken aliases and harmless grammatical variants as one topic", () => {
  const topics = [
    { id: "nlm", name: "Newton's Laws of Motion" },
    { id: "friction", name: "Friction" },
  ];

  assert.equal(findLikelyDuplicateTopic("Newton law of motion", topics)?.id, "nlm");
  assert.equal(findLikelyDuplicateTopic("NLM", topics)?.id, "nlm");
  assert.equal(findLikelyDuplicateTopic("Newton law of motion", [{ id: "short", name: "Newton's Laws" }])?.id, "short");
});

test("does not merge distinct short topic names", () => {
  const topics = [
    { id: "work", name: "Work" },
    { id: "power", name: "Power" },
  ];

  assert.equal(findLikelyDuplicateTopic("Torque", topics), null);
});
