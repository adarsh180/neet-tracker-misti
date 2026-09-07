import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareProgress,
  parseProgressReceipt,
} from "../src/progress-contract";
import { type Topic } from "../src/contracts";
const topic: Topic = {
  id: "nlm",
  subjectId: "physics",
  name: "Newton’s laws",
  chapter: "Laws of Motion",
  classLevel: "11",
  updatedAt: "2026-01-01T12:00:00.000Z",
  questionsSolved: 20,
  isCompleted: false,
  _count: { revisions: 2 },
};
const selection = { nlm: { selected: true, questions: "45" } };
const build = () =>
  prepareProgress(
    "physics",
    [topic],
    selection,
    true,
    true,
    "Revised end to end",
    "2026-01-01",
    "receipt",
  );
test("topic progress uses additions, exact IDs and explicit full revision", () => {
  const [entry] = build().entries;
  assert.equal(entry.questionsDelta, 45);
  assert.equal(entry.expectedQuestions, 20);
  assert.equal(entry.fullRevision, true);
  assert.equal(entry.classLevel, "11");
  assert.equal(entry.topicId, "nlm");
  assert.throws(() =>
    prepareProgress(
      "chemistry",
      [topic],
      selection,
      true,
      true,
      "",
      "2026-01-01",
      "receipt",
    ),
  );
  assert.throws(() =>
    prepareProgress(
      "physics",
      [{ ...topic, updatedAt: undefined }],
      selection,
      true,
      false,
      "",
      "2026-01-01",
      "receipt",
    ),
  );
  assert.throws(() =>
    prepareProgress(
      "physics",
      [topic],
      { nlm: { selected: true, questions: "-4" } },
      null,
      false,
      "",
      "2026-01-01",
      "receipt",
    ),
  );
});
test("bulk completion leaves already completed topics untouched", () => {
  const done = { ...topic, id: "done", isCompleted: true };
  const write = prepareProgress(
    "physics",
    [topic, done],
    {
      nlm: { selected: true, questions: "" },
      done: { selected: true, questions: "" },
    },
    true,
    false,
    "",
    "2026-01-01",
    "receipt",
  );
  assert.deepEqual(
    write.entries.map((e) => e.topicId),
    ["nlm"],
  );
  assert.throws(() =>
    prepareProgress(
      "physics",
      [done],
      { done: { selected: true, questions: "" } },
      true,
      false,
      "",
      "2026-01-01",
      "receipt",
    ),
  );
});
test("progress receipt must match every question, status, class and revision", () => {
  const write = build(),
    result = {
      ...topic,
      questionsSolved: 65,
      isCompleted: true,
      _count: { revisions: 3 },
    };
  const receipt = {
    operationId: "receipt",
    kind: "progress",
    result: { topics: [result] },
  };
  assert.equal(parseProgressReceipt(receipt, write)[0].questionsSolved, 65);
  for (const patch of [
    { questionsSolved: 45 },
    { isCompleted: false },
    { classLevel: "12" },
    { subjectId: "chemistry" },
    { _count: { revisions: 4 } },
    { updatedAt: undefined },
  ])
    assert.throws(() =>
      parseProgressReceipt(
        { ...receipt, result: { topics: [{ ...result, ...patch }] } },
        write,
      ),
    );
  assert.throws(() =>
    parseProgressReceipt(
      { ...receipt, result: { topics: [result, result] } },
      write,
    ),
  );
  assert.throws(() =>
    parseProgressReceipt({ ...receipt, operationId: "other" }, write),
  );
});
