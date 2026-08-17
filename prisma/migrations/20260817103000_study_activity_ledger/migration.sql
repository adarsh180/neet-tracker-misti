ALTER TABLE `voice_daily_log_submissions`
    ADD COLUMN `undoneAt` DATETIME(3) NULL;

-- Introduce the expanded chapter-aware assistant once, even for the existing private user.
UPDATE `voice_assistant_preferences` SET `onboardingSeen` = false;

CREATE TABLE `study_activities` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL DEFAULT 'misti',
    `date` DATE NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `chapter` VARCHAR(191) NOT NULL,
    `kind` ENUM('NEW_LEARNING', 'PRACTICE', 'REVISION', 'TEST_REVIEW') NOT NULL DEFAULT 'PRACTICE',
    `coverage` ENUM('PARTIAL', 'FULL') NOT NULL DEFAULT 'PARTIAL',
    `hoursStudied` DOUBLE NOT NULL DEFAULT 0,
    `questionsDelta` INTEGER NOT NULL DEFAULT 0,
    `intensityLevel` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `weakConcepts` TEXT NULL,
    `completionConfirmed` BOOLEAN NOT NULL DEFAULT false,
    `source` ENUM('MANUAL', 'VOICE_ASSISTANT') NOT NULL DEFAULT 'MANUAL',
    `voiceSubmissionId` VARCHAR(191) NULL,
    `undoneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `study_activities_userId_date_idx`(`userId`, `date`),
    INDEX `study_activities_subjectId_chapter_idx`(`subjectId`, `chapter`),
    INDEX `study_activities_topicId_date_idx`(`topicId`, `date`),
    INDEX `study_activities_voiceSubmissionId_idx`(`voiceSubmissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `revision_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL DEFAULT 'misti',
    `subjectId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `chapter` VARCHAR(191) NOT NULL,
    `coverage` ENUM('PARTIAL', 'FULL') NOT NULL DEFAULT 'PARTIAL',
    `note` TEXT NULL,
    `source` ENUM('MANUAL', 'VOICE_ASSISTANT') NOT NULL DEFAULT 'MANUAL',
    `voiceSubmissionId` VARCHAR(191) NULL,
    `revisedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `undoneAt` DATETIME(3) NULL,
    INDEX `revision_sessions_userId_revisedAt_idx`(`userId`, `revisedAt`),
    INDEX `revision_sessions_subjectId_chapter_idx`(`subjectId`, `chapter`),
    INDEX `revision_sessions_topicId_revisedAt_idx`(`topicId`, `revisedAt`),
    INDEX `revision_sessions_voiceSubmissionId_idx`(`voiceSubmissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `revisions`
    ADD COLUMN `revisionSessionId` VARCHAR(191) NULL;

CREATE INDEX `revisions_revisionSessionId_idx` ON `revisions`(`revisionSessionId`);

ALTER TABLE `study_activities`
    ADD CONSTRAINT `study_activities_subjectId_fkey`
    FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `study_activities_topicId_fkey`
    FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `study_activities_voiceSubmissionId_fkey`
    FOREIGN KEY (`voiceSubmissionId`) REFERENCES `voice_daily_log_submissions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `revision_sessions`
    ADD CONSTRAINT `revision_sessions_subjectId_fkey`
    FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `revision_sessions_topicId_fkey`
    FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `revision_sessions_voiceSubmissionId_fkey`
    FOREIGN KEY (`voiceSubmissionId`) REFERENCES `voice_daily_log_submissions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `revisions`
    ADD CONSTRAINT `revisions_revisionSessionId_fkey`
    FOREIGN KEY (`revisionSessionId`) REFERENCES `revision_sessions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
