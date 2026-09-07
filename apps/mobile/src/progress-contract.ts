import { type Topic } from "./contracts";
import { dateKey, numeric } from "./forms-contract";
export type ProgressEntry = {
  topicId: string;
  subjectId: string;
  chapter: string | null;
  classLevel: string | null;
  expectedUpdatedAt: string;
  expectedQuestions: number;
  expectedRevisions: number;
  expectedCompleted: boolean;
  questionsDelta: number;
  completed: boolean | null;
  fullRevision: boolean;
  note: string | null;
};
export type ProgressWrite = {
  kind: "progress";
  operationId: string;
  date: string;
  entries: ProgressEntry[];
};
export type ProgressSelection = Record<
  string,
  { selected: boolean; questions: string }
>;
export function prepareProgress(
  subjectId: string,
  topics: Topic[],
  selection: ProgressSelection,
  completed: boolean | null,
  fullRevision: boolean,
  note: string,
  date: string,
  operationId: string,
): ProgressWrite {
  const entries = topics
    .filter((t) => selection[t.id]?.selected)
    .map((topic) => {
      if (
        !topic.updatedAt ||
        !Number.isFinite(Date.parse(topic.updatedAt)) ||
        topic.subjectId !== subjectId ||
        !Number.isInteger(topic._count?.revisions)
      )
        throw new Error("Reload the chapter before updating its progress.");
      const questionsDelta = numeric(
        selection[topic.id].questions,
        100000,
        true,
      );
      if (
        !questionsDelta &&
        !fullRevision &&
        (completed === null || completed === topic.isCompleted)
      )
        return null;
      if (topic.questionsSolved + questionsDelta > 2147483647)
        throw new Error("This question total is too large.");
      return {
        topicId: topic.id,
        subjectId,
        chapter: topic.chapter,
        classLevel: topic.classLevel,
        expectedUpdatedAt: topic.updatedAt,
        expectedQuestions: topic.questionsSolved,
        expectedRevisions: topic._count!.revisions,
        expectedCompleted: topic.isCompleted,
        questionsDelta,
        completed,
        fullRevision,
        note: note.trim() || null,
      };
    })
    .filter((entry): entry is ProgressEntry => entry !== null);
  if (!entries.length)
    throw new Error(
      "Choose a question addition, a changed status or a full revision for the selected topics.",
    );
  if (entries.length > 40) throw new Error("Update up to 40 topics at a time.");
  return { kind: "progress", operationId, date: dateKey(date), entries };
}
export function parseProgressReceipt(
  value: unknown,
  write: ProgressWrite,
): Topic[] {
  const receipt = value as {
    operationId?: unknown;
    kind?: unknown;
    result?: { topics?: unknown };
  } | null;
  if (
    !receipt ||
    receipt.operationId !== write.operationId ||
    receipt.kind !== "progress" ||
    !Array.isArray(receipt.result?.topics) ||
    receipt.result.topics.length !== write.entries.length
  )
    throw new Error(
      "Progress was not confirmed. Keep this review and retry the same save.",
    );
  const topics = receipt.result.topics as Topic[];
  if (new Set(topics.map((t) => t?.id)).size !== topics.length)
    throw new Error("The progress receipt contains duplicate topics.");
  for (const entry of write.entries) {
    const topic = topics.find((t) => t?.id === entry.topicId);
    if (
      !topic ||
      topic.subjectId !== entry.subjectId ||
      topic.chapter !== entry.chapter ||
      topic.classLevel !== entry.classLevel ||
      typeof topic.name !== "string" ||
      !topic.updatedAt ||
      !Number.isFinite(Date.parse(topic.updatedAt)) ||
      topic.questionsSolved !==
        entry.expectedQuestions + entry.questionsDelta ||
      topic.isCompleted !== (entry.completed ?? entry.expectedCompleted) ||
      topic._count?.revisions !==
        entry.expectedRevisions + Number(entry.fullRevision)
    )
      throw new Error(
        "The saved progress did not match your review. Retry the same save or reload the chapter.",
      );
  }
  return topics;
}
