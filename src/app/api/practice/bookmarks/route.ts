import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { PracticeQuestion } from "@/lib/practice-engine";
import { getPrivateSession } from "@/lib/server-auth";
import { cleanQuestionOptions, cleanQuestionText } from "@/lib/text-cleanup";

export const dynamic = "force-dynamic";

function questionHash(question: PracticeQuestion) {
  const stem = cleanQuestionText(question.question).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const options = cleanQuestionOptions(question.options).map((option) => option.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase());
  return createHash("sha256").update(`${stem}\n${options.join("\n")}`).digest("hex");
}

async function ownedCompletedQuestion(userId: string, testId: string, questionId: string) {
  const test = await db.practiceTest.findFirst({ where: { id: testId, userId, status: "COMPLETED" } });
  if (!test) throw new Error("Completed test not found");
  const questions = (test.questionsJson as unknown as PracticeQuestion[]) ?? [];
  const question = questions.find((entry) => entry.id === questionId);
  if (!question) throw new Error("Question not found in this test");
  const bank = question.bankId
    ? await db.bankQuestion.findUnique({ where: { id: question.bankId }, select: { id: true, contentHash: true, classLevel: true } })
    : null;
  return { test, question, bank, contentHash: bank?.contentHash ?? questionHash(question) };
}

function snapshot(question: PracticeQuestion) {
  return {
    id: question.id,
    subject: question.subject,
    chapter: question.chapter,
    topic: question.topic,
    source: question.source,
    sourceRef: cleanQuestionText(question.sourceRef),
    difficulty: question.difficulty,
    question: cleanQuestionText(question.question),
    options: cleanQuestionOptions(question.options),
    correctIndex: question.correctIndex,
    explanation: cleanQuestionText(question.explanation),
    optionExplanations: cleanQuestionOptions(question.optionExplanations ?? []),
    visualAssetUrl: question.visualAssetUrl ?? null,
    visualAssetAlt: question.visualAssetAlt ? cleanQuestionText(question.visualAssetAlt) : null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const testId = request.nextUrl.searchParams.get("testId");
  if (testId) {
    const test = await db.practiceTest.findFirst({ where: { id: testId, userId: session.userId, status: "COMPLETED" } });
    if (!test) return NextResponse.json({ error: "Completed test not found" }, { status: 404 });
    const questions = (test.questionsJson as unknown as PracticeQuestion[]) ?? [];
    const bankIds = questions.map((question) => question.bankId).filter((id): id is string => Boolean(id));
    const banks = bankIds.length
      ? await db.bankQuestion.findMany({ where: { id: { in: bankIds } }, select: { id: true, contentHash: true } })
      : [];
    const bankHashes = new Map(banks.map((bank) => [bank.id, bank.contentHash]));
    const hashes = questions.map((question) => bankHashes.get(question.bankId ?? "") ?? questionHash(question));
    const bookmarks = hashes.length
      ? await db.questionBookmark.findMany({ where: { userId: session.userId, contentHash: { in: hashes } }, select: { contentHash: true } })
      : [];
    const bookmarkedHashes = new Set(bookmarks.map((bookmark) => bookmark.contentHash));
    return NextResponse.json({
      bookmarkedQuestionIds: questions
        .filter((question) => bookmarkedHashes.has(bankHashes.get(question.bankId ?? "") ?? questionHash(question)))
        .map((question) => question.id),
    });
  }

  const bookmarks = await db.questionBookmark.findMany({
    where: { userId: session.userId },
    orderBy: [{ subject: "asc" }, { classLevel: "asc" }, { chapter: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({
    bookmarks: bookmarks.map((bookmark) => ({
      id: bookmark.id,
      contentHash: bookmark.contentHash,
      subject: bookmark.subject,
      classLevel: bookmark.classLevel,
      chapter: bookmark.chapter,
      topic: bookmark.topic,
      question: bookmark.questionJson,
      sourceTestId: bookmark.sourceTestId,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const testId = String(body.testId ?? "");
  const questionId = String(body.questionId ?? "");
  if (!testId || !questionId) return NextResponse.json({ error: "testId and questionId are required" }, { status: 400 });
  try {
    const { question, bank, contentHash } = await ownedCompletedQuestion(session.userId, testId, questionId);
    const bookmark = await db.questionBookmark.upsert({
      where: { userId_contentHash: { userId: session.userId, contentHash } },
      create: {
        userId: session.userId,
        contentHash,
        bankQuestionId: bank?.id ?? null,
        sourceTestId: testId,
        sourceQuestionId: questionId,
        subject: question.subject,
        classLevel: bank?.classLevel ?? null,
        chapter: question.chapter,
        topic: question.topic,
        questionJson: snapshot(question) as unknown as Prisma.InputJsonValue,
      },
      update: {
        bankQuestionId: bank?.id ?? null,
        sourceTestId: testId,
        sourceQuestionId: questionId,
        subject: question.subject,
        classLevel: bank?.classLevel ?? null,
        chapter: question.chapter,
        topic: question.topic,
        questionJson: snapshot(question) as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ bookmark }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not bookmark question" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const result = await db.questionBookmark.deleteMany({ where: { id, userId: session.userId } });
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }
  const testId = request.nextUrl.searchParams.get("testId") ?? "";
  const questionId = request.nextUrl.searchParams.get("questionId") ?? "";
  try {
    const { contentHash } = await ownedCompletedQuestion(session.userId, testId, questionId);
    await db.questionBookmark.deleteMany({ where: { userId: session.userId, contentHash } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove bookmark" }, { status: 400 });
  }
}
