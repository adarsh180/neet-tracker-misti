import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  PRACTICE_MISTAKE_TAGS,
  deletePracticeTestRecord,
  getPracticeQuestionReviews,
  sanitizePracticeTest,
  savePracticeQuestionReview,
  submitPracticeTest,
  type PracticeAnswer,
  type PracticeMistakeTag,
  type PracticeSubmitMeta,
} from "@/lib/practice-engine";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await db.practiceTest.findFirst({ where: { id, userId: session.userId } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reviews = test.status === "COMPLETED" ? await getPracticeQuestionReviews(test.id) : [];
  return NextResponse.json({ test: { ...sanitizePracticeTest(test), reviews } });
}

// Submit answers → grade on NTA scheme → auto-feed TestRecord + Error Log.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const owned = await db.practiceTest.findFirst({ where: { id, userId: session.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    const reviews = await getPracticeQuestionReviews(test.id);
    return NextResponse.json({ test: { ...sanitizePracticeTest(test), reviews }, result });
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
  const test = await db.practiceTest.findFirst({ where: { id, userId: session.userId } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "move-folder") {
    const folderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
    if (folderId) {
      const folder = await db.practiceTestFolder.findFirst({ where: { id: folderId, userId: session.userId }, select: { id: true } });
      if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    const updated = await db.practiceTest.update({ where: { id }, data: { folderId } });
    return NextResponse.json({ test: sanitizePracticeTest(updated) });
  }
  if (action === "proctor-consent") {
    if (test.status === "COMPLETED" || test.status === "GENERATING") return NextResponse.json({ error: "This attempt cannot enter proctoring" }, { status: 400 });
    const updated = await db.practiceTest.update({
      where: { id },
      data: { proctorConsentAt: test.proctorConsentAt ?? new Date(), proctorReportStatus: "PENDING" },
    });
    return NextResponse.json({ test: sanitizePracticeTest(updated) });
  }
  if (action === "review") {
    if (test.status !== "COMPLETED") return NextResponse.json({ error: "Submit the test before reviewing answers" }, { status: 400 });
    const mistakeTag = body.mistakeTag === null || body.mistakeTag === ""
      ? null
      : PRACTICE_MISTAKE_TAGS.includes(body.mistakeTag as PracticeMistakeTag)
        ? body.mistakeTag as PracticeMistakeTag
        : undefined;
    if (mistakeTag === undefined) return NextResponse.json({ error: "Unknown mistake tag" }, { status: 400 });
    try {
      const review = await savePracticeQuestionReview({
        testId: test.id,
        questionId: String(body.questionId ?? ""),
        mistakeTag,
        customMistakeText: typeof body.customMistakeText === "string" ? body.customMistakeText : null,
      });
      const reviews = await getPracticeQuestionReviews(test.id);
      return NextResponse.json({ review, reviews });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save review" }, { status: 400 });
    }
  }
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
  try {
    const deleted = await deletePracticeTestRecord(id, session.userId);
    return NextResponse.json({ ok: true, ...deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete test";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
