import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function serveNcertDocument(id: string, request?: Request) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const document = await db.ncertDocument.findFirst({
    where: { id, reviewStatus: "VERIFIED_SOURCE" },
    select: { fileData: true, storagePath: true, sourceUrl: true, title: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  let bytes = document.fileData ? new Uint8Array(document.fileData) : null;
  if (!bytes && document.storagePath) {
    const cachePrefix = path.join("tmp", "pdfs", "ncert-official");
    const ncertCacheRoot = path.join(process.cwd(), "tmp", "pdfs", "ncert-official");
    const relativePath = path.relative(cachePrefix, document.storagePath);
    const localPath = path.resolve(ncertCacheRoot, relativePath);
    if (
      relativePath !== "" &&
      !relativePath.startsWith(`..${path.sep}`) &&
      localPath.startsWith(`${ncertCacheRoot}${path.sep}`)
    ) {
      try {
        bytes = new Uint8Array(await readFile(localPath));
      } catch {
        // Deployed builds may not include the local cache; use the verified source URL below.
      }
    }
  }
  const filename = `${document.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "ncert-chapter"}.pdf`;
  if (!bytes) {
    const range = request?.headers.get("range");
    const upstream = await fetch(document.sourceUrl, {
      headers: range ? { range } : undefined,
      cache: "force-cache",
    });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: "Verified NCERT source is temporarily unavailable" }, { status: 502 });
    }
    const headers = new Headers({
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, max-age=3600",
      "accept-ranges": upstream.headers.get("accept-ranges") ?? "bytes",
    });
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, max-age=3600",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveNcertDocument(id, request);
}
