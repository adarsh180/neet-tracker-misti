import assert from "node:assert/strict";
import test from "node:test";

import { findWakeInvocation, listenOnce, requestMicrophonePermission } from "../src/lib/browser-voice";

test("matches common wake-word transcription variants only at the start", () => {
  const phrases = ["hey bubu", "hey betu", "hey shona", "hey mentor"];
  assert.deepEqual(findWakeInvocation("Hey boo boo please open Physics", phrases), {
    transcript: "Hey boo boo please open Physics",
    phrase: "hey bubu",
    remainingCommand: "please open physics",
  });
  assert.equal(findWakeInvocation("I told Bubu to open Physics", phrases), null);
  assert.equal(findWakeInvocation("Hello mentor where can I see rank predictor", phrases)?.remainingCommand, "where can i see rank predictor");
});

test("ends cleanly when website speech recognition is unavailable", () => {
  let error = "";
  let ended = false;
  const recognition = listenOnce({
    onResult: () => {},
    onError: (message) => { error = message; },
    onEnd: () => { ended = true; },
  });

  assert.equal(recognition, null);
  assert.match(error, /unavailable/i);
  assert.equal(ended, true);
});

test("reports unsupported microphone capture without throwing", async () => {
  const result = await requestMicrophonePermission();
  assert.equal(result.granted, false);
  assert.equal(result.state, "unsupported");
  assert.match(result.message, /browser|microphone/i);
});
