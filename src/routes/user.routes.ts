import { Router } from "express";
import { UserController } from "../controllers/user.controller";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Chỉ ADMIN mới được dùng 4 API này
router.post("/", authenticate, authorizeAdmin, UserController.createUser);
router.get("/", authenticate, authorizeAdmin, UserController.getUsers);
router.put("/:id", authenticate, authorizeAdmin, UserController.updateUser);
router.delete("/:id", authenticate, authorizeAdmin, UserController.deleteUser);

export default router;
