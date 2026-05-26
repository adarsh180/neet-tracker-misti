import "server-only";

import { NextResponse } from "next/server";
import { getPrivateSession } from "@/lib/server-auth";

export async function requirePrivateApiSession() {
  const session = await getPrivateSession();
  if (session) return null;

  return NextResponse.json({ error: "Private session required" }, { status: 401 });
}
