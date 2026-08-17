import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subject = request.nextUrl.searchParams.get("subject")?.trim();
  const classLevel = request.nextUrl.searchParams.get("classLevel")?.trim();
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  const documents = await db.ncertDocument.findMany({
    where: {
      subject: subject || undefined,
      classLevel: classLevel === "11" || classLevel === "12" ? classLevel : undefined,
      OR: query ? [{ title: { contains: query } }, { chapter: { contains: query } }] : undefined,
      reviewStatus: "VERIFIED_SOURCE",
    },
    select: {
      id: true,
      subject: true,
      classLevel: true,
      chapter: true,
      title: true,
      edition: true,
      pageCount: true,
      _count: { select: { passages: true } },
      readerProgress: { where: { userId: session.userId }, take: 1, select: { currentPage: true } },
    },
    orderBy: [{ classLevel: "asc" }, { subject: "asc" }, { chapter: "asc" }],
  });
  return NextResponse.json({
    documents: documents.map((document) => ({
      id: document.id,
      subject: document.subject,
      classLevel: document.classLevel,
      chapter: document.chapter,
      title: document.title,
      edition: document.edition,
      pageCount: document.pageCount,
      highlightCount: document._count.passages,
      progress: document.readerProgress[0] ?? null,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const currentPage = Math.max(1, Math.round(Number(body.currentPage) || 1));
  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  const document = await db.ncertDocument.findUnique({ where: { id: documentId }, select: { id: true, pageCount: true } });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const page = Math.min(document.pageCount ?? currentPage, currentPage);
  const progress = await db.ncertReaderProgress.upsert({
    where: { userId_documentId: { userId: session.userId, documentId } },
    create: { userId: session.userId, documentId, currentPage: page, lastReadAt: new Date() },
    update: { currentPage: page, lastReadAt: new Date() },
  });
  return NextResponse.json({ progress });
}
