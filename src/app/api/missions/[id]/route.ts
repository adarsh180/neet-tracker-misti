import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.missionSession.findUnique({
      where: { id },
      include: {
        tasks: {
          include: { subject: { select: { id: true, name: true, slug: true, color: true } } },
          orderBy: { orderIndex: "asc" },
        },
        subject: { select: { id: true, name: true, slug: true, color: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body as { status?: "READY" | "APPLIED" | "ARCHIVED" };

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    const session = await db.missionSession.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
