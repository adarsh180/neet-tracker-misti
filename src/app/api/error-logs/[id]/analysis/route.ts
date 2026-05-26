import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { generateErrorLogReport } from "@/lib/error-log-analysis";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await ctx.params;
    const analysis = await generateErrorLogReport(id);
    return NextResponse.json(analysis, { status: 201 });
  } catch (err) {
    console.error("[error-log-test-analysis]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
