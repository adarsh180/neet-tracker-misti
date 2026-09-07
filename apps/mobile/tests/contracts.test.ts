import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiUrl,
  extractSessionCookie,
  groupChapters,
  parseMetrics,
  parseReminderTime,
  parseSubjects,
  parseTaskReceipt,
  parseTasks,
  type Subject,
} from "../src/contracts";
test("native sessions accept only revocable trusted cookies", () => {
  assert.equal(
    extractSessionCookie(
      "neet_private_session=v2.device.token; Path=/; HttpOnly",
    ),
    "v2.device.token",
  );
  for (const value of [
    null,
    "other=value",
    "neet_private_session=misti.signature; Path=/",
    "neet_private_session=v2.device.token.evil; Path=/",
  ])
    assert.throws(() => extractSessionCookie(value));
});
test("API transport cannot send a private session to arbitrary origins", () => {
  assert.match(
    apiUrl("/api/tasks/task-id/transition"),
    /^https:\/\/neet-tracker-misti\.vercel\.app\/api\//,
  );
  for (const path of [
    "https://attacker.invalid/api/tasks",
    "//attacker.invalid/api/tasks",
    "/api/../signin",
    "/dashboard",
  ])
    assert.throws(() => apiUrl(path));
});
test("incomplete or unavailable records never become fake zero progress", () => {
  assert.throws(() =>
    parseMetrics({ dataHealth: { databaseAvailable: false } }),
  );
  assert.throws(() => parseMetrics({ totalTopics: 0 }));
  assert.throws(() =>
    parseSubjects([{ id: "a", name: "Physics", topics: [] }]),
  );
  assert.throws(() => parseTasks({ error: "unavailable" }));
  assert.deepEqual(parseTasks([]), []);
});
test("only the matching task completion receipt changes the board", () => {
  const task = {
    id: "a",
    title: "Revision",
    status: "DONE",
    priority: "MEDIUM",
    dueDate: null,
    plannedMinutes: null,
  };
  assert.equal(parseTaskReceipt(task, "a", "DONE").id, "a");
  assert.throws(() => parseTaskReceipt(task, "b", "DONE"));
  assert.throws(() =>
    parseTaskReceipt({ ...task, status: "TODO" }, "a", "DONE"),
  );
});
test("reminders use explicit valid device-local times", () => {
  assert.deepEqual(parseReminderTime("20:30"), { hour: 20, minute: 30 });
  assert.deepEqual(parseReminderTime("0:00"), { hour: 0, minute: 0 });
  for (const time of ["24:00", "20:60", "-1:30", "8pm", ""])
    assert.throws(() => parseReminderTime(time));
});
test("chapter counts preserve class scope and never duplicate ambiguous chapter-only totals", () => {
  const subject: Subject = {
    id: "s",
    name: "Physics",
    slug: "physics",
    topics: [
      {
        id: "t1",
        name: "One",
        chapter: "Mechanics",
        classLevel: "11",
        isCompleted: true,
        questionsSolved: 20,
      },
      {
        id: "t2",
        name: "Two",
        chapter: "Mechanics",
        classLevel: "12",
        isCompleted: false,
        questionsSolved: 5,
      },
      {
        id: "t3",
        name: "Three",
        chapter: "Optics",
        classLevel: "12",
        isCompleted: false,
        questionsSolved: 10,
      },
    ],
    chapterQuestionTotals: [
      { chapter: "Mechanics", questions: 100 },
      { chapter: "Optics", questions: 15 },
    ],
  };
  const result = groupChapters(subject);
  assert.deepEqual(
    result.map((chapter) => chapter.questions),
    [20, 5, 25],
  );
  assert.equal(new Set(result.map((chapter) => chapter.key)).size, 3);
});
