import "server-only";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getPrivateSession } from "@/lib/server-auth";

async function isCrossOriginMutation() {
  const headerStore = await headers();
  const method = headerStore.get("x-http-method-override") || "";
  const origin = headerStore.get("origin");
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const fetchSite = headerStore.get("sec-fetch-site");

  if (fetchSite === "cross-site") return true;
  if (!origin || !host) return false;

  try {
    const originHost = new URL(origin).host;
    return originHost !== host;
  } catch {
    return method.length > 0;
  }
}

export async function requirePrivateApiSession() {
  if (await isCrossOriginMutation()) {
    return NextResponse.json({ error: "Cross-origin private mutations are not allowed" }, { status: 403 });
  }

  const session = await getPrivateSession();
  if (session) return null;

  return NextResponse.json({ error: "Private session required" }, { status: 401 });
}
