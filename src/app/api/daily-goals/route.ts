import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "365");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const goals = await db.dailyGoal.findMany({
      where: { date: { gte: since } },
      include: { subject: { select: { id: true, name: true, slug: true, color: true } } },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(goals);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subjectId, date, hoursStudied, questionsSolved, notes } = body;

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    const existing = await db.dailyGoal.findUnique({
      where: { subjectId_date: { subjectId, date: dateObj } },
    });

    let result;
    if (hoursStudied === 0 && questionsSolved === 0 && !notes) {
      if (existing) {
        result = await db.dailyGoal.delete({ where: { id: existing.id } });
      } else {
        return NextResponse.json({ ignored: true });
      }
    } else if (existing) {
      result = await db.dailyGoal.update({
        where: { id: existing.id },
        data: {
          hoursStudied: hoursStudied ?? existing.hoursStudied,
          questionsSolved: questionsSolved ?? existing.questionsSolved,
          notes: notes ?? existing.notes,
        },
      });
    } else {
      result = await db.dailyGoal.create({
        data: {
          subjectId,
          date: dateObj,
          hoursStudied: hoursStudied ?? 0,
          questionsSolved: questionsSolved ?? 0,
          notes: notes ?? null,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
