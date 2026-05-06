import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PRIVATE_SESSION_COOKIE } from "@/lib/server-auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(PRIVATE_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
