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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, message, mode = "neet-guru", file } = body;

    if (!message?.trim() && !file) {
      return NextResponse.json({ error: "Message or file is required" }, { status: 400 });
    }

    // Build AI context + system prompt
    const context = await buildAIContext();
    const systemPrompt = buildSystemPrompt(
      context,
      mode as "neet-guru" | "rank" | "quiz" | "cycle"
    );
    const memoryPrompt = await buildMemoryContextForPrompt({
      latestMessage: message || (file?.name ? `Attached file: ${file.name}` : ""),
      context,
      displayName: context.student.name,
    });
    const augmentedSystemPrompt = memoryPrompt ? `${systemPrompt}\n\n${memoryPrompt}` : systemPrompt;

    // Get or create conversation
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
          title: message.slice(0, 60),
          messages: { create: [] },
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

    // Save user message
    await db.aiMessage.create({
      data: { conversationId: conversation.id, role: "user", content: message },
    });

    // Build message history for context (last 20 messages)
    const history = conversation.messages.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Build message content — support multimodal for images and PDFs
    let userMessageContent: string | MultimodalPart[];

    if (file?.base64 && file?.mimeType) {
      // Build multimodal content array for Gemini vision
      const parts: MultimodalPart[] = [];

      if (message?.trim()) {
        parts.push({ type: "text", text: message });
      }

      if (file.mimeType.startsWith("image/")) {
        // Image: use standard OpenAI vision format (base64 URL)
        parts.push({
          type: "image_url",
          image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
        });
      } else if (file.mimeType === "application/pdf") {
        // PDF: Gemini supports inline data for PDFs via its own format in the OpenAI-compatible endpoint
        parts.push({
          type: "text",
          text: `[The user has uploaded a PDF document named "${file.name}". The file content is provided as base64 below for your analysis. Please analyze it thoroughly for NEET UG preparation context.\n\nFile (base64, pdf): ${file.base64.substring(0, 100)}... [full PDF transmitted via inline_data]`
        });
        // Also push as inline_data which Gemini's OAI-compat layer understands
        parts.push({
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${file.base64}` },
        });
      }

      if (parts.length === 0) {
        parts.push({ type: "text", text: "Please analyze the attached file." });
      }

      userMessageContent = parts;
    } else {
      userMessageContent = message;
    }

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

            // Rate limited â€” try next model
            if (res.status === 429) {
              attemptErrors.push(`${model}: 429 rate-limited`);
              console.warn(`[AI Chat] ${model} â†’ 429 rate-limited, trying next`);
              continue;
            }

            if (!res.ok) {
              const errText = await res.text();
              attemptErrors.push(`${model}: HTTP ${res.status}`);
              console.warn(`[AI Chat] ${model} â†’ HTTP ${res.status}: ${errText.slice(0, 120)}`);
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
              buffer = lines.pop() || ""; // retain incomplete trailing line

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
                } catch { /* skip malformed SSE */ }
              }
            }

            if (fullContent) { success = true; break; }
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
          // Persist AI response
          await db.aiMessage.create({
            data: { conversationId: convId, role: "assistant", content: fullContent },
          });

          try {
            await updateMemoryFromExchange({
              conversationId: convId,
              mode: mode as "neet-guru" | "rank" | "quiz" | "cycle",
              userMessage: message || (file?.name ? `User uploaded ${file.name}` : "File-only interaction"),
              assistantMessage: fullContent,
              context,
              displayName: context.student.name,
            });
          } catch (memoryErr) {
            console.warn("[AI Chat] Memory update skipped:", String(memoryErr));
          }

          // Update conversation title on first message
          if (conversation!.messages.length === 0) {
            await db.aiConversation.update({
              where: { id: convId },
              data: { title: message.slice(0, 60) },
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
        "X-Accel-Buffering": "no",       // prevents Nginx buffering
      },
    });
  } catch (err) {
    console.error("[AI Chat] Outer error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

