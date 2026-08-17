import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  const preference = await db.voiceAssistantPreference.upsert({
    where: { userId: "misti" },
    create: {
      userId: "misti",
      nickname: "Shona",
      speechEnabled: true,
      interactionMode: "WAKE",
      onboardingSeen: false,
      onboardingVersion: 0,
    },
    update: {
      nickname: "Shona",
      speechEnabled: true,
      interactionMode: "WAKE",
      onboardingSeen: false,
      onboardingVersion: 0,
    },
  });
  console.log(JSON.stringify({
    userId: preference.userId,
    interactionMode: preference.interactionMode,
    onboardingSeen: preference.onboardingSeen,
    onboardingVersion: preference.onboardingVersion,
  }));
} finally {
  await db.$disconnect();
}
