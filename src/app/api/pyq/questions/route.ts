import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim().slice(0, 120);
  const year = Number(params.get("year"));
  const subject = params.get("subject")?.trim();
  const classLevel = params.get("classLevel")?.trim();
  const chapter = params.get("chapter")?.trim();
  const difficulty = params.get("difficulty")?.trim();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = 20;
  const where: Prisma.BankQuestionWhereInput = {
    source: "NEET_PYQ",
    exam: "NEET_UG",
    qualityStatus: "VERIFIED_STRICT",
    verified: true,
    examYear: Number.isInteger(year) && year >= 1988 ? year : undefined,
    subject: subject || undefined,
    classLevel: classLevel === "11" || classLevel === "12" ? classLevel : undefined,
    chapter: chapter || undefined,
    difficulty: ["EASY", "MODERATE", "TOUGH"].includes(difficulty ?? "") ? difficulty : undefined,
    OR: query ? [{ question: { contains: query } }, { topic: { contains: query } }, { chapter: { contains: query } }, { sourceRef: { contains: query } }] : undefined,
  };
  const [questions, total, facets] = await Promise.all([
    db.bankQuestion.findMany({ where, orderBy: [{ examYear: "desc" }, { paperCode: "asc" }, { paperQuestionNumber: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.bankQuestion.count({ where }),
    db.bankQuestion.groupBy({
      by: ["examYear", "subject", "classLevel", "chapter"],
      where: { source: "NEET_PYQ", exam: "NEET_UG", qualityStatus: "VERIFIED_STRICT", verified: true },
      _count: { _all: true },
      orderBy: { examYear: "desc" },
    }),
  ]);
  return NextResponse.json({
    total,
    page,
    pageSize,
    facets: facets.map((entry) => ({ ...entry, count: entry._count._all, _count: undefined })),
    questions: questions.map((question) => ({
      id: question.id,
      subject: question.subject,
      classLevel: question.classLevel,
      chapter: question.chapter,
      topic: question.topic,
      difficulty: question.difficulty,
      examYear: question.examYear,
      paperCode: question.paperCode,
      paperQuestionNumber: question.paperQuestionNumber,
      sourceRef: question.sourceRef,
      question: question.question,
      options: question.optionsJson,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      optionExplanations: question.optionExplanationsJson,
      visualAssetUrl: question.visualAssetUrl,
      provenance: question.provenanceJson,
    })),
  });
}

