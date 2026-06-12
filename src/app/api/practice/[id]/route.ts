import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sanitizePracticeTest, submitPracticeTest, type PracticeAnswer, type PracticeSubmitMeta } from "@/lib/practice-engine";
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
    const meta: PracticeSubmitMeta = {
      submitType: body.submitType === "AUTO" || body.submitType === "TIME_UP" ? body.submitType : "MANUAL",
      autoSubmitReason: typeof body.autoSubmitReason === "string" ? body.autoSubmitReason : null,
      questionStatuses: body.questionStatuses && typeof body.questionStatuses === "object" ? body.questionStatuses : undefined,
      currentQuestionIndex: Number.isInteger(Number(body.currentQuestionIndex)) ? Number(body.currentQuestionIndex) : undefined,
      remainingSeconds: Number.isFinite(Number(body.remainingSeconds)) ? Number(body.remainingSeconds) : undefined,
      pauseLogs: Array.isArray(body.pauseLogs) ? body.pauseLogs : undefined,
      securityEvents: Array.isArray(body.securityEvents) ? body.securityEvents : undefined,
      totalActiveSeconds: Number.isFinite(Number(body.totalActiveSeconds)) ? Number(body.totalActiveSeconds) : undefined,
      totalPausedSeconds: Number.isFinite(Number(body.totalPausedSeconds)) ? Number(body.totalPausedSeconds) : undefined,
    };
    const { test, result } = await submitPracticeTest(id, answers, timeTakenSeconds, meta);
    return NextResponse.json({ test: sanitizePracticeTest(test), result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : /already submitted|still generating/i.test(message) ? 400 : 500;
    if (status === 500) console.error("[practice/:id] submit failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const test = await db.practiceTest.findUnique({ where: { id } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (test.status === "COMPLETED") return NextResponse.json({ error: "Already completed" }, { status: 400 });

  const common = {
    answersJson: body.answers && Array.isArray(body.answers) ? body.answers : undefined,
    questionStatusesJson: body.questionStatuses && typeof body.questionStatuses === "object" ? body.questionStatuses : undefined,
    currentQuestionIndex: Number.isInteger(Number(body.currentQuestionIndex)) ? Math.max(0, Number(body.currentQuestionIndex)) : undefined,
    remainingSeconds: Number.isFinite(Number(body.remainingSeconds)) ? Math.max(0, Math.round(Number(body.remainingSeconds))) : undefined,
    pauseLogsJson: Array.isArray(body.pauseLogs) ? body.pauseLogs : undefined,
    securityEventsJson: Array.isArray(body.securityEvents) ? body.securityEvents : undefined,
    totalActiveSeconds: Number.isFinite(Number(body.totalActiveSeconds)) ? Math.max(0, Math.round(Number(body.totalActiveSeconds))) : undefined,
    totalPausedSeconds: Number.isFinite(Number(body.totalPausedSeconds)) ? Math.max(0, Math.round(Number(body.totalPausedSeconds))) : undefined,
  };

  const data =
    action === "start"
      ? { ...common, status: "RUNNING", startedAt: test.startedAt ?? new Date(), remainingSeconds: test.remainingSeconds ?? test.durationMinutes * 60 }
      : action === "pause"
        ? { ...common, status: "PAUSED" }
        : action === "resume"
          ? { ...common, status: "RUNNING" }
          : action === "autosave"
            ? common
            : null;

  if (!data) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const updated = await db.practiceTest.update({ where: { id }, data });
  return NextResponse.json({ test: sanitizePracticeTest(updated) });
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
