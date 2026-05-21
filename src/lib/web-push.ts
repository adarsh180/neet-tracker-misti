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
const OFFLINE_DELIVERY_TTL_SECONDS = 7 * 24 * 60 * 60;
const TRANSIENT_RETRY_DELAYS_MS = [750, 2000];

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

function shouldRetryPush(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
  return !statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        };
        const payload = JSON.stringify({
          title: `${notification.senderLabel}: ${notification.title}`,
          body: notification.body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: notification.id,
          urgent: true,
          requireInteraction: true,
          renotify: true,
          vibrate: [160, 70, 160, 70, 240],
          data: {
            id: notification.id,
            url: "/dashboard",
            tone: notification.tone,
            createdAt: notification.createdAt,
            urgent: true,
          },
        });
        const options: webpush.RequestOptions = {
          TTL: OFFLINE_DELIVERY_TTL_SECONDS,
          urgency: "high",
        };

        for (let attempt = 0; ; attempt += 1) {
          try {
            await webpush.sendNotification(pushSubscription, payload, options);
            break;
          } catch (error) {
            const retryDelay = TRANSIENT_RETRY_DELAYS_MS[attempt];
            if (retryDelay === undefined || !shouldRetryPush(error)) throw error;
            await delay(retryDelay);
          }
        }
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
