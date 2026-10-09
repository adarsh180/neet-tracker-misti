import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";
import { sendWebPushNotification } from "@/lib/web-push";

/**
 * Security alerts for the NEET desk: they land in the message panel and as a
 * push on Misti's devices (lockouts, and dashboards opened on a new browser).
 */

const KNOWN_COOKIE = "neet-known-device";

export async function requestInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") ?? "";
  const device = /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "unknown device";
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "a browser";
  const city = h.get("x-vercel-ip-city");
  const where = city ? `${decodeURIComponent(city)}${h.get("x-vercel-ip-country") ? `, ${h.get("x-vercel-ip-country")}` : ""}` : null;
  return { ip, label: `${browser} on ${device}${where ? ` near ${where}` : ""}` };
}

export async function securityAlert(title: string, body: string, tone: "urgent" | "care" | "focus" = "urgent") {
  try {
    const n = await db.appNotification.create({ data: { title, body, tone, senderLabel: "Security", senderClientId: null } });
    await sendWebPushNotification(n, null);
  } catch (error) {
    console.error("[security] alert failed", error);
  }
}

/** True the first time this browser passes a gate; marks it known for a year. */
export async function isNewDevice() {
  const store = await cookies();
  if (store.get(KNOWN_COOKIE)?.value) return false;
  store.set(KNOWN_COOKIE, randomBytes(16).toString("hex"), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86400 });
  return true;
}
