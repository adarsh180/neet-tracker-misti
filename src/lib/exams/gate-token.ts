import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The NEET PG, NEET SS and Saath gate: a signed, httpOnly, 24-hour token,
 * minted only after the dashboard-switch password. No database access here,
 * so the proxy can verify it on every request.
 */

export const GATE_COOKIE = "neet-gate";
export const GATE_HOURS = 24;

function secret() {
  const base = process.env.AUTH_SECRET || process.env.NEET_AUTH_SECRET || process.env.MISTI_PWD || process.env.DIVYANI_PWD || process.env.DATABASE_URL || "neet-tracker-local-session-secret";
  // Derived: a gate token can never be replayed as a session cookie or vice versa.
  return createHmac("sha256", base).update("neet-gate-scope").digest();
}

const sign = (exp: string) => createHmac("sha256", secret()).update(`gate.${exp}`).digest("base64url");

export function makeGateToken(now = Date.now()) {
  const exp = String(now + GATE_HOURS * 3600_000);
  return `g1.${exp}.${sign(exp)}`;
}

export function verifyGateToken(value: string | undefined | null, now = Date.now()) {
  if (!value) return false;
  const [v, exp, sig] = value.split(".");
  if (v !== "g1" || !/^\d{13}$/.test(exp ?? "") || !sig) return false;
  if (Number(exp) < now) return false;
  const a = Buffer.from(sign(exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const GATED = new Set(["pg", "ss", "hub"]);
