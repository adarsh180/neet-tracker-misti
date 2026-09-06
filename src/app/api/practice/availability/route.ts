import { NextResponse } from "next/server";
import { getServeableOfficialPapers } from "@/lib/question-bank";
import { getPrivateSession } from "@/lib/server-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({error:"Unauthorized"},{status:401});
  const papers = await getServeableOfficialPapers();
  const byYear = new Map<number,{year:number;count:number;complete:boolean;paperCodes:string[]}>();
  for (const paper of papers) {
    const current = byYear.get(paper.year) ?? {year:paper.year,count:0,complete:false,paperCodes:[]};
    current.count=Math.max(current.count,paper.rows.length);
    current.complete ||= paper.rows.length>=180;
    current.paperCodes.push(paper.paperCode);
    byYear.set(paper.year,current);
  }
  return NextResponse.json({pyqYears:[...byYear.values()].sort((a,b)=>b.year-a.year)});
}
