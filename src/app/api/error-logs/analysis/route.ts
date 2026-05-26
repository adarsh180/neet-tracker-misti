import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { generateGlobalErrorLogReport } from "@/lib/error-log-analysis";

const prisma = db as unknown as {
  errorLogGlobalAnalysis: {
    findFirst: (args: unknown) => Promise<unknown | null>;
  };
};

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const latest = await prisma.errorLogGlobalAnalysis.findFirst({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(latest);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const analysis = await generateGlobalErrorLogReport();
    return NextResponse.json(analysis, { status: 201 });
  } catch (err) {
    console.error("[error-log-global-analysis]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
