import test from "node:test";
import assert from "node:assert/strict";
import { readChatEvents } from "../src/lib/chat-stream";

function bytes(text: string, chunkSize = 3) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < encoded.length; i += chunkSize) controller.enqueue(encoded.slice(i, i + chunkSize));
    controller.close();
  } });
}
test("chat events preserve fragmented UTF-8 and a final record without a newline", async () => {
  const events = [];
  for await (const event of readChatEvents(bytes(': ping\r\ndata: {"text":"Misti’s revision","conversationId":"one"}\r\n\r\ndata: {"done":true,"conversationId":"one"}'))) events.push(event);
  assert.equal(events[0].text, "Misti’s revision");
  assert.equal(events[1].done, true);
  assert.equal(events.length, 2);
});
test("chat provider errors and malformed receipts are not silently treated as successful replies", async () => {
  for (const payload of ['data: {"error":"Service unavailable"}\n', 'data: broken\n', 'data: {"text":42}\n']) {
    await assert.rejects(async () => { for await (const event of readChatEvents(bytes(payload))) void event; });
  }
});
test("stopping event consumption cancels the underlying stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"text":"partial"}\n')); }, cancel() { cancelled = true; } });
  for await (const event of readChatEvents(stream)) { assert.equal(event.text, "partial"); break; }
  assert.equal(cancelled, true);
});
