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

function normalizeForComparison(value?: string | null) {
  return (
    normalizeText(value)
      ?.normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 0; i < a.length; i += 1) {
    current[0] = i + 1;

    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + cost
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function calculateSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const distance = levenshteinDistance(a, b);
  const ratio = 1 - distance / Math.max(a.length, b.length);

  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) {
    return Math.max(ratio, 0.93);
  }

  return ratio;
}

async function resolveChapterName(subjectId: string, chapter: string | null) {
  if (!chapter) return null;

  const chapters = await db.topic.findMany({
    where: {
      subjectId,
      chapter: { not: null },
    },
    select: { chapter: true },
    distinct: ["chapter"],
  });

  if (!chapters.length) {
    return chapter;
  }

  const normalizedTarget = normalizeForComparison(chapter);
  const exactMatch = chapters.find(
    (item) => normalizeForComparison(item.chapter) === normalizedTarget
  );

  if (exactMatch?.chapter) {
    return exactMatch.chapter;
  }

  let bestMatch: { chapter: string; score: number } | null = null;

  for (const item of chapters) {
    const existingChapter = item.chapter ? normalizeText(item.chapter) : null;
    if (!existingChapter) continue;

    const existingNormalized = normalizeForComparison(existingChapter);
    const score = calculateSimilarity(normalizedTarget, existingNormalized);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { chapter: existingChapter, score };
    }
  }

  if (!bestMatch) {
    return chapter;
  }

  const strongEnough =
    bestMatch.score >= 0.9 ||
    (normalizedTarget.length >= 8 && bestMatch.score >= 0.84);

  return strongEnough ? bestMatch.chapter : chapter;
}

async function findExistingTopic(
  subjectId: string,
  name: string,
  chapter: string | null
) {
  const topics = await db.topic.findMany({
    where: {
      subjectId,
      chapter,
    },
    select: {
      id: true,
      subjectId: true,
      name: true,
      chapter: true,
      chapterOrder: true,
      classLevel: true,
      topicOrder: true,
      isCompleted: true,
      completedAt: true,
      questionsSolved: true,
      nextReviewDate: true,
      easeFactor: true,
      interval: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const normalizedName = normalizeForComparison(name);
  return (
    topics.find((topic) => normalizeForComparison(topic.name) === normalizedName) ??
    null
  );
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

  const requestedChapter = normalizeText(input.chapter);
  const chapter = await resolveChapterName(input.subjectId, requestedChapter);
  const classLevel = normalizeText(input.classLevel);

  const existing = await findExistingTopic(input.subjectId, name, chapter ?? null);

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
