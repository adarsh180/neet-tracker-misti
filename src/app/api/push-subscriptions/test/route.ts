import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { sendWebPushToSubscription } from "@/lib/web-push";

export const dynamic = "force-dynamic";

function clean(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const endpoint = clean(payload.endpoint).slice(0, 768);
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  const subscription = await db.pushSubscription.findUnique({ where: { endpoint } });
  if (!subscription) return NextResponse.json({ error: "Push subscription not found" }, { status: 404 });

  try {
    const push = await sendWebPushToSubscription(subscription, {
      id: `push-test-${Date.now()}`,
      title: "Device push test",
      body: "This came through the server push channel. If it appears while the app is closed, background push is working.",
      tone: "win",
      senderLabel: "NEET Desk",
      createdAt: new Date(),
    });

    return NextResponse.json({ push });
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode === 404 || statusCode === 410) {
      await db.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
    }

    return NextResponse.json({ error: "Server push test failed", statusCode }, { status: 502 });
  }
}
