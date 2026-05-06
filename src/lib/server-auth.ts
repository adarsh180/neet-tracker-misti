import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const PRIVATE_SESSION_COOKIE = "neet_private_session";

export type PrivateSession = {
  userId: string;
};

const KNOWN_USERS = new Set(["misti", "divyani"]);

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

function signUserId(userId: string) {
  return createHmac("sha256", getSessionSecret()).update(userId).digest("base64url");
}

function makeCookieValue(userId: string) {
  return `${userId}.${signUserId(userId)}`;
}

function verifyCookieValue(value?: string): PrivateSession | null {
  if (!value) return null;

  const [userId, signature] = value.split(".");
  if (!userId || !signature || !KNOWN_USERS.has(userId)) return null;

  const expected = signUserId(userId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  return { userId };
}

export async function setPrivateSession(userId: string) {
  const cookieStore = await cookies();

  cookieStore.set(PRIVATE_SESSION_COOKIE, makeCookieValue(userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    priority: "high",
  });
}

export async function getPrivateSession(): Promise<PrivateSession | null> {
  const cookieStore = await cookies();
  return verifyCookieValue(cookieStore.get(PRIVATE_SESSION_COOKIE)?.value);
}
