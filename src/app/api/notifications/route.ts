import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { notificationRetentionCutoff, pruneExpiredNotifications } from "@/lib/notification-retention";
import { getPrivateSession } from "@/lib/server-auth";
import { sendWebPushNotification } from "@/lib/web-push";

export const dynamic = "force-dynamic";

const TONES = new Set(["focus", "urgent", "care", "win"]);
const TARGETS = new Set(["local", "partner", "both"]);

function clean(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

async function forwardToPartner(input: {
  title: string;
  body: string;
  tone: string;
  senderLabel: string;
  senderClientId: string | null;
}) {
  const endpoint = process.env.PARTNER_NOTIFY_ENDPOINT;
  const secret = process.env.CROSS_APP_NOTIFY_SECRET;
  if (!endpoint || !secret) return { forwarded: false, reason: "missing-config" };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cross-app-secret": secret,
      },
      body: JSON.stringify(input),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);
    return {
      forwarded: response.ok,
      status: response.status,
      push: data?.push,
    };
  } catch {
    return { forwarded: false, reason: "network" };
  }
}

function defaultSender(userId: string) {
  return userId === "divyani" ? "Divyani" : "Misti";
}

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await pruneExpiredNotifications();

  const notifications = await db.appNotification.findMany({
    where: {
      createdAt: {
        gte: notificationRetentionCutoff(),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return NextResponse.json({ notifications });
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await pruneExpiredNotifications();

  const payload = await request.json().catch(() => ({}));
  const title = clean(payload.title).slice(0, 90);
  const body = clean(payload.body).slice(0, 420);
  const senderLabel = clean(payload.senderLabel, defaultSender(session.userId)).slice(0, 42);
  const senderClientId = clean(payload.senderClientId).slice(0, 80) || null;
  const tone = TONES.has(clean(payload.tone)) ? clean(payload.tone) : "focus";
  const target = TARGETS.has(clean(payload.target)) ? clean(payload.target) : "local";

  if (!title || !body) {
    return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
  }

  let notification = null;
  let push = null;

  if (target === "local" || target === "both") {
    notification = await db.appNotification.create({
      data: {
        title,
        body,
        tone,
        senderLabel,
        senderClientId,
      },
    });
    push = await sendWebPushNotification(notification, senderClientId);
  }

  const partner = target === "partner" || target === "both"
    ? await forwardToPartner({ title, body, tone, senderLabel, senderClientId })
    : { forwarded: false };

  if (target === "partner" && !partner.forwarded) {
    return NextResponse.json({ error: "Partner notification could not be delivered", partner }, { status: 502 });
  }

  return NextResponse.json({ notification, push, partner }, { status: 201 });
}
