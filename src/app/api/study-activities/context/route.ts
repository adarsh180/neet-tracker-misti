import { NextResponse } from "next/server";

import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  const [subjects, recentActivities] = await Promise.all([
    db.subject.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        emoji: true,
        topics: {
          orderBy: [{ chapterOrder: "asc" }, { topicOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            chapter: true,
            classLevel: true,
            questionsSolved: true,
            isCompleted: true,
            completedAt: true,
            nextReviewDate: true,
            _count: { select: { revisions: true, revisionSessions: true } },
          },
        },
      },
    }),
    db.studyActivity.findMany({
      where: { undoneAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: {
        id: true,
        date: true,
        subjectId: true,
        topicId: true,
        chapter: true,
        kind: true,
        coverage: true,
        hoursStudied: true,
        questionsDelta: true,
        intensityLevel: true,
        completionConfirmed: true,
        source: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ subjects, recentActivities });
}
