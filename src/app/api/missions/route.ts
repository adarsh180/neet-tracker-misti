import { NextRequest, NextResponse } from "next/server";
import type { MissionKind } from "@prisma/client";
import { generateMissionSession, getMissionSessions } from "@/lib/mission-control";

export async function GET() {
  try {
    const sessions = await getMissionSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      kind,
      goal,
      createTasks = true,
      subjectSlug,
    } = body as {
      kind?: MissionKind;
      goal?: string;
      createTasks?: boolean;
      subjectSlug?: string;
    };

    if (!kind) {
      return NextResponse.json({ error: "Mission kind is required" }, { status: 400 });
    }

    let session;
    try {
      session = await generateMissionSession({
        kind,
        goal: goal?.trim() || undefined,
        createTasks,
        subjectSlug: subjectSlug?.trim() || undefined,
      });
    } catch (error) {
      console.error("[/api/missions] primary generation failed", error);
      if (!createTasks) throw error;

      session = await generateMissionSession({
        kind,
        goal: goal?.trim() || undefined,
        createTasks: false,
        subjectSlug: subjectSlug?.trim() || undefined,
      });
    }

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("[/api/missions] failed", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
