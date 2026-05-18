// src/controllers/resource.controller.ts
import { Request, Response, NextFunction } from "express";
import { CategoryService } from "../services/category.service";
import { SubFolderService } from "../services/subfolder.service";
import { FileService } from "../services/file.service";

type H = (req: Request, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: H) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);

// ════════════════════════════════════════════════════════════════════
// CẤP 1 — Category
// ════════════════════════════════════════════════════════════════════
export const categoryController = {
  /** GET /admin/resource-categories */
  getAll: wrap(async (_req, res) => {
    const data = await CategoryService.getAll();
    res.json({ data });
  }),

  /** GET /admin/resource-categories/:id */
  getOne: wrap(async (req, res) => {
    const data = await CategoryService.getOne(Number(req.params.id));
    res.json({ data });
  }),

  /** POST /admin/resource-categories  body: { name, isVip? } */
  create: wrap(async (req, res) => {
    const { name, isVip } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Tên không được để trống" });
    const data = await CategoryService.create(
      name.trim(),
      isVip !== undefined ? Boolean(isVip) : true,
    );
    res.status(201).json({ message: "Tạo folder thành công", data });
  }),

  /** PATCH /admin/resource-categories/:id  body: { name?, isVip? } */
  update: wrap(async (req, res) => {
    const { name, isVip } = req.body;
    if (name !== undefined && !name?.trim())
      return res.status(400).json({ message: "Tên không được để trống" });
    const data = await CategoryService.update(Number(req.params.id), {
      name: name?.trim(),
      isVip:
        isVip !== undefined ? isVip === true || isVip === "true" : undefined,
    });
    res.json({ message: "Cập nhật thành công", data });
  }),

  /** PATCH /admin/resource-categories/:id/thumbnail  field: thumbnail */
  updateThumbnail: wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Chưa có ảnh" });
    const data = await CategoryService.updateThumbnail(
      Number(req.params.id),
      req.file,
    );
    res.json({ message: "Cập nhật ảnh đại diện thành công", data });
  }),

  /** DELETE /admin/resource-categories/:id */
  remove: wrap(async (req, res) => {
    await CategoryService.delete(Number(req.params.id));
    res.json({ message: "Xoá thành công" });
  }),
};

// ════════════════════════════════════════════════════════════════════
// CẤP 2 — SubFolder
// ════════════════════════════════════════════════════════════════════
export const subFolderController = {
  /** GET /admin/resource-subfolders?categoryId= */
  getByCategory: wrap(async (req, res) => {
    const { categoryId } = req.query as { categoryId?: string };
    if (!categoryId)
      return res.status(400).json({ message: "categoryId là bắt buộc" });
    const data = await SubFolderService.getByCategory(Number(categoryId));
    res.json({ data });
  }),

  /** GET /admin/resource-subfolders/:id */
  getOne: wrap(async (req, res) => {
    const data = await SubFolderService.getOne(Number(req.params.id));
    res.json({ data });
  }),

  /** POST /admin/resource-subfolders  body: { name, categoryId } */
  create: wrap(async (req, res) => {
    const { name, categoryId } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Tên không được để trống" });
    if (!categoryId)
      return res.status(400).json({ message: "categoryId là bắt buộc" });
    const data = await SubFolderService.create(name.trim(), Number(categoryId));
    res.status(201).json({ message: "Tạo folder con thành công", data });
  }),

  /** PATCH /admin/resource-subfolders/:id  body: { name?, order? } */
  update: wrap(async (req, res) => {
    const { name, order } = req.body;
    const data = await SubFolderService.update(Number(req.params.id), {
      name: name?.trim(),
      order: order !== undefined ? Number(order) : undefined,
    });
    res.json({ message: "Cập nhật thành công", data });
  }),

  /** DELETE /admin/resource-subfolders/:id */
  remove: wrap(async (req, res) => {
    await SubFolderService.delete(Number(req.params.id));
    res.json({ message: "Xoá thành công" });
  }),
};

// ════════════════════════════════════════════════════════════════════
// CẤP 3 — File tài nguyên
// ════════════════════════════════════════════════════════════════════
export const fileController = {
  /**
   * POST /admin/resource-files
   * multipart/form-data: file, name, description?, subFolderId
   */
  upload: wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "File là bắt buộc" });
    const { name, description, subFolderId } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Tên không được để trống" });
    if (!subFolderId)
      return res.status(400).json({ message: "subFolderId là bắt buộc" });

    const data = await FileService.upload(
      {
        name: name.trim(),
        description: description?.trim(),
        subFolderId: Number(subFolderId),
      },
      req.file,
    );
    res.status(201).json({ message: "Upload thành công", data });
  }),

  /** GET /admin/resource-files?subFolderId=&page=&limit= */
  getList: wrap(async (req, res) => {
    const {
      subFolderId,
      page = "1",
      limit = "30",
    } = req.query as Record<string, string>;
    const data = await FileService.getFiles({
      subFolderId: subFolderId ? Number(subFolderId) : undefined,
      page: Number(page),
      limit: Number(limit),
    });
    res.json({ data });
  }),

  /** GET /admin/resource-files/:id */
  getOne: wrap(async (req, res) => {
    const data = await FileService.getOne(Number(req.params.id));
    res.json({ data });
  }),

  /** PATCH /admin/resource-files/:id */
  update: wrap(async (req, res) => {
    const { name, description } = req.body;
    const data = await FileService.update(Number(req.params.id), {
      name: name?.trim(),
      description: description?.trim(),
    });
    res.json({ message: "Cập nhật thành công", data });
  }),

  /** DELETE /admin/resource-files/:id */
  remove: wrap(async (req, res) => {
    await FileService.delete(Number(req.params.id));
    res.json({ message: "Xoá file thành công" });
  }),

  // ── Public ────────────────────────────────────────────────────────

  /**
   * GET /resource-categories  (FE public)
   * Chỉ trả về FREE; VIP bị ẩn với user thường
   */
  publicCategories: wrap(async (_req, res) => {
    const data = await CategoryService.getPublic();
    res.json({ data });
  }),

  /**
   * GET /resource-files?subFolderId=  (FE public)
   * ✅ Chặn truy cập file thuộc category VIP
   */
  publicFiles: wrap(async (req, res) => {
    const {
      subFolderId,
      page = "1",
      limit = "30",
    } = req.query as Record<string, string>;

    if (subFolderId) {
      const isVip = await CategoryService.isSubFolderVip(Number(subFolderId));
      if (isVip)
        return res.status(403).json({ message: "Nội dung chỉ dành cho VIP" });
    }

    const data = await FileService.getFiles({
      subFolderId: subFolderId ? Number(subFolderId) : undefined,
      page: Number(page),
      limit: Number(limit),
    });
    res.json({ data });
  }),

  /**
   * POST /resource-files/:id/download  (FE public — đếm lượt tải)
   * ✅ Chặn đếm download nếu file thuộc category VIP
   */
  trackDownload: wrap(async (req, res) => {
    const file = await FileService.getOne(Number(req.params.id));
    if (file.subFolder.category.isVip)
      return res.status(403).json({ message: "Nội dung chỉ dành cho VIP" });
    await FileService.incrementDownload(file.id);
    res.json({ success: true });
  }),

  /** GET /resource-categories/all  (public — trả về cả FREE lẫn VIP, không có file) */
  publicAllCategories: wrap(async (_req, res) => {
    const data = await CategoryService.getAllPublic();
    res.json({ data });
  }),
};
