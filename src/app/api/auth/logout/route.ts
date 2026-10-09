import { NextResponse } from "next/server";
import { clearPrivateSession } from "@/lib/server-auth";

export async function POST() {
  await clearPrivateSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("neet-exam");
  res.cookies.delete("neet-gate");
  return res;
}
