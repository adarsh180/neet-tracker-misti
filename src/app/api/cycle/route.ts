import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { cycleWindowError } from "@/lib/cycle-validation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildCycleIntelligence } from "@/lib/cycle-intelligence";
import { maybeSendCyclePredictionNudge } from "@/lib/cycle-nudge";
import { getPrivateSession } from "@/lib/server-auth";
import { optionalRating } from "@/lib/optional-rating";

function unauthorized() {
  return NextResponse.json({ error: "Private session required" }, { status: 401 });
}

function parseDateInput(value?: string | null) {
  if (!value) return null;
  // Cycle dates are stored in a date-only (@db.Date) column, which Prisma reads
  // and writes in UTC. Anchor the picked calendar day to UTC midnight so the
  // stored date matches exactly what the user selected — using a +05:30 offset
  // here pushes the instant into the previous UTC day and the period reads back
  // as starting "yesterday".
  return new Date(`${value}T00:00:00.000Z`);
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

      const symptoms = Array.isArray(row.symptoms)
        ? row.symptoms.filter((symptom): symptom is string => typeof symptom === "string").map((symptom) => symptom.trim()).filter(Boolean)
        : typeof row.symptoms === "string"
          ? row.symptoms.split(",").map((symptom) => symptom.trim()).filter(Boolean)
          : [];

      const detail = {
        day: Math.round(day),
        date: cleanText(row.date, 24),
        flowLevel: cleanText(row.flowLevel, 24),
        pain: optionalRating(row.pain, 0, 10),
        energy: optionalRating(row.energy, 1, 10),
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

// A committed log must still receive its receipt if derived forecasting fails.
async function refreshAfterMutation(userId: string) {
  try {
    const intelligence = await buildCycleIntelligence(userId);
    await savePredictionSnapshot(userId, intelligence).catch(() => {});
    return { intelligence };
  } catch {
    return { intelligence: null, warning: "Calendar estimates could not refresh. Use Refresh calendar to try again." };
  }
}

export async function GET() {
  try {
    const session = await getPrivateSession();
    if (!session) return unauthorized();

    const intelligence = await buildCycleIntelligence(session.userId);
    await maybeSendCyclePredictionNudge(intelligence).catch(() => {});
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
    const invalid = cycleWindowError(startDate, endDate);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (!["LIGHT", "MODERATE", "HEAVY", "SPOTTING"].includes(flowLevel)) return NextResponse.json({ error: "Choose a valid flow level." }, { status: 400 });
    const operationId = body.operationId;
    if (operationId !== undefined && (typeof operationId !== "string" || !/^[a-f0-9-]{36}$/i.test(operationId))) return NextResponse.json({ error: "Invalid save identifier." }, { status: 400 });
    const values = {
      userId: session.userId,
      startDate: parseDateInput(startDate)!,
      endDate: parseDateInput(endDate),
      flowLevel,
      symptoms: cleanText(symptoms),
      mood: cleanText(mood, 32),
      notes: cleanText(notes, 4000),
      dayDetails: sanitizeDayDetails(dayDetails) ?? Prisma.JsonNull,
    };
    // Reusing the same draft's identifier cannot create a second period on retry.
    const id = operationId ? "cycle_" + createHash("sha256").update(session.userId + ":" + operationId).digest("hex").slice(0, 40) : undefined;
    const entry = id
      ? await db.cycleEntry.upsert({ where: { id }, create: { id, ...values }, update: {} })
      : await db.cycleEntry.create({ data: values });
    if (id && (entry.userId !== session.userId || entry.startDate.getTime() !== values.startDate.getTime()
      || (entry.endDate?.getTime() ?? null) !== (values.endDate?.getTime() ?? null)
      || entry.flowLevel !== values.flowLevel || entry.mood !== values.mood || entry.notes !== values.notes
      || entry.symptoms !== values.symptoms || !isDeepStrictEqual(entry.dayDetails, sanitizeDayDetails(dayDetails) ?? null))) {
      return NextResponse.json({ error: "This draft was already saved with different details. Refresh the calendar and edit that existing log." }, { status: 409 });
    }
    return NextResponse.json({ entry, ...await refreshAfterMutation(session.userId) });
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
    if (typeof id !== "string" || !id) return NextResponse.json({ error: "Choose a log to edit." }, { status: 400 });
    const existing = await db.cycleEntry.findFirst({ where: { id, userId: session.userId } });
    if (!existing) return NextResponse.json({ error: "This log was not found. Refresh the calendar." }, { status: 404 });
    const invalid = cycleWindowError(hasOwn(data, "startDate") ? data.startDate : existing.startDate.toISOString().slice(0, 10), hasOwn(data, "endDate") ? data.endDate : existing.endDate?.toISOString().slice(0, 10));
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (hasOwn(data, "flowLevel") && !["LIGHT", "MODERATE", "HEAVY", "SPOTTING"].includes(data.flowLevel)) return NextResponse.json({ error: "Choose a valid flow level." }, { status: 400 });

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

    return NextResponse.json({ entry: updated, ...await refreshAfterMutation(session.userId) });
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

    await db.cycleEntry.deleteMany({
      where: { id, userId: session.userId },
    });

    return NextResponse.json({ ok: true, deletedId: id, ...await refreshAfterMutation(session.userId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
