import { NextResponse } from "next/server";

import {
  PLANNER_LAUNCH_DATE_IST,
  ensureDailyPlanner,
  findPlannerSession,
  getISTDateString,
  type DailyPlannerPayload,
} from "@/lib/daily-planner";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = getISTDateString();

  if (today < PLANNER_LAUNCH_DATE_IST) {
    return NextResponse.json({
      status: "scheduled",
      date: today,
      launchDate: PLANNER_LAUNCH_DATE_IST,
    });
  }

  try {
    const existing = await findPlannerSession(today);
    if (existing) {
      return NextResponse.json({
        status: "ready",
        date: today,
        launchDate: PLANNER_LAUNCH_DATE_IST,
        generatedNow: false,
        createdAt: existing.createdAt,
        model: existing.model,
        plan: existing.responseJson as unknown as DailyPlannerPayload,
        markdown: existing.responseMarkdown,
      });
    }

    // Self-healing path: if the 05:00 cron ever misses, opening the app builds
    // today's plan on the spot and still fires the once-per-day notification.
    const result = await ensureDailyPlanner({ notify: true });
    return NextResponse.json({
      status: "ready",
      date: result.date,
      launchDate: PLANNER_LAUNCH_DATE_IST,
      generatedNow: result.created,
      createdAt: result.createdAt,
      model: result.model,
      plan: result.payload,
      markdown: result.markdown,
    });
  } catch (err) {
    console.error("[daily-plan] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
