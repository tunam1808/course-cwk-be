-- AlterTable
ALTER TABLE `course` ADD COLUMN `videoUrl` VARCHAR(191) NULL,
    MODIFY `duration` INTEGER NULL,
    MODIFY `fileSize` DOUBLE NULL;
