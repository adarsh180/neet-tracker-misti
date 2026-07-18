CREATE TABLE `question_visual_assets` (
  `id` VARCHAR(191) NOT NULL,
  `contentHash` VARCHAR(64) NOT NULL,
  `mimeType` VARCHAR(80) NOT NULL,
  `kind` VARCHAR(40) NOT NULL,
  `altText` TEXT NOT NULL,
  `byteSize` INTEGER NOT NULL,
  `fileData` LONGBLOB NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `question_visual_assets_contentHash_key`(`contentHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bank_questions` ADD COLUMN `visualAssetId` VARCHAR(191) NULL;
CREATE INDEX `bank_questions_visualAssetId_idx` ON `bank_questions`(`visualAssetId`);
ALTER TABLE `bank_questions`
  ADD CONSTRAINT `bank_questions_visualAssetId_fkey`
  FOREIGN KEY (`visualAssetId`) REFERENCES `question_visual_assets`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
