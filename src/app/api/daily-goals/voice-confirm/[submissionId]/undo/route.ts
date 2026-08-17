import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

type BeforeGoal = {
  id: string;
  subjectId: string;
  date: string | Date;
  hoursStudied: number;
  questionsSolved: number;
  disciplineScore: number;
  completionPercent: number;
  intensityLevel: number;
  notes: string | null;
  createdAt: string | Date;
};

type BeforeTopic = { id: string; questionsSolved: number; isCompleted: boolean; completedAt: string | Date | null };
type StoredPayload = { entries?: Array<{ subjectId?: string }>; beforeState?: { goals?: BeforeGoal[]; topics?: BeforeTopic[] } };

export async function POST(_request: NextRequest, context: { params: Promise<{ submissionId: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { submissionId } = await context.params;
  const submission = await db.voiceDailyLogSubmission.findFirst({
    where: { id: submissionId, userId: session.userId },
    include: { studyActivities: true, revisionSessions: true },
  });
  if (!submission) return NextResponse.json({ error: "Voice update not found" }, { status: 404 });
  if (submission.undoneAt) return NextResponse.json({ undone: true, duplicate: true });
  const latest = await db.voiceDailyLogSubmission.findFirst({
    where: { userId: session.userId, logDate: submission.logDate, undoneAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest?.id !== submission.id) {
    return NextResponse.json({ error: "Only the latest voice update for this day can be undone safely." }, { status: 409 });
  }

  const payload = submission.payloadJson as StoredPayload;
  const beforeGoals = Array.isArray(payload.beforeState?.goals) ? payload.beforeState.goals : [];
  const beforeTopics = Array.isArray(payload.beforeState?.topics) ? payload.beforeState.topics : [];
  const subjectIds = [...new Set((payload.entries ?? []).map((entry) => entry.subjectId).filter((value): value is string => Boolean(value)))];
  const now = new Date();

  await db.$transaction(async (transaction) => {
    if (subjectIds.length) await transaction.dailyGoal.deleteMany({ where: { subjectId: { in: subjectIds }, date: submission.logDate } });
    for (const goal of beforeGoals) {
      await transaction.dailyGoal.create({
        data: {
          id: goal.id,
          subjectId: goal.subjectId,
          date: new Date(goal.date),
          hoursStudied: goal.hoursStudied,
          questionsSolved: goal.questionsSolved,
          disciplineScore: goal.disciplineScore,
          completionPercent: goal.completionPercent,
          intensityLevel: goal.intensityLevel,
          notes: goal.notes,
          createdAt: new Date(goal.createdAt),
        },
      });
    }
    for (const topic of beforeTopics) {
      await transaction.topic.update({
        where: { id: topic.id },
        data: {
          questionsSolved: topic.questionsSolved,
          isCompleted: topic.isCompleted,
          completedAt: topic.completedAt ? new Date(topic.completedAt) : null,
        },
      });
    }
    const revisionSessionIds = submission.revisionSessions.map((sessionItem) => sessionItem.id);
    if (revisionSessionIds.length) {
      await transaction.revision.deleteMany({ where: { revisionSessionId: { in: revisionSessionIds } } });
      await transaction.revisionSession.updateMany({ where: { id: { in: revisionSessionIds } }, data: { undoneAt: now } });
    }
    await transaction.studyActivity.updateMany({ where: { voiceSubmissionId: submission.id }, data: { undoneAt: now } });
    await transaction.task.deleteMany({ where: { voiceSubmissionId: submission.id } });
    await transaction.voiceDailyLogSubmission.update({ where: { id: submission.id }, data: { undoneAt: now } });
  }, { timeout: 20_000 });

  return NextResponse.json({ undone: true });
}
