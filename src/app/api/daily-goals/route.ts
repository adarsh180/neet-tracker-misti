import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

type DailyGoalPayload = {
  id?: string;
  subjectId?: string;
  date?: string;
  hoursStudied?: number;
  questionsSolved?: number;
  disciplineScore?: number;
  completionPercent?: number;
  notes?: string | null;
};

async function persistDailyGoalEntry(entry: DailyGoalPayload) {
  const { subjectId, date, hoursStudied, questionsSolved, disciplineScore, completionPercent, notes } = entry;

  if (!subjectId || !date) {
    throw new Error("subjectId and date are required");
  }

  const dateObj = new Date(date);
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error("Invalid date");
  }
  dateObj.setHours(0, 0, 0, 0);

  const existing = await db.dailyGoal.findUnique({
    where: { subjectId_date: { subjectId, date: dateObj } },
  });

  if (
    hoursStudied === 0 &&
    questionsSolved === 0 &&
    (disciplineScore ?? 0) === 0 &&
    (completionPercent ?? 0) === 0 &&
    !notes
  ) {
    if (existing) {
      return db.dailyGoal.delete({ where: { id: existing.id } });
    }
    return { ignored: true };
  }

  if (existing) {
    return db.dailyGoal.update({
      where: { id: existing.id },
      data: {
        hoursStudied: hoursStudied ?? existing.hoursStudied,
        questionsSolved: questionsSolved ?? existing.questionsSolved,
        disciplineScore: disciplineScore ?? existing.disciplineScore,
        completionPercent: completionPercent ?? existing.completionPercent,
        notes: notes ?? existing.notes,
      },
    });
  }

  return db.dailyGoal.create({
    data: {
      subjectId,
      date: dateObj,
      hoursStudied: hoursStudied ?? 0,
      questionsSolved: questionsSolved ?? 0,
      disciplineScore: disciplineScore ?? 0,
      completionPercent: completionPercent ?? 0,
      notes: notes ?? null,
    },
  });
}

export async function GET(req: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const days = parseInt(searchParams.get("days") || "365");

    const startDate = start ? new Date(start) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end) : null;
    startDate.setHours(0, 0, 0, 0);
    endDate?.setHours(23, 59, 59, 999);

    const goals = await db.dailyGoal.findMany({
      where: {
        date: {
          gte: startDate,
          ...(endDate ? { lte: endDate } : {}),
        },
      },
      include: { subject: { select: { id: true, name: true, slug: true, color: true } } },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(goals);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();

    if (Array.isArray(body.entries)) {
      const results = [];

      for (const entry of body.entries as DailyGoalPayload[]) {
        try {
          const result = await persistDailyGoalEntry(entry);
          results.push({ id: entry.id, ok: true, result });
        } catch (error) {
          results.push({ id: entry.id, ok: false, error: String(error) });
        }
      }

      const hasFailures = results.some((result) => !result.ok);
      return NextResponse.json({ results }, { status: hasFailures ? 207 : 200 });
    }

    const result = await persistDailyGoalEntry(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
