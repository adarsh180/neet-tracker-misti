import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { folderId } = await params;
  if (folderId === "all") return NextResponse.json({ error: "All Tests is permanent and cannot be edited" }, { status: 403 });
  const owned = await db.practiceTestFolder.findFirst({ where: { id: folderId, userId: session.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  if (name !== undefined && !name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  try {
    const folder = await db.practiceTestFolder.update({ where: { id: folderId }, data: { name } });
    return NextResponse.json({ folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not rename folder";
    return NextResponse.json({ error: /unique/i.test(message) ? "A folder with this name already exists" : message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { folderId } = await params;
  if (folderId === "all") return NextResponse.json({ error: "All Tests is permanent and cannot be deleted" }, { status: 403 });
  const owned = await db.practiceTestFolder.findFirst({
    where: { id: folderId, userId: session.userId },
    select: { id: true, parentId: true, _count: { select: { tests: true, children: true } } },
  });
  if (!owned) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  await db.$transaction([
    db.practiceTest.updateMany({ where: { userId: session.userId, folderId }, data: { folderId: owned.parentId } }),
    db.practiceTestFolder.updateMany({ where: { userId: session.userId, parentId: folderId }, data: { parentId: owned.parentId } }),
    db.practiceTestFolder.delete({ where: { id: folderId } }),
  ]);
  return NextResponse.json({
    ok: true,
    parentId: owned.parentId,
    preservedTests: owned._count.tests,
    promotedFolders: owned._count.children,
  });
}
