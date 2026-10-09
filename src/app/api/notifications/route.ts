import { createHash } from "node:crypto";
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
    // Cleared on any device = gone everywhere; read state comes back too.
    where: { createdAt: { gte: notificationRetentionCutoff() }, clearedAt: null },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  // A fingerprint of what the panel shows: when the client already has it, answer with an empty 204.
  const tag = createHash("sha1").update(notifications.map((n) => `${n.id}:${n.readAt?.getTime() ?? 0}`).join("|")).digest("base64url").slice(0, 16);
  if (request.headers.get("x-notify-tag") === tag) return new NextResponse(null, { status: 204, headers: { "x-notify-tag": tag } });
  return NextResponse.json({ notifications }, { headers: { "x-notify-tag": tag } });
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

/** Read or clear messages for every device of this desk: { ids: string[], op: "read" | "clear" }. */
export async function PATCH(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => ({}));
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((x: unknown): x is string => typeof x === "string" && /^[a-z0-9]{8,40}$/i.test(x)).slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ ok: true, updated: 0 });
  const now = new Date();
  const data = payload.op === "clear" ? { clearedAt: now, readAt: now } : { readAt: now };
  const where = payload.op === "clear" ? { id: { in: ids }, clearedAt: null } : { id: { in: ids }, readAt: null };
  const r = await db.appNotification.updateMany({ where, data });
  return NextResponse.json({ ok: true, updated: r.count });
}
