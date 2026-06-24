import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { buildCycleIntelligence } from "@/lib/cycle-intelligence";
import { maybeSendCyclePredictionNudge } from "@/lib/cycle-nudge";
import { constantTimeEquals } from "@/lib/secure-compare";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
// We require it in production so the endpoint cannot be triggered by outsiders.
// If the secret is not configured at all, we still allow the call (so the cron
// keeps working before the env var is added) but the nudge itself is deduped and
// only ever fires inside the prediction window — so the blast radius is nil.
function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return constantTimeEquals(req.headers.get("authorization"), `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Evaluate every user who actually logs cycles (today just "misti", but this
    // stays correct if "divyani" ever starts logging too).
    const owners = await db.cycleEntry.findMany({
      distinct: ["userId"],
      select: { userId: true },
    });

    let processed = 0;
    for (const { userId } of owners) {
      const intelligence = await buildCycleIntelligence(userId);
      await maybeSendCyclePredictionNudge(intelligence);
      processed += 1;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
