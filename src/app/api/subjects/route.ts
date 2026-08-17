import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET all subjects with topics
export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const [subjects, chapterQuestionTotals] = await Promise.all([
      db.subject.findMany({
        include: {
          studyActivities: {
            where: { undoneAt: null },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: 80,
          },
          revisionSessions: {
            where: { undoneAt: null },
            orderBy: { revisedAt: "desc" },
            take: 80,
          },
          topics: {
            include: {
              revisions: { orderBy: { revisedAt: "desc" }, take: 5 },
              _count: { select: { revisions: true } },
              studyActivities: {
                where: { undoneAt: null },
                orderBy: [{ date: "desc" }, { createdAt: "desc" }],
                take: 8,
              },
              revisionSessions: {
                where: { undoneAt: null },
                orderBy: { revisedAt: "desc" },
                take: 8,
              },
            },
            orderBy: [{ chapterOrder: "asc" }, { topicOrder: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: { name: "asc" },
      }),
      db.studyActivity.groupBy({
        by: ["subjectId", "chapter"],
        where: { undoneAt: null, topicId: null },
        _sum: { questionsDelta: true },
      }),
    ]);
    return NextResponse.json(subjects.map((subject) => ({
      ...subject,
      chapterQuestionTotals: chapterQuestionTotals
        .filter((entry) => entry.subjectId === subject.id)
        .map((entry) => ({ chapter: entry.chapter, questions: entry._sum.questionsDelta ?? 0 })),
    })));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
