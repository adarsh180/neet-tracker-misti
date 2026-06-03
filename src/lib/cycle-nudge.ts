import { format, parseISO } from "date-fns";

import { db } from "@/lib/db";
import type { CycleIntelligence } from "@/lib/cycle-intelligence";
import { sendWebPushNotification } from "@/lib/web-push";

// Label used to identify cycle-companion notifications so we never duplicate the
// pre-period nudge within a single window. Kept distinct from any human sender.
const NUDGE_SENDER_LABEL = "Cycle Companion";
// Minimum gap between two cycle nudges. Predicted periods are ~28 days apart, so a
// 12-day cool-off guarantees at most one nudge per window even if the page is
// opened many times.
const NUDGE_COOLDOWN_DAYS = 12;
// Fire when the predicted start is this many days away (or fewer), down to today.
const NUDGE_LEAD_DAYS = 2;

function humanDate(value: string) {
  try {
    return format(parseISO(`${value}T12:00:00`), "d MMM");
  } catch {
    return value;
  }
}

/**
 * Sends a gentle "period likely soon" push when the prediction is within the lead
 * window, reusing the existing notification + web-push pipeline unchanged.
 *
 * Designed to be completely non-disruptive:
 *  - never throws (callers await it but failures are swallowed),
 *  - deduplicates via existing columns, so no schema/db change is required,
 *  - is a no-op unless there is a confident-enough, near-term prediction.
 */
export async function maybeSendCyclePredictionNudge(intelligence: CycleIntelligence) {
  try {
    const { predictedStart, daysUntilPredictedStart, status, confidence } = intelligence;

    // Only nudge when there is a real, near-term prediction the model believes in.
    if (!predictedStart || status === "needs_more_data" || confidence < 35) return;
    if (daysUntilPredictedStart === null) return;
    if (daysUntilPredictedStart < 0 || daysUntilPredictedStart > NUDGE_LEAD_DAYS) return;

    const cooldownStart = new Date(Date.now() - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const recentNudge = await db.appNotification.findFirst({
      where: {
        senderLabel: NUDGE_SENDER_LABEL,
        createdAt: { gte: cooldownStart },
      },
      select: { id: true },
    });
    if (recentNudge) return;

    const when =
      daysUntilPredictedStart === 0
        ? "around today"
        : daysUntilPredictedStart === 1
          ? "around tomorrow"
          : `in about ${daysUntilPredictedStart} days`;

    const notification = await db.appNotification.create({
      data: {
        title: "Period likely soon",
        body: `Her next period is predicted ${when} (around ${humanDate(predictedStart)}). A good moment to plan lighter study, rest, and anything she likes to have ready.`,
        tone: "care",
        senderLabel: NUDGE_SENDER_LABEL,
        senderClientId: null,
      },
    });

    // Reuse the existing fan-out (no-op when web push is not configured).
    await sendWebPushNotification(notification, null);
  } catch (error) {
    // A nudge must never break the cycle API response.
    console.error("[cycle-nudge] Failed to evaluate/send prediction nudge:", error);
  }
}
