import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildErrorLogAnalytics, getErrorLogMemory } from "@/lib/error-log-analysis";

const prisma = db as unknown as {
  errorLogTest: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
  errorLogQuestion: {
    update: (args: unknown) => Promise<unknown>;
  };
  $transaction: (queries: unknown[]) => Promise<unknown>;
};

const allowedQuestionFields = [
  "questionSummary",
  "subject",
  "chapter",
  "topic",
  "attemptStatus",
  "outcome",
  "correctAnswer",
  "whyCorrect",
  "whereLacked",
  "contentStatus",
  "outOfSyllabus",
  "notStudied",
  "difficulty",
  "confidence",
  "timeSpentSeconds",
  "reasonTags",
  "actionFix",
  "notes",
] as const;

function normalizeQuestion(input: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of allowedQuestionFields) {
    if (field in input) data[field] = input[field];
  }

  for (const key of ["questionSummary", "chapter", "topic", "correctAnswer", "whyCorrect", "whereLacked", "actionFix", "notes"]) {
    if (typeof data[key] === "string") data[key] = String(data[key]).trim() || null;
  }

  if (typeof data.subject === "string") data.subject = data.subject.trim() || "Physics";
  if (typeof data.difficulty !== "string") data.difficulty = "MEDIUM";
  data.confidence = data.confidence === null || data.confidence === "" ? null : Number(data.confidence);
  data.timeSpentSeconds = data.timeSpentSeconds === null || data.timeSpentSeconds === "" ? null : Number(data.timeSpentSeconds);
  if (!Number.isFinite(data.confidence as number)) data.confidence = null;
  if (!Number.isFinite(data.timeSpentSeconds as number)) data.timeSpentSeconds = null;
  if (!Array.isArray(data.reasonTags)) data.reasonTags = [];
  data.outOfSyllabus = Boolean(data.outOfSyllabus);
  data.notStudied = Boolean(data.notStudied);

  return data;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    if (!Array.isArray(body.questions)) {
      return NextResponse.json({ error: "Expected questions array" }, { status: 400 });
    }

    const updates = body.questions.map((q: any) => {
      return prisma.errorLogQuestion.update({
        where: { id: String(q.id) },
        data: normalizeQuestion(q),
      });
    });

    await prisma.$transaction(updates);

    const log = await prisma.errorLogTest.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { questionNumber: "asc" } },
        analyses: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    if (!log) return NextResponse.json({ error: "Error log not found" }, { status: 404 });
    const [memory] = await Promise.all([getErrorLogMemory()]);
    
    return NextResponse.json({
      ...log,
      analytics: buildErrorLogAnalytics((log as { questions: [] }).questions),
      memory,
    });
  } catch (err) {
    console.error("[error-logs-batch]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
