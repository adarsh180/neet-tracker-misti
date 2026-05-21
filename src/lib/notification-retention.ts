import { db } from "@/lib/db";

export const NOTIFICATION_RETENTION_HOURS = 24;

export function notificationRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - NOTIFICATION_RETENTION_HOURS * 60 * 60 * 1000);
}

export async function pruneExpiredNotifications() {
  await db.appNotification.deleteMany({
    where: {
      createdAt: {
        lt: notificationRetentionCutoff(),
      },
    },
  });
}
