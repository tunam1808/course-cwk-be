-- DropForeignKey
ALTER TABLE `progress` DROP FOREIGN KEY `Progress_courseId_fkey`;

-- DropForeignKey
ALTER TABLE `progress` DROP FOREIGN KEY `Progress_userId_fkey`;

-- AlterTable
ALTER TABLE `course` ADD COLUMN `order` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `progress` ADD CONSTRAINT `progress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress` ADD CONSTRAINT `progress_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `progress` RENAME INDEX `Progress_userId_courseId_key` TO `progress_userId_courseId_key`;

-- RenameIndex
ALTER TABLE `user` RENAME INDEX `User_email_key` TO `user_email_key`;
