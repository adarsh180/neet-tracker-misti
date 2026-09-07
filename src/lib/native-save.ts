import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { checkVersion, NativeInputError, type NativeWrite } from "./native-input";
import { saveNativeProgress } from "./native-progress";

export async function saveNative(db: PrismaClient, userId: string, write: NativeWrite) {
  const id = `${userId}:${write.operationId}`;
  const hash = createHash("sha256").update(JSON.stringify(write)).digest("hex");
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // TiDB does not support SERIALIZABLE. Serialize native writes for this
        // account using a reserved guard row, then read committed versions.
        // Operation UUIDs cannot collide with the reserved ':lock' identifier.
        const lockId = `${userId}:lock`;
        await tx.nativeMutation.upsert({ where: { id: lockId },
          create: { id: lockId, userId, payloadHash: "LOCK", resultJson: {} },
          update: { payloadHash: "LOCK" } });
        await tx.$queryRaw`SELECT id FROM native_mutations WHERE id = ${lockId} FOR UPDATE`;
        const receipt = await tx.nativeMutation.findUnique({ where: { id } });
        if (receipt) {
          if (receipt.userId !== userId || receipt.payloadHash !== hash) throw new NativeInputError("This save identifier already belongs to a different edit.", 409);
          return receipt.resultJson;
        }
        let result: unknown;
        if (write.kind === "progress") {
          result = await saveNativeProgress(tx, userId, write);
        } else if (write.kind === "task") {
          const { id: taskId, expectedUpdatedAt, dueDate, ...fields } = write.task;
          if (fields.subjectId && !await tx.subject.findUnique({ where: { id: fields.subjectId }, select: { id: true } })) throw new NativeInputError("This subject no longer exists.", 409);
          const data = { ...fields, dueDate: dueDate ? new Date(dueDate) : null };
          const include = { subject: { select: { name: true, slug: true } } };
          if (taskId) {
            const existing = await tx.task.findUnique({ where: { id: taskId } });
            if (!existing) throw new NativeInputError("This task no longer exists. Reload your board.", 409);
            checkVersion(existing.updatedAt, expectedUpdatedAt);
            result = await tx.task.update({ where: { id: taskId, updatedAt: existing.updatedAt }, data: { ...data, timelineEvents: { create: { type: "UPDATED", label: "Task edited in the app" } } }, include });
          } else {
            checkVersion(null, expectedUpdatedAt);
            const last = await tx.task.findFirst({ orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
            result = await tx.task.create({ data: { ...data, source: "MANUAL", orderIndex: (last?.orderIndex ?? -1) + 1,
              timelineEvents: { create: { type: "CREATED", label: "Task created in the app" } } }, include });
          }
        } else {
          const date = new Date(write.date);
          const existing = await tx.dailyGoal.findMany({ where: { date } });
          const untouchedHours = existing.filter(row => !write.entries.some(e => e.subjectId === row.subjectId)).reduce((sum, row) => sum + row.hoursStudied, 0);
          if (untouchedHours + write.entries.reduce((sum, row) => sum + row.hoursStudied, 0) > 24) throw new NativeInputError("The saved and edited entries together exceed 24 study hours.", 409);
          for (const entry of write.entries) {
            const { expectedUpdatedAt, subjectId, ...fields } = entry;
            const previous = existing.find(row => row.subjectId === subjectId);
            checkVersion(previous?.updatedAt ?? null, expectedUpdatedAt);
            if (!await tx.subject.findUnique({ where: { id: subjectId }, select: { id: true } })) throw new NativeInputError("A selected subject no longer exists. Reload the day.", 409);
            // Zero is an explicit rest record; skipping is omission, never deletion.
            if (previous) await tx.dailyGoal.update({ where: { id: previous.id, updatedAt: previous.updatedAt }, data: fields });
            else await tx.dailyGoal.create({ data: { ...fields, subjectId, date } });
          }
          if (write.screen) {
            const { expectedUpdatedAt, ...fields } = write.screen;
            const where = { userId_date: { userId, date } };
            const previous = await tx.screenTimeLog.findUnique({ where });
            checkVersion(previous?.updatedAt ?? null, expectedUpdatedAt);
            if (previous) await tx.screenTimeLog.update({ where: { id: previous.id, updatedAt: previous.updatedAt }, data: fields });
            else await tx.screenTimeLog.create({ data: { userId, date, ...fields } });
          }
          result = { date: write.date, entries: await tx.dailyGoal.findMany({ where: { date } }),
            screen: await tx.screenTimeLog.findUnique({ where: { userId_date: { userId, date } } }) };
        }
        const json = JSON.parse(JSON.stringify({ operationId: write.operationId, kind: write.kind, result })) as Prisma.InputJsonValue;
        await tx.nativeMutation.create({ data: { id, userId, payloadHash: hash, resultJson: json } });
        return json;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 12000 });
    } catch (error) {
      // The entire transaction rolled back. A duplicate-key race re-reads the
      // durable receipt; it never repeats a committed write or timeline event.
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 2) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new NativeInputError("This record changed on another device. Reload it and review your edits.", 409);
      throw error;
    }
  }
}
