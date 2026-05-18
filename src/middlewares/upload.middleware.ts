// src/middlewares/upload.middleware.ts
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import {
  ALLOWED_MIMES,
  THUMBNAIL_MIMES,
  MAX_FILE_SIZE,
  MAX_THUMB_SIZE,
} from "../types/resource.types";

const mem = multer.memoryStorage();

// ── File tài nguyên (mp3, mp4, font...) ─────────────────────────────
export const uploadResource = multer({
  storage: mem,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    ALLOWED_MIMES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Định dạng không hỗ trợ: ${file.mimetype}`));
  },
}).single("file");

// ── Ảnh thumbnail folder cấp 1 ───────────────────────────────────────
export const uploadThumbnail = multer({
  storage: mem,
  limits: { fileSize: MAX_THUMB_SIZE, files: 1 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    THUMBNAIL_MIMES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Ảnh phải là jpg/png/webp/gif`));
  },
}).single("thumbnail");
