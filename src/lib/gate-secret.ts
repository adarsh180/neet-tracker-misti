import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { db } from "@/lib/db";

/**
 * Dashboard-switch passwords are stored only as salted scrypt hashes in the
 * database (table gate_secrets) — never in code or env. Format:
 *   scrypt$N$r$p$<salt b64url>$<hash b64url>
 * In local development only, GATE_TEST_PASSWORD is also accepted so previews
 * never need the real password.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384;
const R = 8;
const P = 1;
const LEN = 32;

export async function hashGatePassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function matches(password: string, stored: string) {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** True when `password` opens the gate `id`. Unknown gate or empty password → false. */
export async function verifyGatePassword(id: string, password: string) {
  if (!password || password.length > 200) return false;
  const test = process.env.GATE_TEST_PASSWORD;
  if (process.env.NODE_ENV !== "production" && test && password === test) return true;
  const row = await db.gateSecret.findUnique({ where: { id } }).catch(() => null);
  if (!row) return false;
  return matches(password, row.hash).catch(() => false);
}
