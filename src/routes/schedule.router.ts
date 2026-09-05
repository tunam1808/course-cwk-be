import { Router } from "express";
import {
  getSchedule,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  getScheduleAttendance,
  saveScheduleAttendance,
  getScheduleAccessList,
  grantScheduleAccess,
  revokeScheduleAccess,
  searchUsersForAccess,
  checkMyScheduleAccess,
  getPendingScheduleFeedback,
  submitScheduleFeedback,
  getMyScheduleFeedbackIds,
  getScheduleFeedbackList,
  deleteScheduleFeedback,
  deleteAllScheduleFeedback,
} from "../controllers/schedule.controller";
import { authenticate, authorizeAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Kiểm tra quyền xem lịch của chính mình — bất kỳ ai đã đăng nhập đều gọi được
router.get("/my-access", authenticate, checkMyScheduleAccess);

// Đánh giá buổi học / buổi đi chơi
router.get("/feedback/pending", authenticate, getPendingScheduleFeedback);
router.get("/feedback/mine", authenticate, getMyScheduleFeedbackIds);
router.post("/feedback", authenticate, submitScheduleFeedback);
router.get("/feedback", authenticate, authorizeAdmin, getScheduleFeedbackList);
// Lưu ý: "/feedback/all" phải đứng TRƯỚC "/feedback/:id" để không bị nuốt nhầm
router.delete(
  "/feedback/all",
  authenticate,
  authorizeAdmin,
  deleteAllScheduleFeedback,
);
router.delete(
  "/feedback/:id",
  authenticate,
  authorizeAdmin,
  deleteScheduleFeedback,
);

// Xem lịch — bắt buộc đăng nhập, controller tự kiểm tra whitelist / role admin
router.get("/", authenticate, getSchedule);

// Thêm / sửa / xóa buổi học, buổi đi chơi — chỉ admin
router.post("/", authenticate, authorizeAdmin, createScheduleItem);
router.put("/:id", authenticate, authorizeAdmin, updateScheduleItem);
router.delete("/:id", authenticate, authorizeAdmin, deleteScheduleItem);

// Điểm danh buổi học — chỉ admin
router.get(
  "/:id/attendance",
  authenticate,
  authorizeAdmin,
  getScheduleAttendance,
);
router.put(
  "/:id/attendance",
  authenticate,
  authorizeAdmin,
  saveScheduleAttendance,
);

// Quản lý whitelist email được phép xem lịch — chỉ admin
router.get("/access", authenticate, authorizeAdmin, getScheduleAccessList);
router.get(
  "/access/search-users",
  authenticate,
  authorizeAdmin,
  searchUsersForAccess,
);
router.post("/access", authenticate, authorizeAdmin, grantScheduleAccess);
router.delete(
  "/access/:id",
  authenticate,
  authorizeAdmin,
  revokeScheduleAccess,
);

export default router;
