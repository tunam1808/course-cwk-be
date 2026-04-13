-- CreateTable
CREATE TABLE IF NOT EXISTS `countdown_setting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `visible` BOOLEAN NOT NULL DEFAULT false,
    `startTime` DATETIME(3) NULL,
    `durationMs` BIGINT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;