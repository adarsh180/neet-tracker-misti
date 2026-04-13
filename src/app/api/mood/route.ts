import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// IST offset = UTC+5:30 = 330 minutes
function getISTMidnight(dateStr?: string): Date {
  if (dateStr) {
    // Parse the date as IST midnight
    const [y, m, d] = dateStr.split("-").map(Number);
    // Create IST midnight = UTC midnight - 5h30m offset
    return new Date(Date.UTC(y, m - 1, d) - (5 * 60 + 30) * 60000);
  }
  // Today in IST
  const now = new Date();
  const istOffset = 5 * 60 + 30; // minutes
  const istMs = now.getTime() + istOffset * 60000;
  const ist = new Date(istMs);
  // Midnight UTC that corresponds to IST date
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - istOffset * 60000);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const entries = await db.moodEntry.findMany({
      where: { date: { gte: since } },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(entries);
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, mood, energy, focus, stress, note } = body;

    // Convert date string (yyyy-MM-dd in IST) to IST midnight timestamp
    const dateObj = getISTMidnight(date);

    const existing = await db.moodEntry.findFirst({
      where: {
        date: {
          gte: dateObj,
          lt: new Date(dateObj.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });

    let result;
    if (existing) {
      result = await db.moodEntry.update({
        where: { id: existing.id },
        data: {
          mood,
          energy: energy ?? 5,
          focus: focus ?? 5,
          stress: stress ?? 5,
          note: note || null,
        },
      });
    } else {
      result = await db.moodEntry.create({
        data: {
          date: dateObj,
          mood,
          energy: energy ?? 5,
          focus: focus ?? 5,
          stress: stress ?? 5,
          note: note || null,
        },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Mood API]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
