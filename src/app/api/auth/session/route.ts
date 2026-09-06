import { NextRequest, NextResponse } from "next/server";
import { ensureTrustedDeviceSession } from "@/lib/server-auth";
import { isPrismaConnectionError } from "@/lib/prisma-errors";

export async function GET(req: NextRequest) {
  try {
    const session = await ensureTrustedDeviceSession(req);

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, userId: session.userId });
  } catch (error) {
    if (!isPrismaConnectionError(error)) throw error;
    // A storage outage does not mean the student's credentials were rejected.
    // Do not delete the trusted cookie or report authenticated: false here.
    return NextResponse.json({ error: "Session verification is temporarily unavailable. Please retry." }, {
      status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }
}
