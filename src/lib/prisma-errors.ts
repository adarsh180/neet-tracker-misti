import { Prisma } from "@prisma/client";

export function isPrismaConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    message.includes("Can't reach database server") ||
    message.includes("Can't reach database") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ENOTFOUND") ||
    message.includes("P1001")
  );
}
