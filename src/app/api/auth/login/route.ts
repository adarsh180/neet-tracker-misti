import { NextRequest, NextResponse } from "next/server";
import {
  getLoginCooldown,
  recordFailedLogin,
  recordSuccessfulLogin,
  resolveCredentialUser,
  setPrivateSession,
} from "@/lib/server-auth";

function cooldownResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "Too many failed login attempts. Try again in 1 hour.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "");
    const password = String(body.password || "");
    const cooldown = await getLoginCooldown(email, req);
    if (cooldown) return cooldownResponse(cooldown.retryAfterSeconds);

    const session = resolveCredentialUser(email, password);

    if (!session) {
      const locked = await recordFailedLogin(email, req);
      if (locked) return cooldownResponse(locked.retryAfterSeconds);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await recordSuccessfulLogin(email, req);
    await setPrivateSession(session.userId, req);
    return NextResponse.json({ ok: true, userId: session.userId });
  } catch (error) {
    console.error("[auth/login] failed:", error);
    return NextResponse.json({ error: "Could not create a private session" }, { status: 500 });
  }
}
