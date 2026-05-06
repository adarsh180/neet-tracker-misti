import { NextRequest, NextResponse } from "next/server";
import { resolveCredentialUser, setPrivateSession } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = resolveCredentialUser(String(body.email || ""), String(body.password || ""));

    if (!session) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await setPrivateSession(session.userId);
    return NextResponse.json({ ok: true, userId: session.userId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
