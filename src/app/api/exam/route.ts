import { NextRequest, NextResponse } from "next/server";

import { hasGate, unlockGate } from "@/lib/exams/gate";
import { GATED } from "@/lib/exams/gate-token";
import { EXAM_COOKIE, EXAMS } from "@/lib/exams/server";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const HOME: Record<string, string> = { ug: "/dashboard", pg: "/pg", ss: "/ss", hub: "/hub" };

/**
 * Open one dashboard: NEET UG, NEET PG, NEET SS or Saath. PG, SS and Saath
 * also need the dashboard-switch password (valid for 24 hours). The proxy
 * keeps the others shut until you switch.
 */
export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const exam = String(body.exam ?? "");
  if (!(EXAMS as readonly string[]).includes(exam)) return NextResponse.json({ error: "Unknown dashboard" }, { status: 400 });

  if (GATED.has(exam) && !(await hasGate())) {
    if (typeof body.password !== "string" || !body.password) return NextResponse.json({ needGate: true, error: "Enter the dashboard-switch password." }, { status: 403 });
    const result = await unlockGate(body.password);
    if (!result.ok) return NextResponse.json({ needGate: true, error: result.error, lockedMinutes: result.lockedMinutes ?? null }, { status: result.lockedMinutes ? 429 : 403 });
  }

  const res = NextResponse.json({ ok: true, home: HOME[exam] });
  // Readable by the client (it only picks which navigation to draw); the proxy and APIs enforce it.
  res.cookies.set(EXAM_COOKIE, exam, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
