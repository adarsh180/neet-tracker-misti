import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { chatWithAI, streamWithAI } from "@/lib/openrouter";
import type { TutorRequestPayload } from "@/lib/visual-lab/types";

function compactPayload(payload: TutorRequestPayload) {
  return {
    concept: payload.concept,
    currentStep: payload.currentStep,
    selectedObject: payload.selectedObject,
    variables: payload.variables,
    equations: payload.equations,
    surfaceExpression: payload.surfaceExpression,
    sceneMode: payload.sceneMode,
    currentBeat: payload.currentBeat,
    activeSnapshot: payload.activeSnapshot,
    snapshotDiff: payload.snapshotDiff,
    validationErrors: payload.validationErrors,
    missionStatus: payload.missionStatus,
    practiceContext: payload.practiceContext,
    notebookContext: payload.notebookContext,
    studentLevel: payload.studentLevel,
    mode: payload.mode,
    question: payload.question,
  };
}

function buildMessages(payload: TutorRequestPayload) {
  const system = `You are the NEET Visual Lab tutor layer.

Rules:
- Explain only from the verified context provided by the app.
- Do not invent reactions, mechanisms, formulas, daughter nuclei, graph values, or experimental results.
- The deterministic app is the source of truth for science and graph values.
- If the context is insufficient, say that verified template support is needed before answering confidently.
- Default style: simple NEET/NCERT language, intuition first, formula second, exam takeaway third.
- Keep the answer compact unless the mode is "deep".
- Avoid markdown noise. Use short bullets only when they improve clarity.
- For "practice" mode: give exactly 2 crisp NEET-style MCQ practice checks with answers.
- If snapshotDiff, missionStatus, practiceContext, or notebookContext is supplied, use it to personalize the explanation.
- Never exceed 3 paragraphs for non-deep modes.`;

  const user = `Verified Visual Lab context:
${JSON.stringify(compactPayload(payload), null, 2)}

Student question:
${payload.question}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export async function POST(req: Request) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const stream = searchParams.get("stream") === "1";

  try {
    const payload = (await req.json()) as TutorRequestPayload;

    if (!payload?.concept?.title || !payload.question?.trim()) {
      return NextResponse.json({ error: "Concept context and question are required." }, { status: 400 });
    }

    const messages = buildMessages(payload);
    const maxTokens = payload.mode === "deep" ? 1600 : payload.mode === "practice" ? 600 : 900;

    if (stream) {
      // Streaming response — token-by-token
      const encoder = new TextEncoder();
      let resolvedModel = "";

      const readable = new ReadableStream({
        async start(controller) {
          try {
            const result = await streamWithAI(
              messages,
              (chunk) => {
                const data = JSON.stringify({ chunk });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              },
              maxTokens,
              0.25
            );
            resolvedModel = result.model;
            // Send model name as final event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model: resolvedModel })}\n\n`));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Stream error";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming (original behaviour preserved)
    const response = await chatWithAI(messages, maxTokens, 0.25, 18000);
    return NextResponse.json({ answer: response.content, model: response.model });
  } catch (error) {
    console.error("[visual-lab-explain]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
