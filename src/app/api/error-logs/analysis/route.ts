import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateGlobalErrorLogReport } from "@/lib/error-log-analysis";

const prisma = db as unknown as {
  errorLogGlobalAnalysis: {
    findFirst: (args: unknown) => Promise<unknown | null>;
  };
};

export async function GET() {
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
  try {
    const analysis = await generateGlobalErrorLogReport();
    return NextResponse.json(analysis, { status: 201 });
  } catch (err) {
    console.error("[error-log-global-analysis]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
