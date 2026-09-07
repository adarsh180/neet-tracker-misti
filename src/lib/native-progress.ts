import { Prisma } from "@prisma/client";
import { checkVersion, NativeInputError, type NativeWrite } from "./native-input";

export async function saveNativeProgress(tx: Prisma.TransactionClient, userId: string, write: Extract<NativeWrite, { kind: "progress" }>) {
  const ids = write.entries.map(e => e.topicId);
  // Also coordinate with ordinary website topic edits, not only native writers.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM topics WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
  const topics = await tx.topic.findMany({ where: { id: { in: ids } }, include: { _count: { select: { revisions: true } } } });
  for (const entry of write.entries) {
    const topic = topics.find(t => t.id === entry.topicId);
    if (!topic || topic.subjectId !== entry.subjectId || topic.chapter !== entry.chapter || topic.classLevel !== entry.classLevel) throw new NativeInputError("A topic moved or was removed. Reload the chapter.", 409);
    checkVersion(topic.updatedAt, entry.expectedUpdatedAt);
    if (topic.questionsSolved !== entry.expectedQuestions || topic.isCompleted !== entry.expectedCompleted || topic._count.revisions !== entry.expectedRevisions) throw new NativeInputError("Topic progress changed on another device. Reload and review it.", 409);
  }
  // One reviewed chapter batch is one session, with a revision child per topic.
  // Class scope stays in the grouping even though legacy sessions have no class column.
  const revisionGroups = new Map<string, typeof write.entries>();
  for (const entry of write.entries.filter(e => e.fullRevision)) {
    const key = JSON.stringify([entry.subjectId, entry.classLevel, entry.chapter, entry.chapter === null ? entry.topicId : null]);
    revisionGroups.set(key, [...(revisionGroups.get(key) ?? []), entry]);
  }
  for (const entries of revisionGroups.values()) {
    const first = entries[0];
    const topic = topics.find(t => t.id === first.topicId)!;
    const chapterSize = entries.length === 1 ? 1 : await tx.topic.count({ where: {
      subjectId: first.subjectId, classLevel: first.classLevel, chapter: first.chapter,
    } });
    const session = await tx.revisionSession.create({ data: {
      userId, subjectId: first.subjectId, topicId: entries.length === 1 ? first.topicId : null,
      chapter: first.chapter ?? topic.name, coverage: entries.length === chapterSize ? "FULL" : "PARTIAL",
      source: "MANUAL", note: entries.every(e => e.note === first.note) ? first.note : null,
    } });
    await tx.revision.createMany({ data: entries.map(entry => ({
      topicId: entry.topicId, revisionSessionId: session.id, note: entry.note, revisedAt: session.revisedAt,
    })) });
  }
  for (const entry of write.entries) {
    const topic = topics.find(t => t.id === entry.topicId)!;
    await tx.topic.update({ where: { id: topic.id, updatedAt: topic.updatedAt }, data: {
      questionsSolved: { increment: entry.questionsDelta },
      ...(entry.completed !== null ? { isCompleted: entry.completed, completedAt: entry.completed ? (topic.completedAt ?? new Date()) : null } : {}),
    } });
    if (entry.questionsDelta || entry.fullRevision || entry.completed === true || entry.note) {
      await tx.studyActivity.create({ data: { userId, date: new Date(write.date), subjectId: topic.subjectId, topicId: topic.id, chapter: topic.chapter ?? topic.name,
        kind: entry.fullRevision ? "REVISION" : entry.questionsDelta ? "PRACTICE" : "NEW_LEARNING",
        coverage: entry.fullRevision || entry.completed === true ? "FULL" : "PARTIAL", questionsDelta: entry.questionsDelta,
        completionConfirmed: entry.completed === true, source: "MANUAL", notes: entry.note } });
    }
  }
  return { topics: await tx.topic.findMany({ where: { id: { in: ids } }, include: { _count: { select: { revisions: true } } } }) };
}
