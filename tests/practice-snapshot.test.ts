import test from "node:test";
import assert from "node:assert/strict";
import { validatePracticeSnapshot } from "../src/lib/practice-snapshot";
test("attempt snapshots accept explicit unanswered states and reject corrupt data",()=>{
  assert.equal(validatePracticeSnapshot({answers:[{id:"q1",optionIndex:null}],questionStatuses:{q1:"NOT_ANSWERED"},remainingSeconds:30},["q1"],60),null);
  for(const body of [{answers:[{id:"unknown",optionIndex:1}]},{answers:[{id:"q1",optionIndex:9}]},{answers:[{id:"q1",optionIndex:1},{id:"q1",optionIndex:2}]},{remainingSeconds:Infinity},{remainingSeconds:61},{totalActiveSeconds:-2},{currentQuestionIndex:1},{questionStatuses:{q1:"WRONG"}}]) assert.ok(validatePracticeSnapshot(body,["q1"],60));
});
