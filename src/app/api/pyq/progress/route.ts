import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import jeeCatalog from "@/data/pyq/jee-catalog.json";

const SUPPORTED_EXAMS = new Set(["jee-main"]);
const SUPPORTED_YEARS = new Set(jeeCatalog.years.map((folder) => folder.year));
const MISTI_PROGRESS_OWNER = "misti";
const YEAR_PATTERN = /^\d{4}$/;

function normalizeExam(value: unknown) {
  const exam = String(value || "").trim().toLowerCase();
  return SUPPORTED_EXAMS.has(exam) ? exam : null;
}

export async function GET(req: NextRequest) {
  const session = await getPrivateSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exam = normalizeExam(req.nextUrl.searchParams.get("exam") || "jee-main");
  if (!exam) {
    return NextResponse.json({ error: "Unsupported exam" }, { status: 400 });
  }

  try {
    const progress = await db.pyqYearProgress.findMany({
      where: { userId: MISTI_PROGRESS_OWNER, exam },
      select: {
        year: true,
        completed: true,
        revisionCount: true,
        updatedAt: true,
      },
      orderBy: { year: "desc" },
    });

    return NextResponse.json(progress);
  } catch (error) {
    console.error("[PYQ Progress GET]", error);
    return NextResponse.json({ error: "Unable to load PYQ progress" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getPrivateSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      exam?: unknown;
      year?: unknown;
      completed?: unknown;
      revisionCount?: unknown;
    };
    const exam = normalizeExam(body.exam || "jee-main");
    const year = String(body.year || "").trim();

    if (!exam || !YEAR_PATTERN.test(year) || !SUPPORTED_YEARS.has(year)) {
      return NextResponse.json({ error: "Valid exam and year are required" }, { status: 400 });
    }

    if (typeof body.completed !== "boolean" || !Number.isInteger(body.revisionCount)) {
      return NextResponse.json({ error: "Completion and revision count are required" }, { status: 400 });
    }

    const revisionCount = Number(body.revisionCount);
    if (revisionCount < 0 || revisionCount > 99) {
      return NextResponse.json({ error: "Revision count must be between 0 and 99" }, { status: 400 });
    }

    const existing = await db.pyqYearProgress.findUnique({
      where: {
        userId_exam_year: {
          userId: MISTI_PROGRESS_OWNER,
          exam,
          year,
        },
      },
      select: { completedAt: true },
    });
    const completedAt = body.completed ? existing?.completedAt ?? new Date() : null;
    const progress = await db.pyqYearProgress.upsert({
      where: {
        userId_exam_year: {
          userId: MISTI_PROGRESS_OWNER,
          exam,
          year,
        },
      },
      create: {
        userId: MISTI_PROGRESS_OWNER,
        exam,
        year,
        completed: body.completed,
        revisionCount,
        completedAt,
      },
      update: {
        completed: body.completed,
        revisionCount,
        completedAt,
      },
      select: {
        year: true,
        completed: true,
        revisionCount: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(progress);
  } catch (error) {
    console.error("[PYQ Progress PATCH]", error);
    return NextResponse.json({ error: "Unable to save PYQ progress" }, { status: 500 });
  }
}
