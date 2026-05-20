import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { sendWebPushNotification } from "@/lib/web-push";

export const dynamic = "force-dynamic";

const TONES = new Set(["focus", "urgent", "care", "win"]);

function clean(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function authorized(request: NextRequest) {
  const secret = process.env.CROSS_APP_NOTIFY_SECRET;
  const header = request.headers.get("x-cross-app-secret");
  return Boolean(secret && header && header === secret);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const title = clean(payload.title).slice(0, 90);
  const body = clean(payload.body).slice(0, 420);
  const senderLabel = clean(payload.senderLabel, "Partner").slice(0, 42);
  const senderClientId = clean(payload.senderClientId).slice(0, 80) || null;
  const tone = TONES.has(clean(payload.tone)) ? clean(payload.tone) : "focus";

  if (!title || !body) {
    return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
  }

  const notification = await db.appNotification.create({
    data: {
      title,
      body,
      tone,
      senderLabel,
      senderClientId,
    },
  });

  const push = await sendWebPushNotification(notification, senderClientId);
  return NextResponse.json({ notification, push }, { status: 201 });
}
