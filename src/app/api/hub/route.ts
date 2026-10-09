import { NextRequest } from "next/server";

import { forwardHub, guardHub } from "@/lib/hub/forward";

export const dynamic = "force-dynamic";

export async function GET() {
  return (await guardHub()) ?? forwardHub("/api/hub", { method: "GET" });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 20000) return Response.json({ error: "Too large" }, { status: 413 });
  return (await guardHub()) ?? forwardHub("/api/hub", { method: "POST", body: raw });
}
