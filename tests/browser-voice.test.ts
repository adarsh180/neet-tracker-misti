import assert from "node:assert/strict";
import test from "node:test";

import { listenOnce, requestMicrophonePermission } from "../src/lib/browser-voice";

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
