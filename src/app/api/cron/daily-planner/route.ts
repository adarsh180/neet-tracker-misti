import { NextRequest, NextResponse } from "next/server";

import {
  PLANNER_LAUNCH_DATE_IST,
  ensureDailyPlanner,
  getISTDateString,
} from "@/lib/daily-planner";
import { ensurePeriodicReviews } from "@/lib/review-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The agent heartbeat. Vercel Cron hits this at 23:30 UTC = 05:00 IST with
// `Authorization: Bearer <CRON_SECRET>`. One beat drives:
//  - the daily planner push (from PLANNER_LAUNCH_DATE_IST onward),
//  - the weekly review card (first beat after a Mon–Sun week completes),
//  - the monthly review card (first beat of a new month).
function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = getISTDateString();
  // ?quiet=1 suppresses notifications, ?force=1 rebuilds today's plan — both
  // secret-protected, for testing/admin only.
  const quiet = req.nextUrl.searchParams.get("quiet") === "1";
  const force = req.nextUrl.searchParams.get("force") === "1";

  let planner: Record<string, unknown>;
  if (today < PLANNER_LAUNCH_DATE_IST) {
    planner = { skipped: "before-launch", launchDate: PLANNER_LAUNCH_DATE_IST };
  } else {
    try {
      const result = await ensureDailyPlanner({ notify: !quiet, force });
      planner = {
        created: result.created,
        model: result.model,
        tasksCreated: result.tasksCreated,
        notification: result.notification,
      };
    } catch (err) {
      console.error("[cron/daily-planner] planner failed:", err);
      planner = { error: String(err) };
    }
  }

  // Reviews are independent of the planner launch gate and never throw.
  const reviews = await ensurePeriodicReviews({ notify: !quiet });

  return NextResponse.json({ ok: true, today, planner, reviews });
}
