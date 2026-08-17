import { NextRequest, NextResponse } from "next/server";

import { CHAPTERS, SUBJECT_SLUGS } from "@/data/syllabus/neet-chapters";
import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });
  const needle = query.toLowerCase();

  const subjectResults = SUBJECT_SLUGS
    .map((slug) => ({ slug, label: slug[0].toUpperCase() + slug.slice(1) }))
    .filter((entry) => entry.label.toLowerCase().includes(needle))
    .map((entry) => ({
      id: `subject:${entry.slug}`,
      type: "SUBJECT",
      title: entry.label,
      subtitle: "Open subject workspace",
      href: `/subjects/${entry.slug}`,
    }));

  const chapterResults = CHAPTERS
    .filter((entry) => `${entry.subject} ${entry.chapter} ${entry.aliases.join(" ")}`.toLowerCase().includes(needle))
    .slice(0, 12)
    .map((entry) => ({
      id: `chapter:${entry.slug}:${entry.classLevel}:${entry.chapter}`,
      type: "CHAPTER",
      title: entry.chapter,
      subtitle: `Class ${entry.classLevel} · ${entry.subject}`,
      href: `/subjects/${entry.slug}?chapter=${encodeURIComponent(entry.chapter)}`,
    }));

  const topicRows = await db.topic.findMany({
    where: {
      OR: [{ name: { contains: query } }, { chapter: { contains: query } }],
    },
    include: { subject: { select: { slug: true, name: true } } },
    orderBy: [{ chapterOrder: "asc" }, { topicOrder: "asc" }],
    take: 12,
  });
  const topicResults = topicRows.map((topic) => ({
    id: `topic:${topic.id}`,
    type: "TOPIC",
    title: topic.name,
    subtitle: `${topic.subject.name}${topic.chapter ? ` · ${topic.chapter}` : ""}`,
    href: `/subjects/${topic.subject.slug}?chapter=${encodeURIComponent(topic.chapter ?? "General Topics")}&topic=${encodeURIComponent(topic.name)}`,
  }));

  return NextResponse.json({ results: [...subjectResults, ...chapterResults, ...topicResults].slice(0, 24) });
}

