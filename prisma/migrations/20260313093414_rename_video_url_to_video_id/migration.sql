/*
  Warnings:

  - You are about to drop the column `videoUrl` on the `course` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `course` DROP COLUMN `videoUrl`,
    ADD COLUMN `videoId` VARCHAR(191) NULL;
