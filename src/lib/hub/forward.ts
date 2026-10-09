import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import { hasGate } from "@/lib/exams/gate";
import { getPrivateSession } from "@/lib/server-auth";

/**
 * Saath's data lives on the UPSC site. This server forwards Misti's requests
 * there, signed (HMAC over time, actor and body) with the shared cross-app
 * secret — the browser never talks to the UPSC site and never sees the secret.
 */

function upscOrigin() {
  const explicit = process.env.HUB_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const endpoint = process.env.PARTNER_NOTIFY_ENDPOINT?.trim();
  try {
    return endpoint ? new URL(endpoint).origin : null;
  } catch {
    return null;
  }
}

export async function guardHub() {
  if (!(await getPrivateSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasGate())) return NextResponse.json({ error: "Locked" }, { status: 401 });
  return null;
}

export async function forwardHub(path: string, init: { method: "GET" | "POST"; body?: string; timeoutMs?: number }) {
  const origin = upscOrigin();
  const secret = process.env.CROSS_APP_NOTIFY_SECRET?.trim();
  if (!origin || !secret) return NextResponse.json({ error: "The link to the shared dashboard is not configured." }, { status: 503 });
  const body = init.body ?? "";
  const ts = String(Date.now());
  const actor = "misti";
  const sig = createHmac("sha256", secret).update(`${ts}.${actor}.${body}`).digest("hex");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  try {
    const res = await fetch(`${origin}${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", "x-hub-ts": ts, "x-hub-actor": actor, "x-hub-sig": sig },
      body: init.method === "POST" ? body : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    const text = await res.text();
    // A 401 from the UPSC side means the shared secret does not match — not that Misti is locked.
    if (res.status === 401) return NextResponse.json({ error: "The shared dashboard refused this site's signature — the cross-app secret differs between the two sites." }, { status: 502 });
    return new NextResponse(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[hub] forward failed", path, error);
    return NextResponse.json({ error: (error as Error).name === "AbortError" ? "The shared dashboard took too long — try again." : "Could not reach the shared dashboard." }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
