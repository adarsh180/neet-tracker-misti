import { NextResponse } from "next/server";
import { getPrivateSession } from "@/lib/server-auth";

export async function GET() {
  const session = await getPrivateSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, userId: session.userId });
}
