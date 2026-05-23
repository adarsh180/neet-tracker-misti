const { PrismaClient } = require("@prisma/client");
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

// Load .env.local manually
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

console.log("Database URL:", process.env.DATABASE_URL ? "Exits" : "Missing");
console.log("VAPID Keys configured:", {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? "Yes" : "No",
  privateKey: process.env.VAPID_PRIVATE_KEY ? "Yes" : "No",
  subject: process.env.VAPID_SUBJECT || "Missing",
});

const prisma = new PrismaClient();

async function run() {
  try {
    const subscriptions = await prisma.pushSubscription.findMany();
    console.log(`Found ${subscriptions.length} active push subscriptions:`);
    subscriptions.forEach((sub, i) => {
      console.log(`\n[Subscription ${i + 1}]`);
      console.log("  Endpoint:", sub.endpoint.slice(0, 80) + "...");
      console.log("  User-Agent:", sub.userAgent);
      console.log("  Sender Client ID:", sub.senderClientId);
      console.log("  Created At:", sub.createdAt);
    });

    if (subscriptions.length === 0) {
      console.log("\nNo subscriptions found. Please enable 'Device push' in the UI first.");
      return;
    }

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
      console.error("\nError: VAPID keys not configured in env.");
      return;
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    console.log("\nAttempting to send test push notification to all subscriptions...");

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      const payload = JSON.stringify({
        title: "Diagnostic Test",
        body: "Checking if PWA push background worker wakes up.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test-nudge",
        urgent: true,
        data: {
          url: "/dashboard",
          urgent: true,
        },
      });

      try {
        await webpush.sendNotification(pushSubscription, payload, { TTL: 60 });
        console.log(`  -> Sent successfully to endpoint: ${sub.endpoint.slice(0, 80)}...`);
      } catch (error) {
        console.error(`  -> Failed for endpoint: ${sub.endpoint.slice(0, 80)}...`);
        console.error("     Status Code:", error.statusCode);
        console.error("     Error Details:", error.body || error.message || error);
      }
    }

  } catch (err) {
    console.error("Database connection/query failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
