import assert from "node:assert/strict";
import test from "node:test";

import {
  SECTIONAL_PCB_SUBJECTS,
  normalizeClassLevels,
  normalizePracticeScopes,
  normalizeSectionalClass,
  normalizeSourceKinds,
} from "../src/lib/practice-scope";

test("keeps independent class and subject scopes together", () => {
  const scopes = normalizePracticeScopes([
    { subject: "physics", classLevel: "11", chapter: "Laws of Motion" },
    { subject: "zoology", classLevel: "12", chapter: "Human Reproduction" },
    { subject: "chemistry", classLevel: "12", chapter: "Biomolecules" },
  ]);
  assert.deepEqual(scopes.map(({ subject, classLevel }) => `${subject}:${classLevel}`), ["physics:11", "zoology:12", "chemistry:12"]);
});

test("rejects a chapter assigned to the wrong class without locking valid scopes", () => {
  const scopes = normalizePracticeScopes([
    { subject: "physics", classLevel: "12", chapter: "Laws of Motion" },
    { subject: "botany", classLevel: "11", chapter: "Plant kingdom" },
  ]);
  assert.equal(scopes.length, 1);
  assert.equal(scopes[0].chapter, "3 Plant kingdom");
});

test("deduplicates exact scopes and normalizes aliases", () => {
  const scopes = normalizePracticeScopes([
    { subject: "physics", classLevel: "11", chapter: "Newton's Laws of Motion" },
    { subject: "physics", classLevel: "11", chapter: "Laws of Motion" },
  ]);
  assert.equal(scopes.length, 1);
  assert.equal(scopes[0].chapter, "Laws of Motion");
});

test("supports both classes and independently selected source kinds", () => {
  assert.deepEqual(normalizeClassLevels(["12", "11", "invalid"]), ["11", "12"]);
  assert.deepEqual(normalizeSourceKinds(["PYQ"]), ["PYQ"]);
  assert.deepEqual(normalizeSourceKinds(["QUESTION_BANK"]), ["QUESTION_BANK"]);
  assert.deepEqual(normalizeSourceKinds(undefined), ["PYQ", "QUESTION_BANK"]);
});

test("keeps sectional tests locked to one complete PCB class", () => {
  assert.equal(normalizeSectionalClass("11", ["12"]), "11");
  assert.equal(normalizeSectionalClass(null, ["12"]), "12");
  assert.equal(normalizeSectionalClass(null, ["11", "12"]), null);
  assert.deepEqual(SECTIONAL_PCB_SUBJECTS, ["physics", "chemistry", "botany", "zoology"]);
});
