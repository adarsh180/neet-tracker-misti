import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET all subjects with topics
export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const subjects = await db.subject.findMany({
      include: {
        topics: {
          include: {
            revisions: { orderBy: { revisedAt: "desc" }, take: 5 },
          },
          orderBy: [{ chapterOrder: "asc" }, { topicOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(subjects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
