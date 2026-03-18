import { Router } from "express";
import multer from "multer";
import { CourseController } from "../controllers/course.controller";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 6 * 1024 * 1024 * 1024,
  },
});

const router = Router();

router.get("/", CourseController.getCourses);
router.post(
  "/prepare-upload",
  authenticate,
  authorizeAdmin,
  CourseController.prepareUpload,
);
router.post("/save", authenticate, authorizeAdmin, CourseController.saveCourse);
router.post(
  "/",
  authenticate,
  authorizeAdmin,
  upload.single("video"),
  CourseController.createCourse,
);
router.put(
  "/:id",
  authenticate,
  authorizeAdmin,
  upload.single("video"),
  CourseController.updateCourse,
);
router.delete(
  "/:id",
  authenticate,
  authorizeAdmin,
  CourseController.deleteCourse,
);

export default router;
