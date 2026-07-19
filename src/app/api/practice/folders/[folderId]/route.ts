import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { folderId } = await params;
  const owned = await db.practiceTestFolder.findFirst({ where: { id: folderId, userId: session.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  if (name !== undefined && !name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  const folder = await db.practiceTestFolder.update({ where: { id: folderId }, data: { name } });
  return NextResponse.json({ folder });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { folderId } = await params;
  const owned = await db.practiceTestFolder.findFirst({ where: { id: folderId, userId: session.userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  await db.practiceTestFolder.delete({ where: { id: folderId } });
  return NextResponse.json({ ok: true });
}
