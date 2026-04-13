import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const entries = await db.cycleEntry.findMany({
      orderBy: { startDate: "desc" },
    });
    return NextResponse.json(entries);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { startDate, endDate, flowLevel, symptoms, mood, notes } = body;

    const entry = await db.cycleEntry.create({
      data: {
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        flowLevel,
        symptoms: symptoms || null,
        mood: mood || null,
        notes: notes || null,
      },
    });

    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    const updated = await db.cycleEntry.update({
      where: { id },
      data: {
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        flowLevel: data.flowLevel,
        symptoms: data.symptoms,
        mood: data.mood,
        notes: data.notes,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
