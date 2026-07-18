const OPENROUTER_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

// Cost-controlled order: Flash-Lite handles routine structured work, 2.5 Flash
// provides an independent reliable pass, and 3.5 Flash is the final escalation.
// Historical property names remain as aliases because older maintenance scripts
// import them. Gemini Pro models are deliberately excluded from default lanes.
const LOW_COST_MODEL = process.env.AI_MODEL_1 || "gemini-3.1-flash-lite";
const RELIABLE_MODEL = process.env.AI_MODEL_2 || "gemini-2.5-flash";
const QUALITY_MODEL = process.env.AI_MODEL_3 || "gemini-3.5-flash";

export const AI_MODELS = {
  lowCost: LOW_COST_MODEL,
  reliable: RELIABLE_MODEL,
  quality: QUALITY_MODEL,
  fallback1: LOW_COST_MODEL,
  primary: RELIABLE_MODEL,
  bulkFlash: QUALITY_MODEL,
  emergencyFallback: process.env.AI_MODEL_4 || QUALITY_MODEL,
};

// Default attempt order for chatWithAI/streamWithAI.
export const MODELS_LIST = [
  AI_MODELS.lowCost,
  AI_MODELS.reliable,
  AI_MODELS.quality,
];

// High-throughput bank work always tries the cheapest capable model first.
export const BANK_MODELS = MODELS_LIST;
// Independent second pass for double-blind verification (different lead model so
// the two solves are genuinely independent).
export const BANK_SECOND_PASS_MODELS = [
  AI_MODELS.reliable,
  AI_MODELS.lowCost,
  AI_MODELS.quality,
];

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatContentPart[];
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function foldSystemIntoUser(messages: ChatMessage[]): ChatMessage[] {
  const systemContent = messages
    .filter((message) => message.role === "system")
    .map((message) => typeof message.content === "string" ? message.content.trim() : "")
    .filter(Boolean)
    .join("\n\n");

  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  if (!systemContent) return messages;
  if (!nonSystemMessages.length) return [{ role: "user", content: systemContent }];

  const [firstMessage, ...rest] = nonSystemMessages;
  return [
    {
      role: "user" as const,
      content: typeof firstMessage.content === "string"
        ? `Instruction:\n${systemContent}\n\nRequest:\n${firstMessage.content}`
        : [{ type: "text", text: `Instruction:\n${systemContent}` }, ...firstMessage.content],
    },
    ...rest,
  ];
}

function getHeaders() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function callModel(
  model: string,
  messages: ChatMessage[],
  maxTokens = 4096,
  temperature = 0.7,
  timeoutMs = 60000
): Promise<AIResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: false }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  if (res.status === 429) throw new Error(`RATE_LIMITED:${model}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status} - ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("Empty response from model");
  return { content, model, usage: data.usage };
}

export async function chatWithAI(
  messages: ChatMessage[],
  maxTokens = 4096,
  temperature = 0.7,
  timeoutMs = 18000,
  models: string[] = MODELS_LIST
): Promise<AIResponse> {
  const errors: string[] = [];

  for (const model of models) {
    try {
      const result = await callModel(model, messages, maxTokens, temperature, timeoutMs);
      if (result.content) return result;
    } catch (err) {
      const msg = String(err);

      if (
        msg.includes("Developer instruction is not enabled") &&
        messages.some((message) => message.role === "system")
      ) {
        try {
          const retried = await callModel(model, foldSystemIntoUser(messages), maxTokens, temperature, timeoutMs);
          if (retried.content) return retried;
        } catch (retryErr) {
          const retryMsg = String(retryErr);
          errors.push(`${model} (folded): ${retryMsg}`);
          console.warn(`[Google AI Studio] ${model} folded retry failed -> ${retryMsg}`);
        }
      }

      errors.push(`${model}: ${msg}`);
      console.warn(`[Google AI Studio] ${model} failed -> ${msg}`);
    }
  }

  throw new Error(`All models failed:\n${errors.join("\n")}`);
}

export async function streamWithAI(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  maxTokens = 4096,
  temperature = 0.7
): Promise<{ model: string; fullContent: string }> {
  const errors: string[] = [];

  for (const model of MODELS_LIST) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true }),
      });

      if (res.status === 429) {
        errors.push(`${model}: rate-limited`);
        console.warn(`[Stream] ${model} rate-limited, trying next...`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        errors.push(`${model}: HTTP ${res.status}`);
        console.warn(`[Stream] ${model} HTTP ${res.status}: ${errText.slice(0, 100)}`);
        continue;
      }

      if (!res.body) {
        errors.push(`${model}: no body`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content || "";
            if (text) {
              fullContent += text;
              onChunk(text);
            }
          } catch {
            continue;
          }
        }
      }

      if (!fullContent) {
        errors.push(`${model}: empty stream response`);
        continue;
      }

      return { model, fullContent };
    } catch (err) {
      const msg = String(err);
      errors.push(`${model}: ${msg}`);
      console.warn(`[Stream] ${model} threw: ${msg}`);
    }
  }

  throw new Error(`All streaming models failed:\n${errors.join("\n")}`);
}
