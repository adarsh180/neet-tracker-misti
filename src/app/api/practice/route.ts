import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  PRACTICE_MAX_QUESTIONS,
  PRACTICE_MIN_QUESTIONS,
  PRACTICE_SUBJECTS,
  createPracticeTest,
  sanitizePracticeTest,
  type PracticeConfig,
  type PracticeMode,
  type PracticeSubjectSlug,
} from "@/lib/practice-engine";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODES = new Set<PracticeMode>(["FULL_LENGTH", "SUBJECT", "CHAPTER", "TOPIC", "PYQ_YEAR"]);
const DIFFICULTIES = new Set(["MIXED", "EASY", "MODERATE", "TOUGH"]);

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tests = await db.practiceTest.findMany({
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
  if ((mode === "SUBJECT" || mode === "CHAPTER" || mode === "TOPIC") && !subject) {
    return NextResponse.json({ error: "Subject is required for this mode" }, { status: 400 });
  }

  const chapter = typeof body.chapter === "string" && body.chapter.trim() ? body.chapter.trim().slice(0, 160) : null;
  if (mode === "CHAPTER" && !chapter) return NextResponse.json({ error: "Chapter is required" }, { status: 400 });

  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 160) : null;
  if (mode === "TOPIC" && !topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

  const pyqYear = typeof body.pyqYear === "string" && /^\d{4}$/.test(body.pyqYear) ? body.pyqYear : null;
  if (mode === "PYQ_YEAR" && !pyqYear) return NextResponse.json({ error: "PYQ year is required" }, { status: 400 });

  const questionCount = Number(body.questionCount);
  if (!Number.isFinite(questionCount) || questionCount < PRACTICE_MIN_QUESTIONS || questionCount > PRACTICE_MAX_QUESTIONS) {
    return NextResponse.json(
      { error: `Question count must be between ${PRACTICE_MIN_QUESTIONS} and ${PRACTICE_MAX_QUESTIONS}` },
      { status: 400 },
    );
  }

  const difficulty = DIFFICULTIES.has(body.difficulty) ? body.difficulty : "MIXED";

  const config: PracticeConfig = { mode, subject, chapter, topic, pyqYear, questionCount, difficulty };
  const test = await createPracticeTest(config);

  return NextResponse.json({ test: sanitizePracticeTest(test) }, { status: 201 });
}
