import { Router } from "express";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";
import {
  getCountdown,
  updateCountdown,
} from "../controllers/countdown.controller";

const router = Router();

router.get("/", getCountdown);
router.put("/", authenticate, authorizeAdmin, updateCountdown);

export default router;
