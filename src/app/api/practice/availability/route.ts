import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const papers = await db.bankQuestion.groupBy({
    by: ["examYear", "paperCode"],
    where: {
      exam: "NEET_UG",
      source: "NEET_PYQ",
      qualityStatus: "VERIFIED_STRICT",
      verified: true,
      verificationMethod: "OFFICIAL_PAPER_KEY_VERIFIED",
      examYear: { not: null },
      paperCode: { not: null },
      paperQuestionNumber: { not: null },
    },
    _count: { _all: true },
  });
  const byYear = new Map<number, { year: number; count: number; complete: boolean; paperCodes: string[] }>();
  for (const paper of papers) {
    if (!paper.examYear || !paper.paperCode) continue;
    const current = byYear.get(paper.examYear) ?? { year: paper.examYear, count: 0, complete: false, paperCodes: [] };
    current.count = Math.max(current.count, paper._count._all);
    current.complete = current.complete || paper._count._all >= 180;
    current.paperCodes.push(paper.paperCode);
    byYear.set(paper.examYear, current);
  }
  return NextResponse.json({ pyqYears: [...byYear.values()].sort((a, b) => b.year - a.year) });
}
