ALTER TABLE `voice_assistant_preferences`
  ADD COLUMN `onboardingVersion` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `interactionMode` VARCHAR(191) NOT NULL DEFAULT 'TAP',
  ADD COLUMN `affectionMode` VARCHAR(191) NOT NULL DEFAULT 'WARM',
  ADD COLUMN `discreetMode` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `assistant_actions` (
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `utterance` TEXT NOT NULL,
  `payloadJson` JSON NOT NULL,
  `resultJson` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `undoneAt` DATETIME(3) NULL,

  UNIQUE INDEX `assistant_actions_requestId_key` (`requestId`),
  INDEX `assistant_actions_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `assistant_actions_userId_status_idx` (`userId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE `voice_assistant_preferences`
SET `onboardingSeen` = false, `onboardingVersion` = 0;
