import { NextResponse } from "next/server";
import { clearPrivateSession } from "@/lib/server-auth";

export async function POST() {
  await clearPrivateSession();
  return NextResponse.json({ ok: true });
}
