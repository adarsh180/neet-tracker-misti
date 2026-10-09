import { db } from "@/lib/db";

/** Messages stay a week, so one sent while the other was away is still there when they come back. */
export const NOTIFICATION_RETENTION_HOURS = 24 * 7;
/** Cycle nudges stay 14 days: their 12-day cooldown is measured against them. */
const CYCLE_RETENTION_HOURS = 24 * 14;

export function notificationRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_HOURS * 60 * 60 * 1000);
}

export async function pruneExpiredNotifications() {
  const now = new Date();
  await db.appNotification.deleteMany({
    where: {
      OR: [
        { createdAt: { lt: notificationRetentionCutoff(now) }, NOT: { senderLabel: "Cycle Companion" } },
        { createdAt: { lt: new Date(now.getTime() - CYCLE_RETENTION_HOURS * 3600_000) } },
      ],
    },
  });
}
