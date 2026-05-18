// src/services/file.service.ts
import { prisma } from "../database";
import { v4 as uuidv4 } from "uuid";
import { bunnyStorageService } from "./bunny-storage.service";
import { MIME_TO_FILE_TYPE } from "../types/resource.types";

export class FileService {
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

    const fileType = MIME_TO_FILE_TYPE[file.mimetype];
    if (!fileType) throw new Error(`Định dạng không hỗ trợ: ${file.mimetype}`);

    const ext = file.originalname.split(".").pop() ?? "bin";
    // Path: resources/{category-slug}/{subfolder-slug}/{uuid}.{ext}
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
}
