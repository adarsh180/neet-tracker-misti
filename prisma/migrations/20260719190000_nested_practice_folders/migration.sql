ALTER TABLE `practice_test_folders`
  ADD COLUMN `parentId` VARCHAR(191) NULL;

CREATE INDEX `practice_test_folders_userId_parentId_position_createdAt_idx`
  ON `practice_test_folders`(`userId`, `parentId`, `position`, `createdAt`);

ALTER TABLE `practice_test_folders`
  ADD CONSTRAINT `practice_test_folders_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `practice_test_folders`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
