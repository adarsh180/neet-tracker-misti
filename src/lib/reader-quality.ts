import type { Prisma } from "@prisma/client";

// An automatic keyword match is a candidate, not proof of a historical derivation.
export const reviewedReaderLink = {
  reviewStatus: "VERIFIED",
  reviewNote: { startsWith: "HUMAN_REVIEWED:" },
  bankQuestion: { verified: true, qualityStatus: "VERIFIED_STRICT" },
} satisfies Prisma.NcertPassageQuestionLinkWhereInput;
