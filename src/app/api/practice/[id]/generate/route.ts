import { NextRequest, NextResponse } from "next/server";

import { generateNextBatch } from "@/lib/practice-engine";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One call = one verified batch (~10 questions: generation pass + blind
// verification pass). The client loops this endpoint until status is READY,
// showing live progress — so even a 180-question paper builds reliably
// without any single request running long.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await db.practiceTest.findFirst({ where: { id, userId: session.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const progress = await generateNextBatch(id, { allowRuntimeTopUp: false });
    return NextResponse.json(progress);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : 500;
    if (status === 500) console.error("[practice/:id/generate] failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
