import { db } from "@/lib/db";

type TopicCreateInput = {
  subjectId: string;
  name: string;
  chapter?: string | null;
  classLevel?: string | null;
};

function normalizeText(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.replace(/\s+/g, " ") : null;
}

async function getNextChapterOrder(subjectId: string) {
  const row = await db.topic.findFirst({
    where: { subjectId },
    orderBy: { chapterOrder: "desc" },
    select: { chapterOrder: true },
  });
  return (row?.chapterOrder ?? -1) + 1;
}

async function getExistingChapterOrder(subjectId: string, chapter: string | null) {
  if (!chapter) return null;
  const row = await db.topic.findFirst({
    where: { subjectId, chapter },
    orderBy: { chapterOrder: "asc" },
    select: { chapterOrder: true },
  });
  return row?.chapterOrder ?? null;
}

async function getNextTopicOrder(subjectId: string, chapter: string | null) {
  const row = await db.topic.findFirst({
    where: { subjectId, chapter },
    orderBy: { topicOrder: "desc" },
    select: { topicOrder: true },
  });
  return (row?.topicOrder ?? -1) + 1;
}

export async function createTopicRecord(input: TopicCreateInput) {
  const name = normalizeText(input.name);
  if (!name) {
    throw new Error("Topic name is required");
  }

  const chapter = normalizeText(input.chapter);
  const classLevel = normalizeText(input.classLevel);

  const existing = await db.topic.findFirst({
    where: {
      subjectId: input.subjectId,
      name,
      chapter: chapter ?? null,
    },
  });

  if (existing) {
    return existing;
  }

  const [existingChapterOrder, nextChapterOrder, topicOrder] = await Promise.all([
    getExistingChapterOrder(input.subjectId, chapter),
    getNextChapterOrder(input.subjectId),
    getNextTopicOrder(input.subjectId, chapter ?? null),
  ]);

  return db.topic.create({
    data: {
      subjectId: input.subjectId,
      name,
      chapter,
      chapterOrder: existingChapterOrder ?? nextChapterOrder,
      classLevel,
      topicOrder,
    },
  });
}
