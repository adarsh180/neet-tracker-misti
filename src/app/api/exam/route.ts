import { NextRequest, NextResponse } from "next/server";

import { EXAM_COOKIE, EXAMS } from "@/lib/exams/server";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const HOME: Record<string, string> = { ug: "/dashboard", pg: "/pg", ss: "/ss" };

/** Open one exam workspace (UG, PG or SS). The proxy keeps the others shut until you switch. */
export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const exam = String(body.exam ?? "");
  if (!(EXAMS as readonly string[]).includes(exam)) return NextResponse.json({ error: "Unknown exam" }, { status: 400 });
  const res = NextResponse.json({ ok: true, home: HOME[exam] });
  // Readable by the client (it only picks which navigation to draw); the proxy and APIs enforce it.
  res.cookies.set(EXAM_COOKIE, exam, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
