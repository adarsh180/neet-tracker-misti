import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildCycleIntelligence } from "@/lib/cycle-intelligence";
import { getPrivateSession } from "@/lib/server-auth";

function unauthorized() {
  return NextResponse.json({ error: "Private session required" }, { status: 401 });
}

function parseDateInput(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00+05:30`);
}

async function savePredictionSnapshot(userId: string, intelligence: Awaited<ReturnType<typeof buildCycleIntelligence>>) {
  if (!intelligence.predictedStart || !intelligence.predictedWindowStart || !intelligence.predictedWindowEnd) return;

  await db.cyclePrediction.create({
    data: {
      userId,
      currentPhase: intelligence.currentPhase,
      dayOfCycle: intelligence.dayOfCycle,
      predictedStart: parseDateInput(intelligence.predictedStart)!,
      windowStart: parseDateInput(intelligence.predictedWindowStart)!,
      windowEnd: parseDateInput(intelligence.predictedWindowEnd)!,
      confidence: intelligence.confidence,
      confidenceLabel: intelligence.confidenceLabel,
      averageCycleLength: intelligence.averageCycleLength,
      cycleVariability: intelligence.cycleVariability,
      evidenceJson: intelligence.evidence,
    },
  });
}

export async function GET() {
  try {
    const session = await getPrivateSession();
    if (!session) return unauthorized();

    const intelligence = await buildCycleIntelligence(session.userId);
    return NextResponse.json(intelligence);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getPrivateSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const { startDate, endDate, flowLevel, symptoms, mood, notes } = body;
    const parsedStart = parseDateInput(startDate);

    if (!parsedStart || Number.isNaN(parsedStart.getTime())) {
      return NextResponse.json({ error: "Valid startDate is required" }, { status: 400 });
    }

    const entry = await db.cycleEntry.create({
      data: {
        userId: session.userId,
        startDate: parsedStart,
        endDate: parseDateInput(endDate),
        flowLevel,
        symptoms: symptoms || null,
        mood: mood || null,
        notes: notes || null,
      },
    });

    const intelligence = await buildCycleIntelligence(session.userId);
    await savePredictionSnapshot(session.userId, intelligence);
    return NextResponse.json({ entry, intelligence });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getPrivateSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const { id, ...data } = body;

    const updated = await db.cycleEntry.update({
      where: { id, userId: session.userId },
      data: {
        startDate: data.startDate ? parseDateInput(data.startDate) ?? undefined : undefined,
        endDate: data.endDate ? parseDateInput(data.endDate) : undefined,
        flowLevel: data.flowLevel,
        symptoms: data.symptoms,
        mood: data.mood,
        notes: data.notes,
      },
    });

    const intelligence = await buildCycleIntelligence(session.userId);
    await savePredictionSnapshot(session.userId, intelligence);
    return NextResponse.json({ entry: updated, intelligence });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getPrivateSession();
    if (!session) return unauthorized();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await db.cycleEntry.delete({
      where: { id, userId: session.userId },
    });

    const intelligence = await buildCycleIntelligence(session.userId);
    await savePredictionSnapshot(session.userId, intelligence);
    return NextResponse.json({ ok: true, intelligence });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
