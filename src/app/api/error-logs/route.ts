import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const prisma = db as unknown as {
  errorLogTest: {
    findMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
};

const TEST_TYPES = new Set(["AITS", "SECTIONAL", "UNIT", "FLT", "PYQ", "REAL_ATTEMPT"]);

export async function GET() {
  try {
    const logs = await prisma.errorLogTest.findMany({
      include: {
        questions: {
          select: {
            id: true,
            questionNumber: true,
            questionSummary: true,
            subject: true,
            chapter: true,
            topic: true,
            attemptStatus: true,
            outcome: true,
            contentStatus: true,
            outOfSyllabus: true,
            notStudied: true,
            difficulty: true,
            confidence: true,
            timeSpentSeconds: true,
            reasonTags: true,
            actionFix: true,
          },
          orderBy: { questionNumber: "asc" },
        },
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { takenAt: "desc" },
    });

    return NextResponse.json(logs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const testName = String(body.testName || "").trim();
    const testType = String(body.testType || "").trim();
    const questionCount = Number(body.questionCount);

    if (!testName) return NextResponse.json({ error: "Test name is required" }, { status: 400 });
    if (!TEST_TYPES.has(testType)) return NextResponse.json({ error: "Valid test type is required" }, { status: 400 });
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 300) {
      return NextResponse.json({ error: "Question count must be between 1 and 300" }, { status: 400 });
    }

    const log = await prisma.errorLogTest.create({
      data: {
        testName,
        testType,
        questionCount,
        takenAt: body.takenAt ? new Date(body.takenAt) : new Date(),
        notes: body.notes ? String(body.notes) : null,
        questions: {
          create: Array.from({ length: questionCount }, (_, index) => ({
            questionNumber: index + 1,
            subject: "Physics",
            attemptStatus: "SKIPPED",
            outcome: "UNMARKED",
            contentStatus: "HAD_CONTENT",
          })),
        },
      },
      include: {
        questions: { orderBy: { questionNumber: "asc" } },
        analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
