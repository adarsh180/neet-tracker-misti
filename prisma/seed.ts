import { PrismaClient } from "@prisma/client";
import { SYLLABUS } from "../src/lib/syllabus";

const db = new PrismaClient();

async function main() {
  console.log("🌸 Seeding NEET Tracker database...");

  for (const sub of SYLLABUS) {
    // Upsert subject
    const subject = await db.subject.upsert({
      where: { slug: sub.slug },
      update: {},
      create: {
        slug: sub.slug,
        name: sub.name,
        emoji: sub.emoji,
        color: sub.color,
      },
    });

    console.log(`✓ ${sub.name} (${sub.chapters.length} chapters)`);

    for (const chapter of sub.chapters) {
      for (const topicName of chapter.topics) {
        // Check if topic already exists
        const exists = await db.topic.findFirst({
          where: { subjectId: subject.id, name: topicName, chapter: chapter.name },
        });

        if (!exists) {
          await db.topic.create({
            data: {
              subjectId: subject.id,
              name: topicName,
              chapter: chapter.name,
              classLevel: chapter.classLevel,
            },
          });
        }
      }
    }
  }

  console.log("✓ All subjects and topics seeded successfully!");
  console.log("🎯 NEET Tracker is ready for Divyani!");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => db.$disconnect());
