import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  editableTask,
  numeric,
  parseDay,
  parseWriteReceipt,
  screenFields,
  type DayWrite,
  type TaskWrite,
} from "../src/forms-contract";
const date = "2026-01-01",
  updatedAt = "2026-01-01T12:00:00.000Z";
const entry = {
  subjectId: "physics",
  updatedAt,
  hoursStudied: 2,
  questionsSolved: 80,
  intensityLevel: 4,
  disciplineScore: 90,
  completionPercent: 85,
  notes: null,
};
const day = { date, entries: [entry], screen: null };
const write: DayWrite = {
  kind: "day",
  operationId: "receipt",
  date,
  entries: [{ ...entry, expectedUpdatedAt: null }],
  screen: null,
};
test("form numbers and dates reject partial parsing and overflow", () => {
  assert.equal(numeric("2.5", 24), 2.5);
  assert.equal(numeric("", 24), 0);
  for (const n of ["2 hours", "1e2", "-1", "NaN", "25", "1,5"])
    assert.throws(() => numeric(n, 24));
  assert.throws(() => numeric("2.5", 100, true));
  assert.throws(() => dateKey("2026-02-30"));
  assert.equal(dateKey("2024-02-29"), "2024-02-29");
});
test("day reads require matching date, versions and all fields", () => {
  assert.deepEqual(parseDay(day, date), day);
  for (const value of [
    { ...day, date: "2026-01-02" },
    { ...day, entries: [{ ...entry, updatedAt: undefined }] },
    { ...day, entries: [entry, entry] },
    { ...day, screen: {} },
  ])
    assert.throws(() => parseDay(value, date));
});
test("daily save only acknowledges the exact full receipt", () => {
  const receipt = { kind: "day", operationId: "receipt", result: day };
  assert.deepEqual(parseWriteReceipt(receipt, write), day);
  for (const value of [
    { ...receipt, operationId: "wrong" },
    { ...receipt, kind: "task" },
    { ...receipt, result: { ...day, entries: [] } },
    {
      ...receipt,
      result: { ...day, entries: [{ ...entry, questionsSolved: 79 }] },
    },
  ])
    assert.throws(() => parseWriteReceipt(value, write));
  const screen = {
    note: null,
    expectedUpdatedAt: null,
    ...Object.fromEntries(screenFields.map(([k]) => [k, 0])),
  } as NonNullable<DayWrite["screen"]>;
  assert.throws(() => parseWriteReceipt(receipt, { ...write, screen }));
});
test("task edit receipts match fields, date and server version", () => {
  const task = {
    id: "task1",
    title: "Revise NLM",
    description: null,
    subjectId: null,
    status: "TODO",
    priority: "HIGH",
    dueDate: "2026-01-02T00:00:00.000Z",
    plannedMinutes: 45,
    updatedAt,
  };
  const write: TaskWrite = {
    kind: "task",
    operationId: "receipt",
    task: { ...task, dueDate: "2026-01-02", expectedUpdatedAt: updatedAt },
  };
  assert.equal(editableTask(task).id, "task1");
  assert.throws(() => editableTask({ ...task, updatedAt: undefined }));
  const receipt = { kind: "task", operationId: "receipt", result: task };
  assert.equal(
    (parseWriteReceipt(receipt, write) as typeof task).title,
    task.title,
  );
  assert.throws(() =>
    parseWriteReceipt(
      { ...receipt, result: { ...task, plannedMinutes: 30 } },
      write,
    ),
  );
});
