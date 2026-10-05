import { NextResponse } from "next/server";

import { requirePrivateApiSession } from "@/lib/api-auth";
import { getPulseInsights } from "@/lib/pulse-insights";
import { isPrismaConnectionError } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getPulseInsights(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[insights/pulse]", error);
    const status = isPrismaConnectionError(error) ? 503 : 500;
    return NextResponse.json({ error: "Insights are unavailable right now." }, { status });
  }
}
