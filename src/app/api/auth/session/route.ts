import { NextRequest, NextResponse } from "next/server";
import { ensureTrustedDeviceSession } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const session = await ensureTrustedDeviceSession(req);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, userId: session.userId });
}
