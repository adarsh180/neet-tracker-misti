import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value: unknown, max = 360) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function hasOwn(data: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function sanitizeDayDetails(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const details = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const day = Number(row.day);
      if (!Number.isFinite(day) || day < 1 || day > 12) return null;

      const pain = Number(row.pain);
      const energy = Number(row.energy);
      const symptoms = Array.isArray(row.symptoms)
        ? row.symptoms.filter((symptom): symptom is string => typeof symptom === "string").map((symptom) => symptom.trim()).filter(Boolean)
        : typeof row.symptoms === "string"
          ? row.symptoms.split(",").map((symptom) => symptom.trim()).filter(Boolean)
          : [];

      const detail = {
        day: Math.round(day),
        date: cleanText(row.date, 24),
        flowLevel: cleanText(row.flowLevel, 24),
        pain: Number.isFinite(pain) ? clamp(Math.round(pain), 0, 10) : null,
        energy: Number.isFinite(energy) ? clamp(Math.round(energy), 1, 10) : null,
        mood: cleanText(row.mood, 32),
        symptoms: [...new Set(symptoms)].slice(0, 10),
        notes: cleanText(row.notes),
      };

      const hasSignal = detail.flowLevel || detail.pain !== null || detail.energy !== null || detail.mood || detail.symptoms.length || detail.notes;
      return hasSignal ? detail : null;
    })
    .filter((detail): detail is {
      day: number;
      date: string | null;
      flowLevel: string | null;
      pain: number | null;
      energy: number | null;
      mood: string | null;
      symptoms: string[];
      notes: string | null;
    } => Boolean(detail))
    .slice(0, 12);

  return details.length ? details : undefined;
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
    const { startDate, endDate, flowLevel, symptoms, mood, notes, dayDetails } = body;
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
        dayDetails: sanitizeDayDetails(dayDetails),
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
        startDate: hasOwn(data, "startDate") ? parseDateInput(data.startDate as string | null) ?? undefined : undefined,
        endDate: hasOwn(data, "endDate") ? parseDateInput(data.endDate as string | null) : undefined,
        flowLevel: hasOwn(data, "flowLevel") ? data.flowLevel as string : undefined,
        symptoms: hasOwn(data, "symptoms") ? data.symptoms as string | null : undefined,
        mood: hasOwn(data, "mood") ? data.mood as string | null : undefined,
        notes: hasOwn(data, "notes") ? data.notes as string | null : undefined,
        dayDetails: hasOwn(data, "dayDetails") ? sanitizeDayDetails(data.dayDetails) ?? Prisma.JsonNull : undefined,
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
