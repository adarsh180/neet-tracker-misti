import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { reviewedReaderLink } from "@/lib/reader-quality";
import { isStrictlyServeableBankRow } from "@/lib/question-bank";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const selectedIndex = body.selectedIndex;
  if (!questionId || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
    return NextResponse.json({ error: "A valid question and option are required" }, { status: 400 });
  }
  const link = await db.ncertPassageQuestionLink.findFirst({
    where: {
      bankQuestionId: questionId,
      ...reviewedReaderLink,
      passage: { documentId: id, reviewStatus: "VERIFIED", document: { reviewStatus: "VERIFIED_SOURCE" } },
    },
    include: { bankQuestion: true },
  });
  if (!link || !isStrictlyServeableBankRow(link.bankQuestion)) return NextResponse.json({ error: "Reviewed linked question not available" }, { status: 404 });
  const question = link.bankQuestion;
  const correct = selectedIndex === question.correctIndex;
  await db.ncertQuestionAttempt.create({
    data: {
      userId: session.userId,
      documentId: id,
      bankQuestionId: question.id,
      selectedIndex,
      correct,
    },
  });
  const optionExplanations = Array.isArray(question.optionExplanationsJson)
    ? question.optionExplanationsJson.map(String)
    : [];
  return NextResponse.json({
    correct,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    optionExplanations,
    feedback: correct
      ? "Brilliant connection! You used the NCERT idea exactly the way the examiner expected."
      : "That was a useful attempt. Mistakes here are revision signals—not setbacks. Re-read the highlighted line, then compare every option below.",
  });
}
