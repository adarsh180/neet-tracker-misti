import { NextResponse } from "next/server";

import { createPracticeReattempt, sanitizePracticeTest } from "@/lib/practice-engine";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const test = await createPracticeReattempt(id, session.userId);
    return NextResponse.json({ test: sanitizePracticeTest(test) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create re-attempt";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}
