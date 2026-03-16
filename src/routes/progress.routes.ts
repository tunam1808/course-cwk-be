import { Router } from "express";
import { ProgressController } from "../controllers/progress.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", authenticate, ProgressController.getProgress);
router.post("/:courseId", authenticate, ProgressController.markComplete);
router.delete("/:courseId", authenticate, ProgressController.markIncomplete);

export default router;
