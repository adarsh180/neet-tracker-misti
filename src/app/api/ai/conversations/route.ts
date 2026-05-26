import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const conversations = await db.aiConversation.findMany({
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(
      conversations.map((c) => ({
        id: c.id,
        title: c.title || "New Conversation",
        mode: c.mode,
        lastMessage: c.messages[0]?.content?.slice(0, 100) || "",
        messageCount: 0,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
