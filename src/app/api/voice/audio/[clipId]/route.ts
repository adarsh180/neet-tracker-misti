import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { isPrivateVoiceClipId, privateVoicePathname } from "@/lib/private-voice";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseRange(value: string | null, size: number) {
  const match = value?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: NextRequest, context: { params: Promise<{ clipId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clipId } = await context.params;
  if (!isPrivateVoiceClipId(clipId)) return NextResponse.json({ error: "Voice clip not found" }, { status: 404 });
  try {
    const file = await readFile(path.join(process.cwd(), "private-assets", privateVoicePathname(clipId)));
    const range = parseRange(request.headers.get("range"), file.byteLength);
    const body = range ? file.subarray(range.start, range.end + 1) : file;
    return new NextResponse(body, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(body.byteLength),
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${file.byteLength}` } : {}),
        "Cache-Control": "private, no-cache, no-store, max-age=0",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Private voice clip read failed", error);
    return NextResponse.json({ error: "Voice clip is not ready" }, { status: 404 });
  }
}
