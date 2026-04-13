import { Router } from "express";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";
import {
  getCountdown,
  updateCountdown,
  getLuckySetting,
  updateLuckySetting,
} from "../controllers/countdown.controller";

const router = Router();

router.get("/", getCountdown);
router.put("/", authenticate, authorizeAdmin, updateCountdown);

// ─── Lucky Number ─────────────────────────────────────────────────────────────
router.get("/lucky", getLuckySetting);
router.put("/lucky", authenticate, authorizeAdmin, updateLuckySetting);

export default router;
