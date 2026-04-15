import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAIContext, buildSystemPrompt } from "@/lib/ai-context-builder";
import { buildMemoryContextForPrompt, updateMemoryFromExchange } from "@/lib/ai-memory";
import { MODELS_LIST } from "@/lib/openrouter";

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

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

type MultimodalPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type IncomingAttachment = {
  name: string;
  mimeType: string;
  base64: string;
};

type HistoryRow = {
  role: string;
  content: string;
  attachmentsJson: unknown;
};

function normalizeAttachments(body: { file?: IncomingAttachment | null; files?: IncomingAttachment[] | null }) {
  if (Array.isArray(body.files) && body.files.length > 0) {
    return body.files.filter((file) => file?.base64 && file?.mimeType);
  }

  if (body.file?.base64 && body.file?.mimeType) {
    return [body.file];
  }

  return [];
}

function getAttachmentSummary(files: IncomingAttachment[]) {
  if (!files.length) return "";
  return files.map((file, index) => `${index + 1}. ${file.name} (${file.mimeType})`).join("\n");
}

function buildUserContent(message: string, files: IncomingAttachment[]): string | MultimodalPart[] {
  if (!files.length) return message;

  const parts: MultimodalPart[] = [
    {
      type: "text",
      text: [
        `Attached materials:\n${getAttachmentSummary(files)}`,
        message.trim() || "Analyze all attached materials and help me properly.",
        "Inspect every attachment carefully before answering. If this is a study doubt, explain the concept, the reasoning, and the final answer in detail.",
      ].join("\n\n"),
    },
  ];

  for (const file of files) {
    if (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf") {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
      });
    }
  }

  return parts;
}

function buildHistoryMessage(message: HistoryRow) {
  const attachments = Array.isArray(message.attachmentsJson)
    ? (message.attachmentsJson as IncomingAttachment[]).filter((item) => item?.base64 && item?.mimeType)
    : [];

  return {
    role: message.role as "user" | "assistant",
    content: message.role === "user" ? buildUserContent(message.content, attachments) : message.content,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, message = "", mode = "neet-guru" } = body;
    const files = normalizeAttachments(body);

    if (!message.trim() && files.length === 0) {
      return NextResponse.json({ error: "Message or file is required" }, { status: 400 });
    }

    const context = await buildAIContext();
    const systemPrompt = buildSystemPrompt(context, mode as "neet-guru" | "rank" | "quiz" | "cycle");
    const memoryPrompt = await buildMemoryContextForPrompt({
      latestMessage: message || (files.length ? `Attached files:\n${getAttachmentSummary(files)}` : ""),
      context,
      displayName: context.student.name,
    });
    const augmentedSystemPrompt = memoryPrompt ? `${systemPrompt}\n\n${memoryPrompt}` : systemPrompt;

    let conversation;
    if (conversationId) {
      conversation = await db.aiConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

    if (!conversation) {
      conversation = await db.aiConversation.create({
        data: {
          mode,
          title: (message || files[0]?.name || "New Conversation").slice(0, 60),
          messages: { create: [] },
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

    await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
        attachmentsJson: files.length ? files : undefined,
      },
    });

    const history = conversation.messages.slice(-20).map((row) => buildHistoryMessage(row));
    const userMessageContent = buildUserContent(message, files);
    const messages = [
      { role: "system" as const, content: augmentedSystemPrompt },
      ...history,
      { role: "user" as const, content: userMessageContent },
    ];

    const encoder = new TextEncoder();
    const convId = conversation.id;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        let fullContent = "";
        let usedModel = "";
        let success = false;
        const attemptErrors: string[] = [];

        for (const model of MODELS_LIST) {
          try {
            const res = await fetch(`${GOOGLE_BASE}/chat/completions`, {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify({
                model,
                messages,
                max_tokens: 4096,
                temperature: mode === "quiz" ? 0.1 : 0.7,
                stream: true,
              }),
            });

            if (res.status === 429) {
              attemptErrors.push(`${model}: 429 rate-limited`);
              console.warn(`[AI Chat] ${model} -> 429 rate-limited, trying next`);
              continue;
            }

            if (!res.ok) {
              const errText = await res.text();
              attemptErrors.push(`${model}: HTTP ${res.status}`);
              console.warn(`[AI Chat] ${model} -> HTTP ${res.status}: ${errText.slice(0, 120)}`);
              continue;
            }

            if (!res.body) {
              attemptErrors.push(`${model}: no response body`);
              continue;
            }

            usedModel = model;
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += dec.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (data === "[DONE]") break;
                try {
                  const parsed = JSON.parse(data);
                  const text = parsed.choices?.[0]?.delta?.content || "";
                  if (text) {
                    fullContent += text;
                    send({ text, conversationId: convId });
                  }
                } catch {
                  continue;
                }
              }
            }

            if (fullContent) {
              success = true;
              break;
            }

            attemptErrors.push(`${model}: empty response`);
          } catch (err) {
            const msg = String(err);
            attemptErrors.push(`${model}: ${msg}`);
            console.warn(`[AI Chat] ${model} threw:`, msg);
          }
        }

        if (!success) {
          const errMsg = `All ${MODELS_LIST.length} models failed:\n${attemptErrors.join("\n")}`;
          console.error("[AI Chat]", errMsg);
          send({ error: errMsg });
        } else {
          await db.aiMessage.create({
            data: { conversationId: convId, role: "assistant", content: fullContent },
          });

          try {
            await updateMemoryFromExchange({
              conversationId: convId,
              mode: mode as "neet-guru" | "rank" | "quiz" | "cycle",
              userMessage:
                message || (files.length ? `User uploaded ${files.map((file) => file.name).join(", ")}` : "File-only interaction"),
              assistantMessage: fullContent,
              context,
              displayName: context.student.name,
            });
          } catch (memoryErr) {
            console.warn("[AI Chat] Memory update skipped:", String(memoryErr));
          }

          if (conversation.messages.length === 0) {
            await db.aiConversation.update({
              where: { id: convId },
              data: { title: (message || files[0]?.name || "New Conversation").slice(0, 60) },
            });
          }

          send({ done: true, conversationId: convId, model: usedModel });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[AI Chat] Outer error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
