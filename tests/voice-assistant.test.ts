import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSearchPhrase,
  isAffirmative,
  isSkipUtterance,
  parseIntensity,
  parseCompactStudyAnswer,
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
  assert.deepEqual(resolveVoiceRoute("could you please open the physics page for me now"), { href: "/subjects/physics", label: "Physics" });
  assert.deepEqual(resolveVoiceRoute("show me my mistake log"), { href: "/tests/error-log", label: "Error Log" });
  assert.deepEqual(resolveVoiceRoute("open P Y Q explorer"), { href: "/pyq/questions", label: "PYQ Explorer" });
  assert.deepEqual(resolveVoiceRoute("start a class twelve sectional test"), { href: "/practice?mode=sectional&classLevel=12", label: "Class 12 Sectional Test" });
  assert.equal(resolveVoiceRoute("open molecular basis of inheritance"), null);
  assert.equal(extractSearchPhrase("open molecular basis of inheritance chapter"), "molecular basis of inheritance");
  assert.deepEqual(resolveVoiceRoute("where can I see my rank predictor"), { href: "/ai-insights/rank-predictor", label: "Rank Predictor" });
  assert.deepEqual(resolveVoiceRoute("open full syllabus mock"), { href: "/practice?mode=full", label: "Full-Length Test" });
});

test("parses a complete subject update without filling omitted values", () => {
  assert.deepEqual(parseCompactStudyAnswer("I revised Newton laws of motion full chapter for two hours, solved 80 questions, intensity four, completed it and no weak concept"), {
    hours: 2,
    questions: 80,
    intensity: 4,
    coverage: "FULL",
    kind: "REVISION",
    completionConfirmed: true,
    weaknessAnswered: true,
    weakConcepts: "",
  });
  const incomplete = parseCompactStudyAnswer("I studied electrostatics");
  assert.equal(incomplete.hours, null);
  assert.equal(incomplete.questions, null);
  assert.equal(incomplete.intensity, null);
  assert.equal(incomplete.weaknessAnswered, false);
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
