import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const COLORS = new Set(["GOLD", "ROSE", "SAGE", "SKY", "VIOLET"]);

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const folders = await db.practiceTestFolder.findMany({
    where: { userId: session.userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { tests: true, children: true } } },
  });
  return NextResponse.json({
    folders: folders.map((folder) => ({
      ...folder,
      testCount: folder._count.tests,
      childCount: folder._count.children,
      _count: undefined,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  const color = COLORS.has(String(body.color)) ? String(body.color) : "GOLD";
  const parentId = typeof body.parentId === "string" && body.parentId && body.parentId !== "all" ? body.parentId : null;
  if (parentId) {
    const parent = await db.practiceTestFolder.findFirst({ where: { id: parentId, userId: session.userId }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
  }
  try {
    const last = await db.practiceTestFolder.aggregate({ where: { userId: session.userId, parentId }, _max: { position: true } });
    const folder = await db.practiceTestFolder.create({
      data: { userId: session.userId, name, color, parentId, position: (last._max.position ?? -1) + 1 },
    });
    return NextResponse.json({ folder: { ...folder, testCount: 0, childCount: 0 } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create folder";
    return NextResponse.json({ error: /unique/i.test(message) ? "A folder with this name already exists" : message }, { status: 400 });
  }
}
