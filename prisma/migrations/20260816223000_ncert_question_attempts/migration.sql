CREATE TABLE `ncert_question_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(80) NOT NULL DEFAULT 'misti',
    `documentId` VARCHAR(191) NOT NULL,
    `bankQuestionId` VARCHAR(191) NOT NULL,
    `selectedIndex` INTEGER NOT NULL,
    `correct` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `nqa_user_document_created_idx`(`userId`, `documentId`, `createdAt`),
    INDEX `nqa_question_correct_created_idx`(`bankQuestionId`, `correct`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ncert_question_attempts`
    ADD CONSTRAINT `ncert_question_attempts_documentId_fkey`
    FOREIGN KEY (`documentId`) REFERENCES `ncert_documents`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ncert_question_attempts`
    ADD CONSTRAINT `ncert_question_attempts_bankQuestionId_fkey`
    FOREIGN KEY (`bankQuestionId`) REFERENCES `bank_questions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
