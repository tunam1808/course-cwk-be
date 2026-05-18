// src/types/resource.types.ts
import { ResourceFileType } from "@prisma/client";

// ── MIME type → ResourceFileType ─────────────────────────────────────
export const MIME_TO_FILE_TYPE: Record<string, ResourceFileType> = {
  // Audio → MP3
  "audio/mpeg": "MP3",
  "audio/wav": "MP3",
  "audio/ogg": "MP3",
  "audio/flac": "MP3",
  "audio/aac": "MP3",
  "audio/x-wav": "MP3",

  // Video → MP4
  "video/mp4": "MP4",
  "video/quicktime": "MP4",
  "video/x-msvideo": "MP4",
  "video/webm": "MP4",
  "video/x-matroska": "MP4",

  // Font → FONT
  "font/ttf": "FONT",
  "font/otf": "FONT",
  "font/woff": "FONT",
  "font/woff2": "FONT",
  "application/x-font-ttf": "FONT",
  "application/x-font-otf": "FONT",
  "application/zip": "FONT", // zip chứa bộ font
  "application/x-zip-compressed": "FONT",
  "application/octet-stream": "FONT", // fallback font bị detect sai mime
};

export const ALLOWED_MIMES = Object.keys(MIME_TO_FILE_TYPE);
export const THUMBNAIL_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const MAX_FILE_SIZE =
  parseInt(process.env.MAX_FILE_SIZE_MB || "500") * 1024 * 1024;
export const MAX_THUMB_SIZE =
  parseInt(process.env.MAX_THUMB_SIZE_MB || "5") * 1024 * 1024;
