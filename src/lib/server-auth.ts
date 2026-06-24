import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { constantTimeEquals } from "@/lib/secure-compare";

export const PRIVATE_SESSION_COOKIE = "neet_private_session";

export type PrivateSession = {
  userId: "misti";
  sessionId?: string;
  legacy?: boolean;
};

const CANONICAL_USER_ID = "misti" as const;
const KNOWN_USERS = new Set(["misti", "divyani"]);
const TRUSTED_SESSION_PREFIX = "v2";
const TRUSTED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const LEGACY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const LOGIN_LOCK_FAILURES = 4;
const LOGIN_LOCK_SECONDS = 60 * 60;

function getSessionSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEET_AUTH_SECRET ||
    process.env.MISTI_PWD ||
    process.env.DIVYANI_PWD ||
    process.env.DATABASE_URL ||
    "neet-tracker-local-session-secret"
  );
}

function canonicalizeUserId() {
  return CANONICAL_USER_ID;
}

function hashForStorage(label: string, value: string) {
  return createHmac("sha256", getSessionSecret()).update(`${label}:${value}`).digest("hex");
}

function signUserId(userId: string) {
  return createHmac("sha256", getSessionSecret()).update(userId).digest("base64url");
}

function makeLegacyCookieValue(userId: string) {
  return `${userId}.${signUserId(userId)}`;
}

function verifyLegacyCookieValue(value?: string): PrivateSession | null {
  if (!value) return null;

  const [userId, signature] = value.split(".");
  if (!userId || !signature || !KNOWN_USERS.has(userId)) return null;

  const expected = signUserId(userId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  return { userId: canonicalizeUserId(), legacy: true };
}

function parseTrustedCookieValue(value?: string) {
  if (!value) return null;
  const [version, sessionId, token] = value.split(".");
  if (version !== TRUSTED_SESSION_PREFIX || !sessionId || !token) return null;
  return { sessionId, token };
}

function isTableUnavailable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  const message = String(error).toLowerCase();
  return message.includes("doesn't exist") || message.includes("does not exist") || message.includes("unknown column");
}

function getIpFingerprint(request?: NextRequest) {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request?.headers.get("x-real-ip")?.trim() || "unknown";
}

function getUserAgentFingerprint(request?: NextRequest) {
  return request?.headers.get("user-agent")?.slice(0, 500) || "unknown";
}

function makeTrustedCookieValue(sessionId: string, token: string) {
  return `${TRUSTED_SESSION_PREFIX}.${sessionId}.${token}`;
}

async function setLegacySessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PRIVATE_SESSION_COOKIE, makeLegacyCookieValue(userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LEGACY_SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
}

async function getCookieValue() {
  const cookieStore = await cookies();
  return cookieStore.get(PRIVATE_SESSION_COOKIE)?.value;
}

export async function setPrivateSession(
  userId: string,
  request?: NextRequest,
  options: { legacyMigrated?: boolean } = {}
) {
  const canonicalUserId = canonicalizeUserId();
  if (!KNOWN_USERS.has(userId) && userId !== canonicalUserId) {
    throw new Error("Unknown private user");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TRUSTED_SESSION_MAX_AGE_SECONDS * 1000);

  try {
    const session = await db.trustedDeviceSession.create({
      data: {
        userId: canonicalUserId,
        tokenHash: hashForStorage("session-token", token),
        userAgentHash: hashForStorage("user-agent", getUserAgentFingerprint(request)),
        ipHash: hashForStorage("ip", getIpFingerprint(request)),
        expiresAt,
        legacyMigratedAt: options.legacyMigrated ? new Date() : null,
      },
      select: { id: true },
    });

    const cookieStore = await cookies();
    cookieStore.set(PRIVATE_SESSION_COOKIE, makeTrustedCookieValue(session.id, token), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TRUSTED_SESSION_MAX_AGE_SECONDS,
      priority: "high",
    });
  } catch (error) {
    if (!isTableUnavailable(error)) throw error;
    console.warn("[auth] trusted_device_sessions unavailable; using legacy cookie until migration is applied.");
    await setLegacySessionCookie(canonicalUserId);
  }
}

async function verifyTrustedSession(value?: string): Promise<PrivateSession | null> {
  const parsed = parseTrustedCookieValue(value);
  if (!parsed) return null;

  try {
    const session = await db.trustedDeviceSession.findUnique({
      where: { id: parsed.sessionId },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session || session.userId !== CANONICAL_USER_ID || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (!constantTimeEquals(hashForStorage("session-token", parsed.token), session.tokenHash)) return null;

    await db.trustedDeviceSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
      select: { id: true },
    }).catch(() => {});

    return { userId: CANONICAL_USER_ID, sessionId: session.id };
  } catch (error) {
    if (isTableUnavailable(error)) return null;
    throw error;
  }
}

export async function getPrivateSession(): Promise<PrivateSession | null> {
  const value = await getCookieValue();
  return (await verifyTrustedSession(value)) || verifyLegacyCookieValue(value);
}

export async function ensureTrustedDeviceSession(request?: NextRequest) {
  const value = await getCookieValue();
  const trusted = await verifyTrustedSession(value);
  if (trusted) return trusted;

  const legacy = verifyLegacyCookieValue(value);
  if (!legacy) return null;

  await setPrivateSession(legacy.userId, request, { legacyMigrated: true });
  return { userId: CANONICAL_USER_ID };
}

export async function clearPrivateSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(PRIVATE_SESSION_COOKIE)?.value;
  const trusted = parseTrustedCookieValue(value);

  if (trusted) {
    await db.trustedDeviceSession.updateMany({
      where: { id: trusted.sessionId },
      data: { revokedAt: new Date() },
    }).catch(() => {});
  }

  cookieStore.delete(PRIVATE_SESSION_COOKIE);
}

export function resolveCredentialUser(email: string, password: string): PrivateSession | null {
  const normalizedEmail = email.toLowerCase().trim();
  const candidates = [
    {
      email: process.env.MISTI_EMAIL || "",
      password: process.env.MISTI_PWD || "",
    },
    {
      email: process.env.DIVYANI_EMAIL || "",
      password: process.env.DIVYANI_PWD || "",
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.email || !candidate.password) continue;
    const emailMatches = constantTimeEquals(normalizedEmail, candidate.email.toLowerCase().trim());
    const passwordMatches = constantTimeEquals(password, candidate.password);
    if (emailMatches && passwordMatches) return { userId: CANONICAL_USER_ID };
  }

  return null;
}

function getRateLimitHashes(email: string, request: NextRequest) {
  const normalizedEmail = email.toLowerCase().trim() || "empty";
  const ip = getIpFingerprint(request);
  const emailHash = hashForStorage("login-email", normalizedEmail);
  const ipHash = hashForStorage("login-ip", ip);
  return {
    emailHash,
    ipHash,
    scopeHash: hashForStorage("login-scope", `${emailHash}:${ipHash}`),
  };
}

function secondsUntil(date: Date) {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

export async function getLoginCooldown(email: string, request: NextRequest) {
  const { scopeHash } = getRateLimitHashes(email, request);

  try {
    const record = await db.loginRateLimit.findUnique({
      where: { scopeHash },
      select: { lockedUntil: true },
    });

    if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
      return { retryAfterSeconds: secondsUntil(record.lockedUntil) };
    }
  } catch (error) {
    if (!isTableUnavailable(error)) console.warn("[auth] login cooldown check skipped:", error);
  }

  return null;
}

export async function recordFailedLogin(email: string, request: NextRequest) {
  const { scopeHash, emailHash, ipHash } = getRateLimitHashes(email, request);
  const now = new Date();

  try {
    const current = await db.loginRateLimit.findUnique({
      where: { scopeHash },
      select: { failureCount: true, lockedUntil: true },
    });

    if (current?.lockedUntil && current.lockedUntil.getTime() > now.getTime()) {
      return { retryAfterSeconds: secondsUntil(current.lockedUntil) };
    }

    const failureCount = (current?.lockedUntil && current.lockedUntil.getTime() <= now.getTime())
      ? 1
      : (current?.failureCount ?? 0) + 1;
    const lockedUntil = failureCount >= LOGIN_LOCK_FAILURES
      ? new Date(now.getTime() + LOGIN_LOCK_SECONDS * 1000)
      : null;

    await db.loginRateLimit.upsert({
      where: { scopeHash },
      create: {
        scopeHash,
        emailHash,
        ipHash,
        failureCount,
        lockedUntil,
        lastFailedAt: now,
      },
      update: {
        emailHash,
        ipHash,
        failureCount,
        lockedUntil,
        lastFailedAt: now,
      },
    });

    return lockedUntil ? { retryAfterSeconds: secondsUntil(lockedUntil) } : null;
  } catch (error) {
    if (!isTableUnavailable(error)) console.warn("[auth] login failure tracking skipped:", error);
    return null;
  }
}

export async function recordSuccessfulLogin(email: string, request: NextRequest) {
  const { scopeHash } = getRateLimitHashes(email, request);

  try {
    await db.loginRateLimit.updateMany({
      where: { scopeHash },
      data: {
        failureCount: 0,
        lockedUntil: null,
        lastFailedAt: null,
      },
    });
  } catch (error) {
    if (!isTableUnavailable(error)) console.warn("[auth] login success reset skipped:", error);
  }
}
