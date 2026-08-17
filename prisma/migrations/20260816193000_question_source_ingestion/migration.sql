CREATE TABLE `question_source_artifacts` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `artifactKind` VARCHAR(32) NOT NULL,
  `exam` VARCHAR(40) NOT NULL DEFAULT 'NEET_UG',
  `examYear` INTEGER NULL,
  `paperCode` VARCHAR(80) NULL,
  `sourcePageUrl` VARCHAR(768) NOT NULL,
  `assetUrl` VARCHAR(768) NOT NULL,
  `mimeType` VARCHAR(120) NULL,
  `sha256` VARCHAR(64) NULL,
  `byteSize` INTEGER NULL,
  `storagePath` VARCHAR(768) NULL,
  `crawlStatus` VARCHAR(32) NOT NULL DEFAULT 'DISCOVERED',
  `metadataJson` JSON NULL,
  `fetchedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `question_source_artifacts_assetUrl_key`(`assetUrl`),
  INDEX `qsa_provider_year_kind_idx`(`provider`, `examYear`, `artifactKind`),
  INDEX `qsa_sha_idx`(`sha256`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `question_ingestion_candidates` (
  `id` VARCHAR(191) NOT NULL,
  `exam` VARCHAR(40) NOT NULL DEFAULT 'NEET_UG',
  `examYear` INTEGER NOT NULL,
  `paperCode` VARCHAR(80) NOT NULL,
  `paperQuestionNumber` INTEGER NOT NULL,
  `subject` VARCHAR(32) NULL,
  `classLevel` VARCHAR(4) NULL,
  `chapter` VARCHAR(191) NULL,
  `topic` VARCHAR(191) NULL,
  `question` TEXT NULL,
  `optionsJson` JSON NULL,
  `correctIndicesJson` JSON NULL,
  `explanation` TEXT NULL,
  `optionExplanationsJson` JSON NULL,
  `normalizedHash` VARCHAR(64) NULL,
  `extractionStatus` VARCHAR(32) NOT NULL DEFAULT 'DISCOVERED',
  `verificationStatus` VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  `verificationJson` JSON NULL,
  `reviewReasonsJson` JSON NULL,
  `matchedBankQuestionId` VARCHAR(191) NULL,
  `matchScore` DOUBLE NULL,
  `promotionStatus` VARCHAR(32) NOT NULL DEFAULT 'STAGED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `qic_exam_paper_question_uq`(`exam`, `examYear`, `paperCode`, `paperQuestionNumber`),
  INDEX `qic_verification_promotion_year_idx`(`verificationStatus`, `promotionStatus`, `examYear`),
  INDEX `qic_hash_idx`(`normalizedHash`),
  INDEX `qic_bank_match_idx`(`matchedBankQuestionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `question_source_evidence` (
  `id` VARCHAR(191) NOT NULL,
  `candidateId` VARCHAR(191) NOT NULL,
  `artifactId` VARCHAR(191) NOT NULL,
  `pageNumber` INTEGER NULL,
  `bboxJson` JSON NULL,
  `cropPath` VARCHAR(768) NULL,
  `cropSha256` VARCHAR(64) NULL,
  `extractedJson` JSON NULL,
  `answerIndicesJson` JSON NULL,
  `extractionMethod` VARCHAR(80) NULL,
  `confidence` DOUBLE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `qse_candidate_artifact_uq`(`candidateId`, `artifactId`),
  INDEX `qse_artifact_page_idx`(`artifactId`, `pageNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `question_ingestion_candidates` ADD CONSTRAINT `question_ingestion_candidates_matchedBankQuestionId_fkey` FOREIGN KEY (`matchedBankQuestionId`) REFERENCES `bank_questions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `question_source_evidence` ADD CONSTRAINT `question_source_evidence_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `question_ingestion_candidates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `question_source_evidence` ADD CONSTRAINT `question_source_evidence_artifactId_fkey` FOREIGN KEY (`artifactId`) REFERENCES `question_source_artifacts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
