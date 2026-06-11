import { NextRequest, NextResponse } from "next/server";

import { evaluateReviewAnswers, sanitizeReviewCard, type ReviewAnswer } from "@/lib/review-agent";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const rawAnswers = Array.isArray(body?.answers) ? body.answers : [];

  const answers: ReviewAnswer[] = rawAnswers
    .filter((entry: unknown): entry is { id: unknown; optionIndex: unknown } => Boolean(entry) && typeof entry === "object")
    .map((entry: { id: unknown; optionIndex: unknown }) => ({
      id: String(entry.id ?? ""),
      optionIndex: Number(entry.optionIndex),
    }))
    .filter((entry: ReviewAnswer) => entry.id && Number.isInteger(entry.optionIndex) && entry.optionIndex >= 0);

  if (!answers.length) {
    return NextResponse.json({ error: "Answers are required" }, { status: 400 });
  }

  try {
    const { card } = await evaluateReviewAnswers(id, answers);
    return NextResponse.json({ card: sanitizeReviewCard(card) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : /already completed|Answer all/i.test(message) ? 400 : 500;
    if (status === 500) console.error("[reviews/:id] evaluation failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
