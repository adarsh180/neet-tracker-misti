import { test } from "node:test";
import assert from "node:assert/strict";
import { checkVersion, day, parseNativeWrite, screenKeys } from "../src/lib/native-input";
const operationId = "00000000-0000-4000-8000-000000000001";
const entry = { subjectId: "physics", expectedUpdatedAt: null, hoursStudied: 2, questionsSolved: 80, intensityLevel: 4, disciplineScore: 85, completionPercent: 90, notes: null };
const daily = { operationId, kind: "day", date: "2026-01-01", entries: [entry], screen: null };
test("native daily boundary rejects coercion, duplicates, impossible dates and totals", () => {
  assert.equal(parseNativeWrite(daily).kind, "day");
  for (const [key, value] of [["hoursStudied", "2"], ["questionsSolved", 1.5], ["questionsSolved", 2147483648], ["intensityLevel", 6], ["disciplineScore", 101], ["notes", undefined], ["expectedUpdatedAt", "yesterday"]]) assert.throws(() => parseNativeWrite({ ...daily, entries: [{ ...entry, [key as string]: value }] }));
  assert.throws(() => parseNativeWrite({ ...daily, entries: [entry, entry] }));
  assert.throws(() => parseNativeWrite({ ...daily, entries: [{ ...entry, hoursStudied: 20 }, { ...entry, subjectId: "chemistry", hoursStudied: 5 }] }));
  for (const date of ["2026-02-30", "2026-13-01", "2026-1-01", "2099-01-01"]) assert.throws(() => parseNativeWrite({ ...daily, date }));
  assert.equal(day("2024-02-29"), "2024-02-29");
});
test("native screen time is explicit, bounded and may be saved without study", () => {
  const screen = { expectedUpdatedAt: null, note: "  Less scrolling  ", ...Object.fromEntries(screenKeys.map(key => [key, 0])) };
  const write = parseNativeWrite({ ...daily, entries: [], screen });
  assert.equal(write.kind === "day" && write.screen?.note, "Less scrolling");
  assert.throws(() => parseNativeWrite({ ...daily, screen: { ...screen, youtubeStudy: -1 } }));
  assert.throws(() => parseNativeWrite({ ...daily, entries: [] }));
});
test("task fields are bounded and versions cannot be omitted", () => {
  const task = { id: null, expectedUpdatedAt: null, title: "  Revise NLM  ", description: "", priority: "HIGH", subjectId: null, dueDate: null, plannedMinutes: 45 };
  const result = parseNativeWrite({ operationId, kind: "task", task });
  assert.equal(result.kind === "task" && result.task.title, "Revise NLM");
  for (const patch of [{ title: " " }, { title: "a".repeat(241) }, { priority: "URGENT" }, { plannedMinutes: -1 }, { expectedUpdatedAt: undefined }, { dueDate: "2026-02-30" }]) assert.throws(() => parseNativeWrite({ operationId, kind: "task", task: { ...task, ...patch } }));
});
test("optimistic checks detect create/delete/edit conflicts", () => {
  const date = new Date("2026-01-01T12:00:00.123Z");
  checkVersion(date, date.toISOString()); checkVersion(null, null);
  assert.throws(() => checkVersion(date, null));
  assert.throws(() => checkVersion(null, date.toISOString()));
  assert.throws(() => checkVersion(date, "2026-01-01T12:00:00.124Z"));
});
test("progress requests require exact scope, explicit revision and whole positive deltas", () => {
  const entry = { topicId: "nlm", subjectId: "physics", chapter: "Laws of Motion", classLevel: "11", expectedUpdatedAt: "2026-01-01T12:00:00.000Z", expectedQuestions: 20, expectedRevisions: 2, expectedCompleted: false, questionsDelta: 45, completed: true, fullRevision: true, note: null };
  const request = { operationId, kind: "progress", date: "2026-01-01", entries: [entry] };
  assert.equal(parseNativeWrite(request).kind, "progress");
  for (const patch of [{ questionsDelta: -1 }, { questionsDelta: 1.5 }, { fullRevision: "yes" }, { expectedUpdatedAt: null }, { expectedRevisions: undefined }, { expectedQuestions: 2147483640 }, { completed: "true" }, { chapter: undefined }]) assert.throws(() => parseNativeWrite({ ...request, entries: [{ ...entry, ...patch }] }));
  assert.throws(() => parseNativeWrite({ ...request, entries: [entry, entry] }));
  assert.throws(() => parseNativeWrite({ ...request, entries: [{ ...entry, questionsDelta: 0, completed: null, fullRevision: false }] }));
});
