import { Router } from "express";
import {
  getScoreReasons,
  createScoreReason,
  updateScoreReason,
  deleteScoreReason,
  getStudentScoreList,
  getStudentScoreDetail,
  getStudentScorePeriod,
  getStudentScorePeriodLogs,
  getMyScore,
  getMyScorePeriod,
  applyScore,
  deleteScoreLog,
} from "../controllers/score.controller";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Học viên xem điểm của chính mình — bất kỳ ai đã đăng nhập đều gọi được,
// controller tự kiểm tra có nằm trong schedule_access không.
router.get("/me", authenticate, getMyScore);

// Học viên xem điểm của chính mình theo khoảng ngày (biểu đồ tuần/tháng)
router.get("/me/period", authenticate, getMyScorePeriod);

// Quản lý danh sách lý do — chỉ admin
router.get("/reasons", authenticate, authorizeAdmin, getScoreReasons);
router.post("/reasons", authenticate, authorizeAdmin, createScoreReason);
router.put("/reasons/:id", authenticate, authorizeAdmin, updateScoreReason);
router.delete("/reasons/:id", authenticate, authorizeAdmin, deleteScoreReason);

// Danh sách tổng quan điểm tất cả học viên — chỉ admin
router.get("/students", authenticate, authorizeAdmin, getStudentScoreList);

// Chi tiết điểm + lịch sử 1 học viên — chỉ admin (học viên dùng /me ở trên)
router.get(
  "/students/:userId",
  authenticate,
  authorizeAdmin,
  getStudentScoreDetail,
);
router.get(
  "/students/:userId/period",
  authenticate,
  authorizeAdmin,
  getStudentScorePeriod,
);
router.get(
  "/students/:userId/period/logs",
  authenticate,
  authorizeAdmin,
  getStudentScorePeriodLogs,
);

// Áp dụng điểm cho 1 học viên — chỉ admin
router.post("/apply", authenticate, authorizeAdmin, applyScore);

// Xóa 1 lượt chấm điểm (sửa sai) — chỉ admin
router.delete("/log/:id", authenticate, authorizeAdmin, deleteScoreLog);

export default router;
