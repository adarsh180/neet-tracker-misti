CREATE TABLE `practice_test_folders` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL DEFAULT 'misti',
  `name` VARCHAR(80) NOT NULL,
  `color` VARCHAR(24) NOT NULL DEFAULT 'GOLD',
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `practice_test_folders_userId_name_key`(`userId`, `name`),
  INDEX `practice_test_folders_userId_position_createdAt_idx`(`userId`, `position`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `practice_tests`
  ADD COLUMN `folderId` VARCHAR(191) NULL,
  ADD COLUMN `proctorConsentAt` DATETIME(3) NULL,
  ADD COLUMN `proctorReportSentAt` DATETIME(3) NULL,
  ADD COLUMN `proctorReportStatus` VARCHAR(191) NULL;

CREATE INDEX `practice_tests_userId_folderId_createdAt_idx`
  ON `practice_tests`(`userId`, `folderId`, `createdAt`);

ALTER TABLE `practice_tests`
  ADD CONSTRAINT `practice_tests_folderId_fkey`
  FOREIGN KEY (`folderId`) REFERENCES `practice_test_folders`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `practice_performance_analyses` (
  `id` VARCHAR(191) NOT NULL,
  `testId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL DEFAULT 'misti',
  `deterministicJson` JSON NOT NULL,
  `narrativeJson` JSON NULL,
  `model` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'READY',
  `error` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `practice_performance_analyses_testId_createdAt_idx`(`testId`, `createdAt`),
  INDEX `practice_performance_analyses_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `practice_performance_analyses_testId_fkey`
    FOREIGN KEY (`testId`) REFERENCES `practice_tests`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
