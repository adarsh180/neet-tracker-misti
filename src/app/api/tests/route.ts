import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const tests = await db.testRecord.findMany({
      include: { subject: { select: { id: true, name: true, slug: true, color: true } } },
      orderBy: { takenAt: "asc" },
    });
    return NextResponse.json(tests);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subjectId, testType, testName, score, maxScore, rank, totalStudents, institute, takenAt, notes } = body;

    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100 * 10) / 10 : 0;

    const test = await db.testRecord.create({
      data: {
        subjectId: subjectId || null,
        testType,
        testName,
        score: parseFloat(score),
        maxScore: parseFloat(maxScore),
        percentage,
        rank: rank ? parseInt(rank) : null,
        totalStudents: totalStudents ? parseInt(totalStudents) : null,
        institute: institute || null,
        takenAt: new Date(takenAt),
        notes: notes || null,
      },
    });

    return NextResponse.json(test);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    await db.testRecord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
