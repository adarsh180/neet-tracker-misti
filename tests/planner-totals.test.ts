import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleSummary, scheduleTotals } from "../src/lib/planner-totals";
test("planner narrative derives from schedule, excludes breaks and splits mixed blocks", () => {
  const totals = scheduleTotals([
    {start:"06:00",end:"08:00",subject:"Botany",kind:"STUDY"},
    {start:"08:00",end:"09:00",subject:"Break",kind:"BREAK"},
    {start:"09:00",end:"10:00",subject:"Physics",kind:"REVISION"},
    {start:"10:00",end:"12:00",subject:"Mixed",kind:"MOCK"},
    {start:"25:00",end:"26:00",subject:"Chemistry",kind:"STUDY"},
  ]);
  assert.deepEqual(totals, {studyHours:5,biologyHours:3,physicsChemistryHours:2,revisionHours:1});
  assert.match(scheduleSummary(totals), /^5 hours planned: 3h Biology and 2h Physics/);
});
