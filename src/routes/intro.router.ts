import { Router } from "express";
import { IntroController } from "../controllers/intro.controller";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";

const router = Router();

/* ===================== PUBLIC ROUTE ===================== */
router.get("/", IntroController.getIntro);

/* ===================== ADMIN ROUTES ===================== */
router.post(
  "/prepare",
  authenticate,
  authorizeAdmin,
  IntroController.prepareUpload,
);
router.post("/sign", authenticate, authorizeAdmin, IntroController.signUpload);
router.post("/save", authenticate, authorizeAdmin, IntroController.saveIntro);
router.delete(
  "/:slot",
  authenticate,
  authorizeAdmin,
  IntroController.deleteIntro,
);

export default router;
