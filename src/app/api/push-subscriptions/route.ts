import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

function clean(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    publicKey: getVapidPublicKey(),
    configured: isWebPushConfigured(),
  });
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const subscription = payload.subscription;
  const endpoint = clean(subscription?.endpoint).slice(0, 768);
  const p256dh = clean(subscription?.keys?.p256dh).slice(0, 255);
  const auth = clean(subscription?.keys?.auth).slice(0, 255);
  const senderClientId = clean(payload.senderClientId).slice(0, 80) || null;
  const userAgent = clean(request.headers.get("user-agent")).slice(0, 320) || null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const saved = await db.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth, senderClientId, userAgent },
    create: { endpoint, p256dh, auth, senderClientId, userAgent },
  });

  return NextResponse.json({ subscription: saved });
}

export async function DELETE(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const endpoint = clean(payload.endpoint).slice(0, 768);
  if (!endpoint) return NextResponse.json({ ok: true });

  await db.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
