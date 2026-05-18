// src/services/bunny-storage.service.ts
// Dành riêng cho Storage Zone tài nguyên edit — tách biệt hoàn toàn với Bunny Stream (video khóa học)

import axios from "axios";

const ZONE = process.env.BUNNY_STORAGE_ZONE_NAME!;
const API_KEY = process.env.BUNNY_STORAGE_API_KEY!;
const HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME!; // sg.storage.bunnycdn.com
const CDN_URL = (process.env.BUNNY_STORAGE_CDN_URL || "").replace(/\/$/, "");

const http = axios.create({
  baseURL: `https://${HOSTNAME}/${ZONE}`,
  headers: { AccessKey: API_KEY },
});

export const bunnyStorageService = {
  /**
   * Upload buffer lên Bunny Storage Zone
   * @param buffer   - File buffer từ multer memoryStorage
   * @param fileKey  - Path đích trên storage, vd: "resources/nhac-nen/lo-fi/uuid.mp3"
   * @param mimeType - MIME type của file
   * @returns CDN URL public để download
   */
  async upload(
    buffer: Buffer,
    fileKey: string,
    mimeType: string,
  ): Promise<string> {
    await http.put(`/${fileKey}`, buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return `${CDN_URL}/${fileKey}`;
  },

  /**
   * Xoá file khỏi Bunny Storage Zone
   * Không throw nếu file không tồn tại
   */
  async delete(fileKey: string): Promise<void> {
    await http.delete(`/${fileKey}`).catch(() => {});
  },

  /**
   * Build CDN URL từ fileKey (không cần gọi API)
   */
  getCdnUrl(fileKey: string): string {
    return `${CDN_URL}/${fileKey}`;
  },
};
