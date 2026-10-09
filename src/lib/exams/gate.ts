import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";
import { verifyGatePassword } from "@/lib/gate-secret";
import { isNewDevice, requestInfo, securityAlert } from "@/lib/security-alert";
import { GATE_COOKIE, GATE_HOURS, makeGateToken, verifyGateToken } from "@/lib/exams/gate-token";

/**
 * Opening NEET PG, NEET SS or Saath needs the dashboard-switch password on top
 * of the sign-in. Five wrong tries lock it for 15 minutes on that network.
 */

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`neet-gate-ip:${ip}`).digest("hex");
}

export async function hasGate() {
  const store = await cookies();
  return verifyGateToken(store.get(GATE_COOKIE)?.value);
}

export type GateResult = { ok: true } | { ok: false; error: string; lockedMinutes?: number };

export async function unlockGate(password: string): Promise<GateResult> {
  const ip = await ipHash();
  const scopeHash = createHash("sha256").update(`gate:${ip}`).digest("hex");
  const now = new Date();
  const rec = await db.loginRateLimit.findUnique({ where: { scopeHash } }).catch(() => null);
  if (rec?.lockedUntil && rec.lockedUntil > now) {
    return { ok: false, error: `Locked after ${MAX_FAILURES} wrong attempts.`, lockedMinutes: Math.ceil((rec.lockedUntil.getTime() - now.getTime()) / 60000) };
  }
  if (!(await verifyGatePassword("neet", password))) {
    const failures = (rec?.lockedUntil && rec.lockedUntil <= now ? 0 : rec?.failureCount ?? 0) + 1;
    const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null;
    await db.loginRateLimit
      .upsert({
        where: { scopeHash },
        create: { scopeHash, emailHash: "gate", ipHash: ip, failureCount: failures, lockedUntil, lastFailedAt: now },
        update: { failureCount: failures, lockedUntil, lastFailedAt: now },
      })
      .catch((e) => console.error("[gate] attempt write failed", e));
    if (lockedUntil) await securityAlert("Dashboard switch locked", `5 wrong dashboard passwords from ${(await requestInfo()).label}. PG, SS and Saath are locked there for 15 minutes.`);
    await new Promise((r) => setTimeout(r, 500));
    return lockedUntil
      ? { ok: false, error: `Locked after ${MAX_FAILURES} wrong attempts.`, lockedMinutes: LOCK_MINUTES }
      : { ok: false, error: `Wrong password — ${MAX_FAILURES - failures} attempt${MAX_FAILURES - failures === 1 ? "" : "s"} left.` };
  }
  await db.loginRateLimit.deleteMany({ where: { scopeHash } }).catch(() => null);
  const store = await cookies();
  if (await isNewDevice()) await securityAlert("Dashboards opened on a new browser", `PG, SS and Saath were unlocked from ${(await requestInfo()).label}. If this wasn’t you, change the dashboard password.`, "care");
  store.set(GATE_COOKIE, makeGateToken(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: GATE_HOURS * 3600 });
  return { ok: true };
}

export async function lockGate() {
  const store = await cookies();
  store.delete(GATE_COOKIE);
}
