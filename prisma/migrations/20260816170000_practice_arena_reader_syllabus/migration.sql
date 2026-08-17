CREATE TABLE `syllabus_versions` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `exam` VARCHAR(40) NOT NULL DEFAULT 'NEET_UG',
  `examYear` INTEGER NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `sourceUrl` VARCHAR(768) NOT NULL,
  `sourceSha256` VARCHAR(64) NOT NULL,
  `publishedAt` DATE NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'VERIFIED_OFFICIAL',
  `isActive` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `syllabus_versions_slug_key`(`slug`),
  INDEX `syllabus_versions_exam_examYear_isActive_idx`(`exam`, `examYear`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `syllabus_nodes` (
  `id` VARCHAR(191) NOT NULL,
  `versionId` VARCHAR(191) NOT NULL,
  `parentId` VARCHAR(191) NULL,
  `kind` VARCHAR(24) NOT NULL,
  `subject` VARCHAR(32) NOT NULL,
  `classLevel` VARCHAR(4) NULL,
  `code` VARCHAR(32) NULL,
  `title` VARCHAR(191) NOT NULL,
  `canonicalKey` VARCHAR(255) NOT NULL,
  `aliasesJson` JSON NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  `sourcePage` INTEGER NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `syllabus_nodes_versionId_canonicalKey_key`(`versionId`, `canonicalKey`),
  INDEX `syllabus_nodes_versionId_subject_classLevel_kind_position_idx`(`versionId`, `subject`, `classLevel`, `kind`, `position`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ncert_documents` (
  `id` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(32) NOT NULL,
  `classLevel` VARCHAR(4) NOT NULL,
  `chapter` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `edition` VARCHAR(80) NULL,
  `language` VARCHAR(12) NOT NULL DEFAULT 'en',
  `sourceUrl` VARCHAR(768) NOT NULL,
  `sourceSha256` VARCHAR(64) NOT NULL,
  `storagePath` VARCHAR(768) NULL,
  `fileData` LONGBLOB NULL,
  `pageCount` INTEGER NULL,
  `reviewStatus` VARCHAR(40) NOT NULL DEFAULT 'VERIFIED_SOURCE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ncert_documents_subject_classLevel_chapter_edition_language_key`(`subject`, `classLevel`, `chapter`, `edition`, `language`),
  INDEX `ncert_documents_subject_classLevel_chapter_idx`(`subject`, `classLevel`, `chapter`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ncert_passages` (
  `id` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `pageNumber` INTEGER NOT NULL,
  `text` TEXT NOT NULL,
  `normalizedHash` VARCHAR(64) NOT NULL,
  `bboxJson` JSON NULL,
  `reviewStatus` VARCHAR(32) NOT NULL DEFAULT 'NEEDS_REVIEW',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ncert_passages_documentId_normalizedHash_key`(`documentId`, `normalizedHash`),
  INDEX `ncert_passages_documentId_pageNumber_idx`(`documentId`, `pageNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ncert_passage_question_links` (
  `id` VARCHAR(191) NOT NULL,
  `passageId` VARCHAR(191) NOT NULL,
  `bankQuestionId` VARCHAR(191) NOT NULL,
  `linkType` VARCHAR(32) NOT NULL DEFAULT 'DERIVED_FROM',
  `confidence` DOUBLE NOT NULL,
  `reviewStatus` VARCHAR(32) NOT NULL DEFAULT 'NEEDS_REVIEW',
  `reviewNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ncert_passage_question_links_passageId_bankQuestionId_key`(`passageId`, `bankQuestionId`),
  INDEX `ncert_passage_question_links_bankQuestionId_reviewStatus_idx`(`bankQuestionId`, `reviewStatus`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ncert_reader_progress` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(80) NOT NULL DEFAULT 'misti',
  `documentId` VARCHAR(191) NOT NULL,
  `currentPage` INTEGER NOT NULL DEFAULT 1,
  `completedPages` JSON NULL,
  `lastReadAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ncert_reader_progress_userId_documentId_key`(`userId`, `documentId`),
  INDEX `ncert_reader_progress_userId_lastReadAt_idx`(`userId`, `lastReadAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `syllabus_nodes` ADD CONSTRAINT `syllabus_nodes_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `syllabus_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `syllabus_nodes` ADD CONSTRAINT `syllabus_nodes_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `syllabus_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ncert_passages` ADD CONSTRAINT `ncert_passages_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `ncert_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ncert_passage_question_links` ADD CONSTRAINT `ncert_passage_question_links_passageId_fkey` FOREIGN KEY (`passageId`) REFERENCES `ncert_passages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ncert_passage_question_links` ADD CONSTRAINT `ncert_passage_question_links_bankQuestionId_fkey` FOREIGN KEY (`bankQuestionId`) REFERENCES `bank_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ncert_reader_progress` ADD CONSTRAINT `ncert_reader_progress_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `ncert_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
