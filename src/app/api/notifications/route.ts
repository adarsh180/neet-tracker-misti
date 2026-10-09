import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { notificationRetentionCutoff, pruneExpiredNotifications } from "@/lib/notification-retention";
import { forwardToPartner, partnerProblem, pingPartner } from "@/lib/partner-notify";
import { getPrivateSession } from "@/lib/server-auth";
import { sendWebPushNotification } from "@/lib/web-push";

export const dynamic = "force-dynamic";

const TONES = new Set(["focus", "urgent", "care", "win"]);
const TARGETS = new Set(["local", "partner", "both"]);

function clean(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function defaultSender(userId: string) {
  return userId === "divyani" ? "Divyani" : "Misti";
}

/** The last week of messages; `?partner=1` checks the link to the other site instead. */
export async function GET(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (request.nextUrl.searchParams.get("partner") === "1") {
    const r = await pingPartner();
    return NextResponse.json({ linked: r.forwarded, problem: partnerProblem(r) });
  }

  await pruneExpiredNotifications();
  const notifications = await db.appNotification.findMany({
    where: { createdAt: { gte: notificationRetentionCutoff() } },
    orderBy: { createdAt: "desc" },
    take: 60,
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

  // Partner first: if it cannot be delivered, say exactly why and save nothing.
  const partner = target === "partner" || target === "both" ? await forwardToPartner({ title, body, tone, senderLabel, senderClientId }) : null;
  if (partner && !partner.forwarded) {
    return NextResponse.json({ error: `Not delivered. ${partnerProblem(partner)}`, partner }, { status: 502 });
  }

  // Keep a copy here too, so the sender sees what went out (it never alerts the sender's own device).
  const notification = await db.appNotification.create({ data: { title, body, tone, senderLabel, senderClientId } });
  const push = target === "partner" ? null : await sendWebPushNotification(notification, senderClientId);

  return NextResponse.json({ notification, push, partner, delivered: target === "local" ? null : true }, { status: 201 });
}
