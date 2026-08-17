ALTER TABLE `daily_goals`
    ADD COLUMN `intensityLevel` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `voice_assistant_preferences` (
    `userId` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NOT NULL DEFAULT 'Bubu',
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en-IN',
    `preferredVoice` VARCHAR(191) NULL,
    `speechEnabled` BOOLEAN NOT NULL DEFAULT true,
    `onboardingSeen` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `voice_daily_log_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `logDate` DATE NOT NULL,
    `payloadJson` JSON NOT NULL,
    `createdTaskIdsJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `voice_daily_log_submissions_requestId_key`(`requestId`),
    INDEX `voice_daily_log_submissions_userId_logDate_idx`(`userId`, `logDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tasks`
    MODIFY COLUMN `source` ENUM('MANUAL', 'AI', 'VOICE_ASSISTANT') NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `voiceSubmissionId` VARCHAR(191) NULL;

CREATE INDEX `tasks_voiceSubmissionId_idx` ON `tasks`(`voiceSubmissionId`);

ALTER TABLE `tasks`
    ADD CONSTRAINT `tasks_voiceSubmissionId_fkey`
    FOREIGN KEY (`voiceSubmissionId`) REFERENCES `voice_daily_log_submissions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
