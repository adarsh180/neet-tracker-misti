import { createHash, timingSafeEqual } from "node:crypto";

export function constantTimeEquals(provided: string | null | undefined, expected: string | null | undefined) {
  if (!provided || !expected) return false;

  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
