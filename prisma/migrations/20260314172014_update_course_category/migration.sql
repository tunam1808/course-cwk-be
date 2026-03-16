/*
  Warnings:

  - The values [BAN_HANG,EDIT_CO_BAN] on the enum `Course_category` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `course` MODIFY `category` ENUM('CAPCUT_AI', 'BAT_DONG_SAN', 'MIEN_PHI') NOT NULL;
