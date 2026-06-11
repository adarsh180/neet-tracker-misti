import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { ensurePeriodicReviews, sanitizeReviewCard } from "@/lib/review-agent";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Self-healing: opening the reviews page guarantees the latest completed
    // week/month have cards (and fires the once-per-card notification) even if
    // the cron heartbeat missed.
    await ensurePeriodicReviews({ notify: true });

    const cards = await db.reviewCard.findMany({
      orderBy: { periodStart: "desc" },
      take: 60,
    });

    return NextResponse.json({ cards: cards.map(sanitizeReviewCard) });
  } catch (err) {
    console.error("[reviews] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
