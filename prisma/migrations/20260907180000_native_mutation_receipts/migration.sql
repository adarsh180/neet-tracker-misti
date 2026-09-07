-- Additive only. No changes to student records or existing tables.
CREATE TABLE `native_mutations` (
  `id` VARCHAR(80) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `payloadHash` VARCHAR(64) NOT NULL,
  `resultJson` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `native_mutations_userId_createdAt_idx` (`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
