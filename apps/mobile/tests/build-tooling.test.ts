import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("patched xcode uuid dependency preserves project identifier generation", () => {
  const project = require("xcode").project("fixture.xcodeproj");
  project.hash = { project: { objects: {} } };
  const identifiers = new Set(
    Array.from({ length: 100 }, () => project.generateUuid()),
  );
  assert.equal(identifiers.size, 100);
  for (const id of identifiers) assert.match(String(id), /^[0-9A-F]{24}$/);
});
