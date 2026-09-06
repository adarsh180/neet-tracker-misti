export type ChatStreamEvent = { text?: string; conversationId?: string; model?: string; done?: boolean };

/** Decode the chat route's SSE records across arbitrary byte/chunk boundaries. */
export async function* readChatEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (line: string): ChatStreamEvent | null => {
    if (!line.startsWith("data:")) return null;
    const raw = line.slice(5).trim();
    if (!raw) return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error("The reply contained an unreadable event. Check the saved conversation before retrying."); }
    if (!value || typeof value !== "object") throw new Error("The reply event was incomplete.");
    const event = value as Record<string, unknown>;
    if (typeof event.error === "string") throw new Error(event.error);
    if (["text", "conversationId", "model"].some(key => event[key] !== undefined && typeof event[key] !== "string")) throw new Error("The reply event was incomplete.");
    return { text: event.text as string | undefined, conversationId: event.conversationId as string | undefined, model: event.model as string | undefined, done: event.done === true };
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) { const event = parse(line); if (event) yield event; }
      if (done) { const event = parse(buffer); if (event) yield event; break; }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
