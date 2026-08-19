import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const resetOrigin = process.env.VOICE_RESET_ORIGIN?.replace(/\/$/, "");

const resetValues = {
  nickname: "Shona",
  speechEnabled: true,
  interactionMode: "WAKE",
  onboardingSeen: false,
  onboardingVersion: 0,
};

async function resetThroughDatabase() {
  return db.voiceAssistantPreference.upsert({
    where: { userId: "misti" },
    create: { userId: "misti", ...resetValues },
    update: resetValues,
  });
}

async function resetThroughAuthenticatedApi(origin) {
  const email = process.env.MISTI_EMAIL;
  const password = process.env.MISTI_PWD;
  if (!email || !password) throw new Error("MISTI_EMAIL and MISTI_PWD are required for the API reset fallback");

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Production sign-in failed with status ${login.status}`);

  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Production sign-in did not return a session cookie");

  const response = await fetch(`${origin}/api/voice/preferences`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(resetValues),
  });
  if (!response.ok) throw new Error(`Voice preference reset failed with status ${response.status}`);
  return response.json();
}

try {
  let preference;
  try {
    preference = await resetThroughDatabase();
  } catch (error) {
    if (!resetOrigin) throw error;
    console.warn("Direct database reset unavailable; using the authenticated application API.");
    preference = await resetThroughAuthenticatedApi(resetOrigin);
  }
  console.log(JSON.stringify({
    userId: preference.userId,
    interactionMode: preference.interactionMode,
    onboardingSeen: preference.onboardingSeen,
    onboardingVersion: preference.onboardingVersion,
  }));
} finally {
  await db.$disconnect();
}
