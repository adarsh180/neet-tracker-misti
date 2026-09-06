import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";
import { reviewedReaderLink } from "@/lib/reader-quality";
import { isStrictlyServeableBankRow } from "@/lib/question-bank";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const document = await db.ncertDocument.findFirst({
    where: { id, reviewStatus: "VERIFIED_SOURCE" },
    select: {
      id: true,
      title: true,
      subject: true,
      classLevel: true,
      chapter: true,
      edition: true,
      pageCount: true,
      readerProgress: { where: { userId: session.userId }, take: 1, select: { currentPage: true } },
      passages: {
        where: { reviewStatus: "VERIFIED", questionLinks: { some: reviewedReaderLink } },
        select: {
          id: true,
          pageNumber: true,
          text: true,
          bboxJson: true,
          questionLinks: {
            where: reviewedReaderLink,
            select: {
              bankQuestion: true,
            },
          },
        },
        orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!document) return NextResponse.json({ error: "Reader chapter not found" }, { status: 404 });
  return NextResponse.json({
    document: {
      id: document.id,
      title: document.title,
      subject: document.subject,
      classLevel: document.classLevel,
      chapter: document.chapter,
      edition: document.edition,
      pageCount: document.pageCount,
      currentPage: document.readerProgress[0]?.currentPage ?? 1,
    },
    passages: document.passages.map((passage) => ({
      id: passage.id,
      pageNumber: passage.pageNumber,
      text: passage.text,
      bbox: passage.bboxJson,
      questions: passage.questionLinks.filter(({ bankQuestion }) => isStrictlyServeableBankRow(bankQuestion)).map(({ bankQuestion }) => ({
        id: bankQuestion.id,
        subject: bankQuestion.subject,
        chapter: bankQuestion.chapter,
        topic: bankQuestion.topic,
        sourceRef: bankQuestion.sourceRef,
        examYear: bankQuestion.examYear,
        question: bankQuestion.question,
        options: bankQuestion.optionsJson,
        visualAssetUrl: bankQuestion.visualAssetUrl,
        visualAssetAlt: bankQuestion.visualAssetAlt,
      })),
    })).filter(passage => passage.questions.length > 0),
  });
}
