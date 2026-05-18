// src/services/subfolder.service.ts
import { prisma } from "../database";
import { bunnyStorageService } from "./bunny-storage.service";
import slugify from "slugify";

export class SubFolderService {
  /** Danh sách subfolder theo category */
  static async getByCategory(categoryId: number) {
    return prisma.resourceSubFolder.findMany({
      where: { categoryId },
      orderBy: { order: "asc" },
      include: { _count: { select: { files: true } } },
    });
  }

  /** Chi tiết 1 subfolder */
  static async getOne(id: number) {
    const sub = await prisma.resourceSubFolder.findUnique({
      where: { id },
      include: {
        category: true,
        _count: { select: { files: true } },
      },
    });
    if (!sub) throw new Error("SubFolder không tồn tại");
    return sub;
  }

  /** Tạo folder cấp 2 */
  static async create(name: string, categoryId: number) {
    const cat = await prisma.resourceCategory.findUnique({
      where: { id: categoryId },
    });
    if (!cat) throw new Error("Category không tồn tại");

    const slug = slugify(name, { lower: true, locale: "vi", strict: true });

    const exists = await prisma.resourceSubFolder.findFirst({
      where: { categoryId, slug },
    });
    if (exists)
      throw new Error(`Folder "${name}" đã tồn tại trong category này`);

    const maxOrder = await prisma.resourceSubFolder.aggregate({
      where: { categoryId },
      _max: { order: true },
    });

    return prisma.resourceSubFolder.create({
      data: { name, slug, categoryId, order: (maxOrder._max.order ?? 0) + 1 },
    });
  }

  /** Đổi tên / thứ tự subfolder */
  static async update(id: number, data: { name?: string; order?: number }) {
    const sub = await prisma.resourceSubFolder.findUnique({ where: { id } });
    if (!sub) throw new Error("SubFolder không tồn tại");

    return prisma.resourceSubFolder.update({
      where: { id },
      data: {
        ...(data.name && {
          name: data.name,
          slug: slugify(data.name, { lower: true, locale: "vi", strict: true }),
        }),
        ...(data.order !== undefined && { order: data.order }),
      },
    });
  }

  /** Xoá folder cấp 2 — cascade xoá file DB + Bunny */
  static async delete(id: number) {
    const sub = await prisma.resourceSubFolder.findUnique({ where: { id } });
    if (!sub) throw new Error("SubFolder không tồn tại");

    const files = await prisma.resourceFile.findMany({
      where: { subFolderId: id },
      select: { fileKey: true },
    });

    await Promise.allSettled(
      files.map((f) => bunnyStorageService.delete(f.fileKey)),
    );
    await prisma.resourceSubFolder.delete({ where: { id } });
    return { deleted: id };
  }
}
