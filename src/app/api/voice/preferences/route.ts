import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { requirePrivateApiSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let preference = await db.voiceAssistantPreference.findUnique({ where: { userId: session.userId } });
  if (!preference) {
    try {
      preference = await db.voiceAssistantPreference.create({ data: { userId: session.userId, interactionMode: "WAKE" } });
    } catch {
      // Two mounted clients may initialize together; the winner's row is the canonical preference.
      preference = await db.voiceAssistantPreference.findUnique({ where: { userId: session.userId } });
    }
  }
  if (!preference) return NextResponse.json({ error: "Unable to initialize voice preferences" }, { status: 500 });
  return NextResponse.json(preference);
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const nickname = body.nickname === "Shona" ? "Shona" : "Bubu";
  const locale = typeof body.locale === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(body.locale) ? body.locale : "en-IN";
  const preferredVoice = typeof body.preferredVoice === "string" ? body.preferredVoice.slice(0, 180) : null;
  const interactionMode = body.interactionMode === "WAKE" ? "WAKE" : "TAP";
  const affectionMode = body.affectionMode === "DISCREET" ? "DISCREET" : "WARM";
  const onboardingVersion = Number.isFinite(Number(body.onboardingVersion))
    ? Math.max(0, Math.min(100, Math.round(Number(body.onboardingVersion))))
    : 0;
  const preference = await db.voiceAssistantPreference.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      nickname,
      locale,
      preferredVoice,
      speechEnabled: body.speechEnabled !== false,
      onboardingSeen: body.onboardingSeen === true,
      onboardingVersion,
      interactionMode,
      affectionMode,
      discreetMode: body.discreetMode === true,
    },
    update: {
      nickname,
      locale,
      preferredVoice,
      ...(typeof body.speechEnabled === "boolean" ? { speechEnabled: body.speechEnabled } : {}),
      ...(typeof body.onboardingSeen === "boolean" ? { onboardingSeen: body.onboardingSeen } : {}),
      ...(body.onboardingVersion !== undefined ? { onboardingVersion } : {}),
      ...(body.interactionMode !== undefined ? { interactionMode } : {}),
      ...(body.affectionMode !== undefined ? { affectionMode } : {}),
      ...(typeof body.discreetMode === "boolean" ? { discreetMode: body.discreetMode } : {}),
    },
  });
  return NextResponse.json(preference);
}
