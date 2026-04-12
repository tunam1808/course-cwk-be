/*
  Warnings:

  - You are about to drop the `countdownsetting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `countdownsetting`;

-- CreateTable
CREATE TABLE `countdown_setting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `visible` BOOLEAN NOT NULL DEFAULT false,
    `startTime` DATETIME(3) NULL,
    `durationMs` BIGINT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
