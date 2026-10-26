import type { NextRequest } from "next/server";

import { forwardHub, guardHub } from "@/lib/hub/forward";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The SEMDIV tab's data lives behind the UPSC site, which talks to SEMDIV. */
export async function GET(req: NextRequest) {
  return (await guardHub()) ?? forwardHub(`/api/hub/semdiv${req.nextUrl.search}`, { method: "GET", timeoutMs: 28000 });
}
