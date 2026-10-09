import { NextResponse } from "next/server";

import { lockGate } from "@/lib/exams/gate";

export const dynamic = "force-dynamic";

/** Closes NEET PG, NEET SS and Saath on this device; NEET UG stays signed in. */
export async function POST() {
  await lockGate();
  const res = NextResponse.json({ ok: true });
  res.cookies.set("neet-exam", "ug", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
