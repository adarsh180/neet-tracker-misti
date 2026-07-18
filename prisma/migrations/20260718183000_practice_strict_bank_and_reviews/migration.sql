ALTER TABLE `practice_tests`
  ADD COLUMN `userId` VARCHAR(191) NOT NULL DEFAULT 'misti';

ALTER TABLE `bank_questions`
  ADD COLUMN `optionExplanationsJson` JSON NULL,
  ADD COLUMN `verificationMethod` VARCHAR(48) NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN `verificationVersion` VARCHAR(48) NULL,
  ADD COLUMN `selectionKey` VARCHAR(64) NULL,
  ADD COLUMN `exam` VARCHAR(40) NULL,
  ADD COLUMN `examYear` INTEGER NULL,
  ADD COLUMN `paperCode` VARCHAR(80) NULL,
  ADD COLUMN `paperQuestionNumber` INTEGER NULL,
  ADD COLUMN `provenanceJson` JSON NULL;

UPDATE `bank_questions`
SET
  `selectionKey` = `contentHash`,
  `verificationMethod` = CASE
    WHEN `qualityStatus` = 'VERIFIED_STRICT' AND `verified` = TRUE THEN 'AUTOMATED_DOUBLE_BLIND_LEGACY'
    ELSE 'UNVERIFIED'
  END,
  `verificationVersion` = CASE
    WHEN `qualityStatus` = 'VERIFIED_STRICT' AND `verified` = TRUE THEN 'legacy-v1'
    ELSE NULL
  END;

CREATE TABLE `practice_question_reviews` (
  `id` VARCHAR(191) NOT NULL,
  `testId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(80) NOT NULL,
  `questionNumber` INTEGER NOT NULL,
  `bankQuestionId` VARCHAR(191) NULL,
  `subject` VARCHAR(191) NOT NULL,
  `chapter` VARCHAR(191) NOT NULL,
  `topic` VARCHAR(191) NULL,
  `selectedIndex` INTEGER NULL,
  `correctIndex` INTEGER NOT NULL,
  `outcome` VARCHAR(191) NOT NULL,
  `mistakeTag` VARCHAR(191) NULL,
  `customMistakeText` TEXT NULL,
  `timeSpentSeconds` INTEGER NULL,
  `reviewComplete` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `practice_question_reviews_testId_questionId_key`(`testId`, `questionId`),
  INDEX `practice_question_reviews_testId_outcome_idx`(`testId`, `outcome`),
  INDEX `practice_question_reviews_mistakeTag_updatedAt_idx`(`mistakeTag`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `practice_question_reviews_testId_fkey` FOREIGN KEY (`testId`) REFERENCES `practice_tests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `practice_report_artifacts` (
  `id` VARCHAR(191) NOT NULL,
  `testId` VARCHAR(191) NOT NULL,
  `revisionHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'READY',
  `pathname` VARCHAR(768) NULL,
  `downloadUrl` VARCHAR(768) NULL,
  `byteSize` INTEGER NULL,
  `error` TEXT NULL,
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `practice_report_artifacts_revisionHash_key`(`revisionHash`),
  INDEX `practice_report_artifacts_testId_generatedAt_idx`(`testId`, `generatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `practice_report_artifacts_testId_fkey` FOREIGN KEY (`testId`) REFERENCES `practice_tests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `practice_tests_userId_status_createdAt_idx`
  ON `practice_tests`(`userId`, `status`, `createdAt`);

CREATE INDEX `bq_qv_scd_idx`
  ON `bank_questions`(`qualityStatus`, `verified`, `subject`, `chapter`, `difficulty`);

CREATE INDEX `bq_qv_scld_idx`
  ON `bank_questions`(`qualityStatus`, `verified`, `subject`, `classLevel`, `difficulty`);

CREATE INDEX `bq_qv_pyq_idx`
  ON `bank_questions`(`qualityStatus`, `verified`, `examYear`, `paperCode`, `paperQuestionNumber`);
