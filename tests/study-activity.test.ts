import assert from "node:assert/strict";
import test from "node:test";

import { clampActivityNumbers, inferCoverage, inferStudyKind, resolveStudyMatch } from "../src/lib/study-activity";

const topics = [
  { id: "nlm", name: "Newton's Laws of Motion", chapter: "Laws of Motion", classLevel: "11", questionsSolved: 120, isCompleted: true },
  { id: "friction", name: "Friction", chapter: "Laws of Motion", classLevel: "11", questionsSolved: 55, isCompleted: false },
  { id: "optics", name: "Ray Optics", chapter: "Ray Optics and Optical Instruments", classLevel: "12", questionsSolved: 90, isCompleted: false },
];

test("matches common spoken NLM wording without inventing a topic", () => {
  const result = resolveStudyMatch("I studied Newton law of motion today", topics);
  assert.equal(result?.topicId, "nlm");
  assert.equal(result?.chapter, "Laws of Motion");
});

test("keeps a chapter-only mention at chapter scope", () => {
  const result = resolveStudyMatch("I revised the entire Laws of Motion chapter", topics);
  assert.equal(result?.topicId, null);
  assert.equal(result?.chapter, "Laws of Motion");
});

test("requires a reasonable match instead of creating unknown content", () => {
  assert.equal(resolveStudyMatch("quantum gardening", topics), null);
});

test("infers review semantics and bounds numeric deltas", () => {
  assert.equal(inferStudyKind("I revised it end to end"), "REVISION");
  assert.equal(inferCoverage("I revised the whole chapter"), "FULL");
  assert.deepEqual(clampActivityNumbers({ hoursStudied: 28, questionsDelta: -4, intensityLevel: 9 }), {
    hoursStudied: 24,
    questionsDelta: 0,
    intensityLevel: 5,
  });
});
