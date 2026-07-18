CREATE TABLE `question_bookmarks` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL DEFAULT 'misti',
  `contentHash` VARCHAR(64) NOT NULL,
  `bankQuestionId` VARCHAR(191) NULL,
  `sourceTestId` VARCHAR(191) NULL,
  `sourceQuestionId` VARCHAR(80) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `classLevel` VARCHAR(191) NULL,
  `chapter` VARCHAR(191) NOT NULL,
  `topic` VARCHAR(191) NULL,
  `questionJson` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `question_bookmarks_userId_contentHash_key`(`userId`, `contentHash`),
  INDEX `question_bookmarks_userId_subject_classLevel_chapter_idx`(`userId`, `subject`, `classLevel`, `chapter`),
  INDEX `question_bookmarks_bankQuestionId_idx`(`bankQuestionId`),
  INDEX `question_bookmarks_sourceTestId_idx`(`sourceTestId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `question_bookmarks`
  ADD CONSTRAINT `question_bookmarks_bankQuestionId_fkey`
  FOREIGN KEY (`bankQuestionId`) REFERENCES `bank_questions`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `question_bookmarks`
  ADD CONSTRAINT `question_bookmarks_sourceTestId_fkey`
  FOREIGN KEY (`sourceTestId`) REFERENCES `practice_tests`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
