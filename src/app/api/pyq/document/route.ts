import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import jeeCatalog from "@/data/pyq/jee-catalog.json";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const DOCUMENTS = new Map(
  jeeCatalog.years.flatMap((folder) =>
    folder.papers.map((paper) => [paper.pathname, { fileName: paper.fileName, year: folder.year }] as const),
  ),
);

export async function GET(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) {
    return NextResponse.json({ error: "Private session required" }, { status: 401 });
  }

  const pathname = request.nextUrl.searchParams.get("pathname") ?? "";
  const docInfo = DOCUMENTS.get(pathname);
  if (!docInfo) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const { fileName } = docInfo;

  try {
    let pdfBuffer: Buffer | null = null;

    // 1. Try fetching from the TiDB cloud database (Highly compressed, synced)
    const dbDoc = await db.pyqDocument.findUnique({
      where: { pathname },
      select: { fileData: true },
    });

    if (dbDoc && dbDoc.fileData) {
      // Decompress on the fly (blazing fast zlib decompression)
      try {
        pdfBuffer = zlib.inflateSync(dbDoc.fileData as Buffer);
      } catch (decompError) {
        console.error("[PYQ Document GET] Decompression failed:", decompError);
      }
    }

    // 2. Fallback: If not in DB yet (or decomp failed) and running locally, load from local disk
    if (!pdfBuffer && process.env.NODE_ENV === "development") {
      const localFilePath = path.join("D:\\NEET\\PYQ\\JEE", docInfo.year, fileName);
      if (fs.existsSync(localFilePath)) {
        try {
          pdfBuffer = fs.readFileSync(localFilePath);
          console.log(`[PYQ Document GET] Serviced locally: "${fileName}"`);
        } catch (localError) {
          console.error("[PYQ Document GET] Local filesystem read failed:", localError);
        }
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json({ error: "Paper not found or not yet synced to DB" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", request.nextUrl.searchParams.get("download") === "1"
      ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
      : `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);

    return new Response(new Uint8Array(pdfBuffer), { status: 200, headers });
  } catch (error) {
    console.error("[PYQ Document GET]", error);
    return NextResponse.json({ error: "Unable to load paper" }, { status: 500 });
  }
}
