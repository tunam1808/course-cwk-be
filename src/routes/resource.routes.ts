// src/routes/resource.routes.ts
import { Router } from "express";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";
import {
  uploadResource,
  uploadThumbnail,
} from "../middlewares/upload.middleware";
import {
  categoryController,
  subFolderController,
  fileController,
} from "../controllers/resource.controller";

const router = Router();

// ════════════════════════════════════════════════════════════════════
// PUBLIC — FE gọi, không cần auth
// ════════════════════════════════════════════════════════════════════
router.get("/resource-categories/all", fileController.publicAllCategories);
router.get("/resource-categories", fileController.publicCategories);
router.get("/resource-files", fileController.publicFiles);
router.post("/resource-files/:id/download", fileController.trackDownload);

// ════════════════════════════════════════════════════════════════════
// ADMIN — cần authenticate + authorizeAdmin
// ════════════════════════════════════════════════════════════════════

// ── CẤP 1: Category ─────────────────────────────────────────────────
router.get(
  "/admin/resource-categories",
  authenticate,
  authorizeAdmin,
  categoryController.getAll,
);
router.get(
  "/admin/resource-categories/:id",
  authenticate,
  authorizeAdmin,
  categoryController.getOne,
);
router.post(
  "/admin/resource-categories",
  authenticate,
  authorizeAdmin,
  categoryController.create,
);
router.patch(
  "/admin/resource-categories/:id",
  authenticate,
  authorizeAdmin,
  categoryController.update,
);
router.patch(
  "/admin/resource-categories/:id/thumbnail",
  authenticate,
  authorizeAdmin,
  uploadThumbnail,
  categoryController.updateThumbnail,
);
router.delete(
  "/admin/resource-categories/:id",
  authenticate,
  authorizeAdmin,
  categoryController.remove,
);

// ── CẤP 2: SubFolder ────────────────────────────────────────────────
router.get(
  "/admin/resource-subfolders",
  authenticate,
  authorizeAdmin,
  subFolderController.getByCategory,
);
router.get(
  "/admin/resource-subfolders/:id",
  authenticate,
  authorizeAdmin,
  subFolderController.getOne,
);
router.post(
  "/admin/resource-subfolders",
  authenticate,
  authorizeAdmin,
  subFolderController.create,
);
router.patch(
  "/admin/resource-subfolders/:id",
  authenticate,
  authorizeAdmin,
  subFolderController.update,
);
router.delete(
  "/admin/resource-subfolders/:id",
  authenticate,
  authorizeAdmin,
  subFolderController.remove,
);

// ── CẤP 3: File ─────────────────────────────────────────────────────
router.post(
  "/admin/resource-files",
  authenticate,
  authorizeAdmin,
  uploadResource,
  fileController.upload,
);
router.get(
  "/admin/resource-files",
  authenticate,
  authorizeAdmin,
  fileController.getList,
);
router.get(
  "/admin/resource-files/:id",
  authenticate,
  authorizeAdmin,
  fileController.getOne,
);
router.patch(
  "/admin/resource-files/:id",
  authenticate,
  authorizeAdmin,
  fileController.update,
);
router.delete(
  "/admin/resource-files/:id",
  authenticate,
  authorizeAdmin,
  fileController.remove,
);

export default router;
