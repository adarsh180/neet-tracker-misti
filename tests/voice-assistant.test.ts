import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSearchPhrase,
  isAffirmative,
  isSkipUtterance,
  parseIntensity,
  parseSpokenNumber,
  parseStudyHours,
  parseTomorrowTasks,
  resolveVoiceRoute,
} from "../src/lib/voice-assistant";

test("parses spoken study values and common skip phrases", () => {
  assert.equal(parseStudyHours("two and a half hours"), 2.5);
  assert.equal(parseStudyHours("ninety minutes"), 1.5);
  assert.equal(parseSpokenNumber("one hundred and twenty five questions"), 125);
  assert.equal(parseIntensity("very high intensity"), 5);
  assert.equal(parseIntensity("moderate"), 3);
  assert.equal(isSkipUtterance("I did not study this subject"), true);
  assert.equal(isSkipUtterance("nahi padha"), true);
  assert.equal(isAffirmative("yes save it"), true);
});

test("resolves direct navigation and leaves chapter names searchable", () => {
  assert.deepEqual(resolveVoiceRoute("please open practice arena"), { href: "/practice", label: "Practice Arena" });
  assert.deepEqual(resolveVoiceRoute("take me to chemistry"), { href: "/subjects/chemistry", label: "Chemistry" });
  assert.equal(resolveVoiceRoute("open molecular basis of inheritance"), null);
  assert.equal(extractSearchPhrase("open molecular basis of inheritance chapter"), "molecular basis of inheritance");
});

test("turns a reviewed tomorrow statement into dated Todo drafts", () => {
  const subjects = [
    { id: "physics-id", name: "Physics", slug: "physics" },
    { id: "botany-id", name: "Botany", slug: "botany" },
  ];
  const tasks = parseTomorrowTasks(
    "Tomorrow I will study physics electrostatics for two hours and botany genetics solve 60 questions",
    subjects,
  );
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].subjectId, "physics-id");
  assert.equal(tasks[0].plannedMinutes, 120);
  assert.match(tasks[0].title, /electrostatics/i);
  assert.equal(tasks[1].subjectId, "botany-id");
  assert.match(tasks[1].description ?? "", /60 questions/i);
  assert.deepEqual(parseTomorrowTasks("skip this part", subjects), []);
});
