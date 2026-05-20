import webpush from "web-push";

import { db } from "@/lib/db";

type PushNotificationPayload = {
  id: string;
  title: string;
  body: string;
  tone: string;
  senderLabel: string;
  createdAt: Date | string;
};

let configured = false;

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}

export function isWebPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function configureWebPush() {
  if (configured || !isWebPushConfigured()) return;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export async function sendWebPushNotification(
  notification: PushNotificationPayload,
  excludeClientId?: string | null,
) {
  configureWebPush();
  if (!isWebPushConfigured()) return { sent: 0, failed: 0 };

  const subscriptions = await db.pushSubscription.findMany({
    where: excludeClientId ? { senderClientId: { not: excludeClientId } } : undefined,
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: `${notification.senderLabel}: ${notification.title}`,
            body: notification.body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: notification.id,
            data: {
              id: notification.id,
              url: "/dashboard",
              tone: notification.tone,
              createdAt: notification.createdAt,
            },
          }),
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { endpoint: subscription.endpoint } }).catch(() => {});
        }
      }
    }),
  );

  return { sent, failed };
}
