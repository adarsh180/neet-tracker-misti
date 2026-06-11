import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sanitizePracticeTest, submitPracticeTest, type PracticeAnswer } from "@/lib/practice-engine";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await db.practiceTest.findUnique({ where: { id } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ test: sanitizePracticeTest(test) });
}

// Submit answers → grade on NTA scheme → auto-feed TestRecord + Error Log.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const answers: PracticeAnswer[] = Array.isArray(body.answers)
    ? body.answers
        .filter((entry: unknown): entry is { id: unknown; optionIndex: unknown } => Boolean(entry) && typeof entry === "object")
        .map((entry: { id: unknown; optionIndex: unknown }) => ({
          id: String(entry.id ?? ""),
          optionIndex:
            entry.optionIndex === null || entry.optionIndex === undefined ? null : Number(entry.optionIndex),
        }))
        .filter(
          (entry: PracticeAnswer) =>
            entry.id && (entry.optionIndex === null || (Number.isInteger(entry.optionIndex) && entry.optionIndex >= 0 && entry.optionIndex <= 3)),
        )
    : [];

  const timeTakenSeconds =
    Number.isFinite(Number(body.timeTakenSeconds)) && Number(body.timeTakenSeconds) > 0
      ? Math.round(Number(body.timeTakenSeconds))
      : null;

  try {
    const { test, result } = await submitPracticeTest(id, answers, timeTakenSeconds);
    return NextResponse.json({ test: sanitizePracticeTest(test), result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : /already submitted|still generating/i.test(message) ? 400 : 500;
    if (status === 500) console.error("[practice/:id] submit failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await db.practiceTest.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (test.status === "COMPLETED") {
    return NextResponse.json({ error: "Completed tests are part of your record and cannot be deleted here" }, { status: 400 });
  }

  await db.practiceTest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
