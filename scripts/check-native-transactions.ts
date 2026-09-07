// Exercise the real MySQL transaction path, then roll back every fixture.
// No test subject, task, daily log, screen record or receipt is committed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { parseNativeWrite } from "../src/lib/native-input";
import { saveNative } from "../src/lib/native-save";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
const rollback = new Error("ROLLBACK_NATIVE_QA");
async function main() {
  let passed = 0;
  try {
    await db.$transaction(async tx => {
      let savepoint = 0;
      const adapter = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
        const name = `native_qa_${++savepoint}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } } as unknown as PrismaClient;
      const subject = await tx.subject.create({ data: { name: "Native transaction fixture", slug: `native-qa-${randomUUID()}`, color: "#000000", emoji: "" } });
      const userId = `qa-${randomUUID()}`;
      const taskWrite = parseNativeWrite({ operationId: randomUUID(), kind: "task", task: { id: null, expectedUpdatedAt: null, title: "Native transaction fixture", description: null, subjectId: subject.id, dueDate: "2026-01-02", plannedMinutes: 45, priority: "HIGH" } });
      const receipt = await saveNative(adapter, userId, taskWrite) as { result: { id: string; updatedAt: string } };
      assert.deepEqual(await saveNative(adapter, userId, taskWrite), receipt);
      assert.equal(await tx.task.count({ where: { subjectId: subject.id } }), 1);
      assert.equal(await tx.taskTimelineEvent.count({ where: { taskId: receipt.result.id } }), 1);
      console.log("PASS same operation saves one task and one timeline event"); passed++;
      if (taskWrite.kind !== "task") throw new Error("Fixture type");
      await assert.rejects(() => saveNative(adapter, userId, { ...taskWrite, task: { ...taskWrite.task, title: "Different payload" } }), /different edit/);
      console.log("PASS operation ID reuse with changed content rejected"); passed++;
      await tx.task.update({ where: { id: receipt.result.id }, data: { title: "A newer website edit", updatedAt: new Date("2026-02-01T00:00:00.000Z") } });
      await assert.rejects(() => saveNative(adapter, userId, { ...taskWrite, operationId: randomUUID(), task: { ...taskWrite.task, id: receipt.result.id, expectedUpdatedAt: receipt.result.updatedAt } }), /another device/);
      console.log("PASS stale task edit cannot overwrite newer data"); passed++;
      await tx.task.delete({ where: { id: receipt.result.id } });
      assert.deepEqual(await saveNative(adapter, userId, taskWrite), receipt);
      assert.equal(await tx.task.count({ where: { subjectId: subject.id } }), 0);
      console.log("PASS retry after deletion returns receipt without recreating task"); passed++;
      const entry = { subjectId: subject.id, expectedUpdatedAt: null, hoursStudied: 2, questionsSolved: 80, intensityLevel: 4, disciplineScore: 80, completionPercent: 90, notes: null };
      const write = parseNativeWrite({ operationId: randomUUID(), kind: "day", date: "2001-01-01", entries: [entry], screen: null });
      await saveNative(adapter, userId, write);
      const previous = await tx.dailyGoal.findUniqueOrThrow({ where: { subjectId_date: { subjectId: subject.id, date: new Date("2001-01-01") } } });
      await saveNative(adapter, userId, write);
      assert.equal(await tx.dailyGoal.count({ where: { subjectId: subject.id } }), 1);
      console.log("PASS daily retry does not add hours or duplicate questions"); passed++;
      const badBatch = parseNativeWrite({ operationId: randomUUID(), kind: "day", date: "2001-01-01", entries: [{ ...entry, expectedUpdatedAt: previous.updatedAt.toISOString(), hoursStudied: 3 }, { ...entry, subjectId: "zz-native-missing-fixture" }], screen: null });
      await assert.rejects(() => saveNative(adapter, userId, badBatch), /no longer exists/);
      assert.equal((await tx.dailyGoal.findUniqueOrThrow({ where: { id: previous.id } })).hoursStudied, 2);
      assert.equal(await tx.nativeMutation.count({ where: { id: `${userId}:${badBatch.operationId}` } }), 0);
      console.log("PASS failed batch rolls back earlier subjects and receipt"); passed++;
      const stale = parseNativeWrite({ operationId: randomUUID(), kind: "day", date: "2001-01-01", entries: [entry], screen: null });
      await assert.rejects(() => saveNative(adapter, userId, stale), /another device/);
      console.log("PASS missing-version daily overwrite rejected"); passed++;
      throw rollback;
    }, { isolationLevel: "ReadCommitted", timeout: 120000, maxWait: 10000 });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(`${passed} transaction checks passed; all fixture records rolled back.`);
}
main().finally(() => db.$disconnect());
