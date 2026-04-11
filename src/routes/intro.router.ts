// routes/intro.route.ts
import { Router } from "express";
import { IntroController } from "../controllers/intro.controller";
// import { verifyToken, isAdmin } from "../middleware/auth.middleware";

const router = Router();

/* ===================== PUBLIC ROUTE ===================== */
// Lấy tất cả intro (trả về array của 3 slot)
router.get("/", IntroController.getIntro);

/* ===================== ADMIN ROUTES ===================== */
// Tạo video slot mới trên Bunny.net (lấy videoId)
router.post("/prepare", IntroController.prepareUpload);

// Tạo signature để upload TUS
router.post("/sign", IntroController.signUpload);

// Lưu videoId + slot vào database
router.post("/save", IntroController.saveIntro);

// Xóa video theo slot (1, 2 hoặc 3)
router.delete("/:slot", IntroController.deleteIntro);

export default router;
