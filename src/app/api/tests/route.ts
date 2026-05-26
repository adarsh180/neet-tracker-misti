import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

function optionalFloat(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function optionalInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function optionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

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
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const {
      subjectId,
      testType,
      testName,
      score,
      maxScore,
      rank,
      totalStudents,
      institute,
      takenAt,
      notes,
      staminaDecay,
      correctCount,
      wrongCount,
      skippedCount,
      guessedCount,
      negativeMarksLost,
      physicsScore,
      chemistryScore,
      botanyScore,
      zoologyScore,
      physicsTimeMinutes,
      chemistryTimeMinutes,
      botanyTimeMinutes,
      zoologyTimeMinutes,
      difficultyLevel,
      reliabilityLevel,
      linkedErrorLogTestId,
    } = body;

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
        staminaDecay: optionalInt(staminaDecay),
        correctCount: optionalInt(correctCount),
        wrongCount: optionalInt(wrongCount),
        skippedCount: optionalInt(skippedCount),
        guessedCount: optionalInt(guessedCount),
        negativeMarksLost: optionalFloat(negativeMarksLost),
        physicsScore: optionalFloat(physicsScore),
        chemistryScore: optionalFloat(chemistryScore),
        botanyScore: optionalFloat(botanyScore),
        zoologyScore: optionalFloat(zoologyScore),
        physicsTimeMinutes: optionalInt(physicsTimeMinutes),
        chemistryTimeMinutes: optionalInt(chemistryTimeMinutes),
        botanyTimeMinutes: optionalInt(botanyTimeMinutes),
        zoologyTimeMinutes: optionalInt(zoologyTimeMinutes),
        difficultyLevel: optionalText(difficultyLevel),
        reliabilityLevel: optionalText(reliabilityLevel),
        linkedErrorLogTestId: optionalText(linkedErrorLogTestId),
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
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await req.json();
    await db.testRecord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
