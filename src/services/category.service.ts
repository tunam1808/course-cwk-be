// src/services/category.service.ts
import { prisma } from "../database";
import { v4 as uuidv4 } from "uuid";
import slugify from "slugify";
import { bunnyStorageService } from "./bunny-storage.service";

export class CategoryService {
  /** Lấy tất cả cấp 1 kèm subfolder (admin) */
  static async getAll() {
    return prisma.resourceCategory.findMany({
      orderBy: { order: "asc" },
      include: {
        _count: { select: { subFolders: true } },
        subFolders: {
          orderBy: { order: "asc" },
          include: { _count: { select: { files: true } } },
        },
      },
    });
  }

  /** Lấy chỉ FREE (public) */
  static async getPublic() {
    return prisma.resourceCategory.findMany({
      where: { isVip: false },
      orderBy: { order: "asc" },
      include: {
        _count: { select: { subFolders: true } },
        subFolders: {
          orderBy: { order: "asc" },
          include: { _count: { select: { files: true } } },
        },
      },
    });
  }

  /** Chi tiết 1 category */
  static async getOne(id: number) {
    const cat = await prisma.resourceCategory.findUnique({
      where: { id },
      include: {
        subFolders: {
          orderBy: { order: "asc" },
          include: { _count: { select: { files: true } } },
        },
      },
    });
    if (!cat) throw new Error("Category không tồn tại");
    return cat;
  }

  /** Lấy tất cả category (FREE + VIP) cho public — không cần auth */
  static async getAllPublic() {
    return prisma.resourceCategory.findMany({
      orderBy: { order: "asc" },
      include: {
        _count: { select: { subFolders: true } },
        subFolders: {
          orderBy: { order: "asc" },
          include: { _count: { select: { files: true } } },
        },
      },
    });
  }

  // ✅ FIX 1 — Method mới: kiểm tra VIP guard cho public endpoint
  /** Kiểm tra subfolder có thuộc category VIP không */
  static async isSubFolderVip(subFolderId: number): Promise<boolean> {
    const folder = await prisma.resourceSubFolder.findUnique({
      where: { id: subFolderId },
      select: { category: { select: { isVip: true } } },
    });
    if (!folder) throw new Error("SubFolder không tồn tại");
    return folder.category.isVip;
  }

  /** Tạo folder cấp 1 */
  static async create(name: string, isVip: boolean = true) {
    const slug = slugify(name, { lower: true, locale: "vi", strict: true });

    const exists = await prisma.resourceCategory.findUnique({
      where: { slug },
    });
    if (exists) throw new Error(`Folder "${name}" đã tồn tại`);

    const maxOrder = await prisma.resourceCategory.aggregate({
      _max: { order: true },
    });

    return prisma.resourceCategory.create({
      data: { name, slug, isVip, order: (maxOrder._max.order ?? 0) + 1 },
    });
  }

  /** Đổi tên hoặc toggle isVip */
  static async update(id: number, data: { name?: string; isVip?: boolean }) {
    const cat = await prisma.resourceCategory.findUnique({ where: { id } });
    if (!cat) throw new Error("Category không tồn tại");

    const updateData: { name?: string; slug?: string; isVip?: boolean } = {};

    // ✅ FIX 2 — Dùng !== undefined thay vì truthy check
    if (data.name !== undefined) {
      updateData.name = data.name;
      updateData.slug = slugify(data.name, {
        lower: true,
        locale: "vi",
        strict: true,
      });
    }
    if (data.isVip !== undefined) {
      updateData.isVip = data.isVip;
    }

    return prisma.resourceCategory.update({ where: { id }, data: updateData });
  }

  /** Upload / thay ảnh đại diện */
  static async updateThumbnail(id: number, file: Express.Multer.File) {
    const cat = await prisma.resourceCategory.findUnique({ where: { id } });
    if (!cat) throw new Error("Category không tồn tại");

    const ext = file.originalname.split(".").pop() ?? "jpg";
    const fileKey = `covers/${uuidv4()}.${ext}`;
    const fileUrl = await bunnyStorageService.upload(
      file.buffer,
      fileKey,
      file.mimetype,
    );

    if (cat.thumbnailKey) await bunnyStorageService.delete(cat.thumbnailKey);

    return prisma.resourceCategory.update({
      where: { id },
      data: { thumbnailKey: fileKey, thumbnailUrl: fileUrl },
    });
  }

  /** Xoá folder cấp 1 — cascade xoá subfolder + file DB + Bunny */
  static async delete(id: number) {
    const cat = await prisma.resourceCategory.findUnique({ where: { id } });
    if (!cat) throw new Error("Category không tồn tại");

    const files = await prisma.resourceFile.findMany({
      where: { subFolder: { categoryId: id } },
      select: { fileKey: true },
    });

    const deletePromises = files.map((f) =>
      bunnyStorageService.delete(f.fileKey),
    );
    if (cat.thumbnailKey)
      deletePromises.push(bunnyStorageService.delete(cat.thumbnailKey));

    // ✅ FIX 3 — Log các file Bunny bị lỗi khi xoá
    const results = await Promise.allSettled(deletePromises);
    results.forEach((r, i) => {
      if (r.status === "rejected")
        console.error(
          `[CategoryService.delete] Bunny delete failed [${i}]:`,
          r.reason,
        );
    });

    await prisma.resourceCategory.delete({ where: { id } });
    return { deleted: id };
  }
}
