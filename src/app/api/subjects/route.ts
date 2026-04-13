import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all subjects with topics
export async function GET() {
  try {
    const subjects = await db.subject.findMany({
      include: {
        topics: {
          include: {
            revisions: { orderBy: { revisedAt: "desc" }, take: 5 },
          },
          orderBy: [{ classLevel: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(subjects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
