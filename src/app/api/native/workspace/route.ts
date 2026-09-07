import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { getPrivateSession } from "@/lib/server-auth";
import { db } from "@/lib/db";
import { day, NativeInputError, parseNativeWrite } from "@/lib/native-input";
import { saveNative } from "@/lib/native-save";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  return error instanceof NativeInputError ? json({ error: error.message }, error.status) : json({ error: "Could not confirm this request. Your draft can be retried safely." }, 503);
}
export async function GET(req: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  try {
    const session = await getPrivateSession();
    if (!session) return json({ error: "Sign in again." }, 401);
    const date = day(req.nextUrl.searchParams.get("date"));
    const result = await db.$transaction(async tx => ({ date,
      entries: await tx.dailyGoal.findMany({ where: { date: new Date(date) } }),
      screen: await tx.screenTimeLog.findUnique({ where: { userId_date: { userId: session.userId, date: new Date(date) } } }),
    }), { isolationLevel: "RepeatableRead" });
    return json(result);
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  try {
    const session = await getPrivateSession();
    if (!session) return json({ error: "Sign in again." }, 401);
    const raw = await req.text();
    if (raw.length > 100000) return json({ error: "Request too large." }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
    return json(await saveNative(db, session.userId, parseNativeWrite(body)));
  } catch (error) { return failure(error); }
}
