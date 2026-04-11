-- Xóa row cũ không có slot
DELETE FROM `intro`;

-- Thêm cột slot
ALTER TABLE `intro` ADD COLUMN `slot` INTEGER NOT NULL;

-- Tạo unique index
CREATE UNIQUE INDEX `intro_slot_key` ON `intro`(`slot`);