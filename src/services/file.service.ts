// src/services/file.service.ts
import { prisma } from "../database";
import { ResourceFileType } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { bunnyStorageService } from "./bunny-storage.service";
import { MIME_TO_FILE_TYPE } from "../types/resource.types";
import type { Response } from "express";

const { ZipArchive } = require("archiver");

export class FileService {
  /** Detect fileType ưu tiên extension trước, fallback sang MIME */
  private static detectFileType(file: Express.Multer.File): ResourceFileType {
    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "cube") return "LUT";
    if (["gif", "jpeg", "jpg", "png"].includes(ext)) return "IMAGE";
    if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "FONT";
    if (["mp3", "wav", "ogg", "flac", "aac"].includes(ext)) return "MP3";
    if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "MP4";

    const fromMime = MIME_TO_FILE_TYPE[file.mimetype];
    if (fromMime) return fromMime;

    throw new Error(`Định dạng không hỗ trợ: ${file.mimetype} (.${ext})`);
  }

  /** Fetch file về buffer, retry tối đa maxRetries lần */
  private static async fetchBuffer(
    url: string,
    maxRetries = 3,
  ): Promise<Buffer | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
          console.warn(
            `Fetch failed (attempt ${attempt}): HTTP ${response.status} — ${url}`,
          );
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err: any) {
        console.warn(
          `Fetch error (attempt ${attempt}): ${err?.message} — ${url}`,
        );
        if (attempt < maxRetries)
          await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  }

  /** Upload file cấp 3 vào subfolder */
  static async upload(
    data: { name: string; description?: string; subFolderId: number },
    file: Express.Multer.File,
  ) {
    const sub = await prisma.resourceSubFolder.findUnique({
      where: { id: data.subFolderId },
      include: { category: true },
    });
    if (!sub) throw new Error("SubFolder không tồn tại");

    const fileType = FileService.detectFileType(file);

    const ext = file.originalname.split(".").pop() ?? "bin";
    const fileKey = `resources/${sub.category.slug}/${sub.slug}/${uuidv4()}.${ext}`;
    const fileUrl = await bunnyStorageService.upload(
      file.buffer,
      fileKey,
      file.mimetype,
    );

    return prisma.resourceFile.create({
      data: {
        name: data.name,
        description: data.description,
        subFolderId: data.subFolderId,
        fileName: file.originalname,
        fileKey,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileType,
      },
    });
  }

  /** Danh sách file theo subfolder (có phân trang) */
  static async getFiles(query: {
    subFolderId?: number;
    page?: number;
    limit?: number;
  }) {
    const { subFolderId, page = 1, limit = 30 } = query;
    const where = subFolderId ? { subFolderId } : {};
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.resourceFile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.resourceFile.count({ where }),
    ]);

    return {
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Chi tiết file */
  static async getOne(id: number) {
    const file = await prisma.resourceFile.findUnique({
      where: { id },
      include: { subFolder: { include: { category: true } } },
    });
    if (!file) throw new Error("File không tồn tại");
    return file;
  }

  /** Cập nhật name/description */
  static async update(
    id: number,
    data: { name?: string; description?: string },
  ) {
    const file = await prisma.resourceFile.findUnique({ where: { id } });
    if (!file) throw new Error("File không tồn tại");
    return prisma.resourceFile.update({ where: { id }, data });
  }

  /** Xoá file — Bunny + DB */
  static async delete(id: number) {
    const file = await prisma.resourceFile.findUnique({ where: { id } });
    if (!file) throw new Error("File không tồn tại");
    await bunnyStorageService.delete(file.fileKey);
    await prisma.resourceFile.delete({ where: { id } });
    return { deleted: id };
  }

  /** Tăng download count */
  static async incrementDownload(id: number) {
    return prisma.resourceFile.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
  }

  /** Stream ZIP toàn bộ file trong subfolder về client */
  static async streamZip(subFolderId: number, res: Response) {
    const [files, sub] = await Promise.all([
      prisma.resourceFile.findMany({
        where: { subFolderId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.resourceSubFolder.findUnique({
        where: { id: subFolderId },
      }),
    ]);

    if (files.length === 0) {
      throw new Error("Folder không có file nào");
    }

    const zipName = `${sub?.name ?? "folder"}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(zipName)}"`,
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    const archive = new ZipArchive({ zlib: { level: 1 } });

    archive.on("error", (err: Error) => {
      console.error("Archive error:", err);
    });

    archive.on("warning", (err: Error) => {
      console.warn("Archive warning:", err);
    });

    archive.pipe(res);

    for (const file of files) {
      const urlExt = file.fileUrl.split("?")[0].match(/\.([a-zA-Z0-9]+)$/)?.[1];
      const nameHasExt = /\.[a-zA-Z0-9]{2,5}$/.test(file.name);
      const fileName = nameHasExt
        ? file.name
        : urlExt
          ? `${file.name}.${urlExt.toLowerCase()}`
          : file.name;

      // Download toàn bộ về buffer trước, tránh stream bị đứt giữa chừng
      const buffer = await FileService.fetchBuffer(file.fileUrl);
      if (!buffer) {
        console.error("Skip file after retries:", file.name);
        continue;
      }

      archive.append(buffer, { name: fileName });
    }

    await archive.finalize();
  }
}
