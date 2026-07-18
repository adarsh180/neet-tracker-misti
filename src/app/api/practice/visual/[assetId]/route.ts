import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const asset = await db.questionVisualAsset.findUnique({ where: { id: assetId } });
  if (!asset) return Response.json({ error: "Visual asset not found" }, { status: 404 });
  const etag = `"${asset.contentHash}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  const body = asset.fileData.buffer.slice(asset.fileData.byteOffset, asset.fileData.byteOffset + asset.fileData.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": asset.mimeType,
      "content-length": String(asset.byteSize),
      "cache-control": "private, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      etag,
    },
  });
}
