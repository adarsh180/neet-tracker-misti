import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  NEET_FULL_TEST_DURATION_MINUTES,
  NEET_FULL_TEST_QUESTIONS,
  NEET_MAX_PRACTICE_DURATION_MINUTES,
} from "@/lib/neet-exam-policy";
import {
  PRACTICE_MAX_QUESTIONS,
  PRACTICE_MIN_QUESTIONS,
  PRACTICE_SUBJECTS,
  InsufficientStrictStockError,
  createPracticeTest,
  normalizeAiFreshPercent,
  sanitizePracticeTest,
  type PracticeConfig,
  type PracticeMode,
  type PracticeSubjectSlug,
} from "@/lib/practice-engine";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODES = new Set<PracticeMode>(["FULL_LENGTH", "SECTIONAL", "UNIT", "SUBJECT", "CHAPTER", "TOPIC", "PYQ_YEAR"]);
const DIFFICULTIES = new Set(["MIXED", "EASY", "MODERATE", "TOUGH"]);

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tests = await db.practiceTest.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ tests: tests.map((test) => sanitizePracticeTest(test, false)) });
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  const mode = MODES.has(body.mode) ? (body.mode as PracticeMode) : null;
  if (!mode) return NextResponse.json({ error: "Valid mode is required" }, { status: 400 });

  const subject = PRACTICE_SUBJECTS.includes(body.subject) ? (body.subject as PracticeSubjectSlug) : null;
  const subjects = Array.isArray(body.subjects)
    ? body.subjects.filter((entry: unknown): entry is PracticeSubjectSlug => PRACTICE_SUBJECTS.includes(entry as PracticeSubjectSlug))
    : subject
      ? [subject]
      : [];
  if ((mode === "SUBJECT" || mode === "CHAPTER" || mode === "TOPIC") && !subject) {
    return NextResponse.json({ error: "Subject is required for this mode" }, { status: 400 });
  }
  if ((mode === "UNIT" || mode === "SECTIONAL") && subjects.length === 0) {
    return NextResponse.json({ error: "At least one subject is required for this mode" }, { status: 400 });
  }

  const chapter = typeof body.chapter === "string" && body.chapter.trim() ? body.chapter.trim().slice(0, 160) : null;
  const chapters = Array.isArray(body.chapters)
    ? body.chapters.map((entry: unknown) => String(entry ?? "").trim()).filter(Boolean).slice(0, 100)
    : chapter
      ? [chapter]
      : [];
  if (mode === "CHAPTER" && chapters.length === 0) return NextResponse.json({ error: "Chapter is required" }, { status: 400 });
  if (mode === "UNIT" && chapters.length === 0) return NextResponse.json({ error: "Select at least one chapter for a unit test" }, { status: 400 });

  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 160) : null;
  if (mode === "TOPIC" && !topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

  const pyqYear = typeof body.pyqYear === "string" && /^\d{4}$/.test(body.pyqYear) ? body.pyqYear : null;
  if (mode === "PYQ_YEAR" && !pyqYear) return NextResponse.json({ error: "PYQ year is required" }, { status: 400 });

  const questionCount = mode === "FULL_LENGTH" || mode === "PYQ_YEAR" ? NEET_FULL_TEST_QUESTIONS : Number(body.questionCount);
  if (!Number.isFinite(questionCount) || questionCount < PRACTICE_MIN_QUESTIONS || questionCount > PRACTICE_MAX_QUESTIONS) {
    return NextResponse.json(
      { error: `Question count must be between ${PRACTICE_MIN_QUESTIONS} and ${PRACTICE_MAX_QUESTIONS}` },
      { status: 400 },
    );
  }

  const difficulty = DIFFICULTIES.has(body.difficulty) ? body.difficulty : "MIXED";
  const aiFreshPercent = normalizeAiFreshPercent(body.aiFreshPercent);
  const classLevel = body.classLevel === "11" || body.classLevel === "12" ? body.classLevel : null;
  if ((mode === "UNIT" || mode === "SECTIONAL") && !classLevel) {
    return NextResponse.json({ error: "Class level is required for this mode" }, { status: 400 });
  }
  const durationMinutes = mode === "FULL_LENGTH" || mode === "PYQ_YEAR"
    ? NEET_FULL_TEST_DURATION_MINUTES
    : Number.isFinite(Number(body.durationMinutes))
      ? Math.max(1, Math.min(NEET_MAX_PRACTICE_DURATION_MINUTES, Math.round(Number(body.durationMinutes))))
      : undefined;

  const config: PracticeConfig = {
    mode,
    subject,
    subjects,
    classLevel,
    chapter,
    chapters,
    topic,
    pyqYear,
    questionCount,
    aiFreshPercent,
    durationMinutes,
    difficulty,
  };
  try {
    const test = await createPracticeTest(config, session.userId);
    return NextResponse.json({ test: sanitizePracticeTest(test) }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStrictStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 409 },
      );
    }
    console.error("[practice] create failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create test" }, { status: 500 });
  }
}
