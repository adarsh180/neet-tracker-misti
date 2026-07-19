import { NextResponse } from "next/server";

import { generatePracticePerformanceAnalysis } from "@/lib/practice-performance-analysis";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const analysis = await generatePracticePerformanceAnalysis(id, session.userId);
    return NextResponse.json({ analysis }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not analyse this test";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
