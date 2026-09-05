import { Router } from "express";
import { subscribePush, unsubscribePush } from "../controllers/push.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.post("/subscribe", authenticate, subscribePush);
router.delete("/subscribe", authenticate, unsubscribePush);

export default router;
