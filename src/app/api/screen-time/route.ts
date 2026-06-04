import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

const SCREEN_TIME_KEYS = [
  "instagram",
  "whatsapp",
  "youtube",
  "youtubeStudy",
  "facebook",
  "netflix",
  "hotstar",
  "mxPlayer",
  "google",
  "other",
] as const;

function clampHours(value: unknown) {
  return Math.max(0, Math.min(24, Number(value) || 0));
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

    const rows = await db.screenTimeLog.findMany({
      where: {
        userId: "misti",
        date: {
          gte: startDate,
          ...(endDate ? { lte: endDate } : {}),
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const dateObj = new Date(body.date);
    dateObj.setHours(0, 0, 0, 0);

    const hours = Object.fromEntries(SCREEN_TIME_KEYS.map((key) => [key, clampHours(body[key])])) as Record<
      (typeof SCREEN_TIME_KEYS)[number],
      number
    >;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    const result = await db.screenTimeLog.upsert({
      where: { userId_date: { userId: "misti", date: dateObj } },
      update: { ...hours, note },
      create: { userId: "misti", date: dateObj, ...hours, note },
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
