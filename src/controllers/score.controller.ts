import { Request, Response } from "express";
import { prisma } from "../database";
import { sendPushToUser } from "../services/webpush.service";
import { ScoreWarningLevel } from "@prisma/client";

// Ngưỡng điểm để cảnh báo — dựa trên ĐIỂM HIỆN TẠI (netScore), không phải
// tỉ lệ điểm trừ như trước.
const MILD_THRESHOLD = 60; // điểm < 60: cảnh báo nhẹ
const SEVERE_THRESHOLD = 40; // điểm < 40: cảnh báo nặng

// Thứ tự mức độ để so sánh "xấu đi" hay "cải thiện"
const LEVEL_SEVERITY: Record<ScoreWarningLevel, number> = {
  NONE: 0,
  MILD: 1,
  SEVERE: 2,
};

interface ScoreSummary {
  netScore: number;
  totalPositive: number;
  totalNegative: number; // luôn là số dương (trị tuyệt đối)
  warningLevel: ScoreWarningLevel;
}

function getWarningLevel(netScore: number): ScoreWarningLevel {
  if (netScore < SEVERE_THRESHOLD) return "SEVERE";
  if (netScore < MILD_THRESHOLD) return "MILD";
  return "NONE";
}

// Tính tổng điểm cộng/trừ và mức cảnh báo từ danh sách log của 1 user.
// Điểm hiện tại = 100 + tổng points (không giới hạn trên/dưới).
function summarize(points: number[]): ScoreSummary {
  let totalPositive = 0;
  let totalNegative = 0;
  for (const p of points) {
    if (p > 0) totalPositive += p;
    else if (p < 0) totalNegative += Math.abs(p);
  }
  const netScore = 100 + points.reduce((a, b) => a + b, 0);
  return {
    netScore,
    totalPositive,
    totalNegative,
    warningLevel: getWarningLevel(netScore),
  };
}

// Export để schedule.controller.ts dùng lại khi cộng/thu hồi điểm điểm danh
export async function getSummaryForUser(userId: number): Promise<ScoreSummary> {
  const logs = await prisma.studentScoreLog.findMany({
    where: { userId },
    select: { points: true },
  });
  return summarize(logs.map((l) => l.points));
}

// Đồng bộ lại scoreWarningLevel trong schedule_access, và gửi push NẾU mức
// độ vừa XẤU ĐI so với lần cảnh báo gần nhất (không gửi khi cải thiện, và
// không gửi lặp lại khi vẫn đứng yên ở cùng 1 mức).
// Export để schedule.controller.ts dùng lại khi cộng/thu hồi điểm điểm danh
export async function syncWarningLevel(
  userId: number,
  newLevel: ScoreWarningLevel,
): Promise<void> {
  const access = await prisma.scheduleAccess.findUnique({ where: { userId } });
  if (!access) return;

  if (LEVEL_SEVERITY[newLevel] > LEVEL_SEVERITY[access.scoreWarningLevel]) {
    if (newLevel === "SEVERE") {
      await sendPushToUser(userId, {
        title: "Cảnh báo điểm đánh giá",
        body: "Thái độ của bạn đang ở ngưỡng cảnh báo.",
        url: "/profile",
      });
    } else if (newLevel === "MILD") {
      await sendPushToUser(userId, {
        title: "Điểm đánh giá của bạn đang thấp",
        body: "Điểm của bạn thấp, hãy cải thiện thêm.",
        url: "/profile",
      });
    }
  }

  if (access.scoreWarningLevel !== newLevel) {
    await prisma.scheduleAccess.update({
      where: { userId },
      data: { scoreWarningLevel: newLevel },
    });
  }
}

// ─── Quản lý danh sách lý do (admin) ─────────────────────────────────────
export const getScoreReasons = async (req: Request, res: Response) => {
  const reasons = await prisma.scoreReason.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(reasons);
};

export const createScoreReason = async (req: Request, res: Response) => {
  const { label, defaultPoints } = req.body as {
    label?: string;
    defaultPoints?: number | null;
  };
  if (!label || typeof label !== "string" || !label.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng nhập nội dung lý do" });
  }

  let dp: number | null = null;
  if (
    defaultPoints !== undefined &&
    defaultPoints !== null &&
    defaultPoints !== ("" as unknown)
  ) {
    const n = Number(defaultPoints);
    if (!Number.isInteger(n) || n === 0) {
      return res.status(400).json({
        success: false,
        message: "Điểm mặc định phải là số nguyên khác 0, hoặc để trống",
      });
    }
    dp = n;
  }

  const reason = await prisma.scoreReason.create({
    data: { label: label.trim(), defaultPoints: dp },
  });
  res.json({ success: true, reason });
};

// Sửa lý do đã có — đổi nhãn và/hoặc điểm mặc định. Không ảnh hưởng các
// lượt chấm điểm đã áp dụng trước đó (StudentScoreLog lưu points riêng,
// độc lập với defaultPoints hiện tại của lý do).
export const updateScoreReason = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }

  const { label, defaultPoints } = req.body as {
    label?: string;
    defaultPoints?: number | null;
  };

  const existing = await prisma.scoreReason.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy lý do" });
  }

  const data: { label?: string; defaultPoints?: number | null } = {};

  if (label !== undefined) {
    if (typeof label !== "string" || !label.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Nội dung lý do không hợp lệ" });
    }
    data.label = label.trim();
  }

  if (defaultPoints !== undefined) {
    if (defaultPoints === null || (defaultPoints as unknown) === "") {
      data.defaultPoints = null;
    } else {
      const n = Number(defaultPoints);
      if (!Number.isInteger(n) || n === 0) {
        return res.status(400).json({
          success: false,
          message: "Điểm mặc định phải là số nguyên khác 0, hoặc để trống",
        });
      }
      data.defaultPoints = n;
    }
  }

  const reason = await prisma.scoreReason.update({ where: { id }, data });
  res.json({ success: true, reason });
};

export const deleteScoreReason = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }

  const usageCount = await prisma.studentScoreLog.count({
    where: { reasonId: id },
  });
  if (usageCount > 0) {
    return res.status(400).json({
      success: false,
      message: `Lý do này đã được dùng trong ${usageCount} lượt chấm điểm, không thể xóa để giữ lịch sử`,
    });
  }

  const existing = await prisma.scoreReason.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy lý do" });
  }

  await prisma.scoreReason.delete({ where: { id } });
  res.json({ success: true });
};

// ─── Danh sách học viên kèm điểm tổng quan (admin) ───────────────────────
// GET /api/scores/students
export const getStudentScoreList = async (req: Request, res: Response) => {
  const accessList = await prisma.scheduleAccess.findMany({
    include: { user: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const results = await Promise.all(
    accessList.map(async (a) => {
      const summary = await getSummaryForUser(a.userId);
      return {
        userId: a.userId,
        email: a.user.email,
        fullName: a.user.fullName,
        ...summary,
      };
    }),
  );

  res.json(results);
};

// ─── Chi tiết điểm + lịch sử của 1 học viên ──────────────────────────────
// GET /api/scores/students/:userId (admin xem ai cũng được)
// GET /api/scores/me (chính học viên xem của mình — check quyền riêng)
async function buildStudentScoreDetail(userId: number) {
  const logs = await prisma.studentScoreLog.findMany({
    where: { userId },
    include: {
      reason: { select: { label: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const summary = summarize(logs.map((l) => l.points));

  return {
    ...summary,
    logs: logs.map((l) => ({
      id: l.id,
      reasonLabel: l.reason.label,
      points: l.points,
      note: l.note,
      createdAt: l.createdAt,
      createdByName: l.createdBy.fullName || l.createdBy.email,
    })),
  };
}

export const getStudentScoreDetail = async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  if (!userId) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }

  const access = await prisma.scheduleAccess.findUnique({
    where: { userId },
    include: { user: { select: { id: true, email: true, fullName: true } } },
  });
  if (!access) {
    return res.status(404).json({
      success: false,
      message: "Học viên này không có quyền xem lịch / không có điểm đánh giá",
    });
  }

  const detail = await buildStudentScoreDetail(userId);
  res.json({
    userId,
    email: access.user.email,
    fullName: access.user.fullName,
    ...detail,
  });
};

// Học viên xem điểm của chính mình
export const getMyScore = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const access = await prisma.scheduleAccess.findUnique({
    where: { userId: req.user.id },
  });
  if (!access) {
    return res.status(403).json({
      success: false,
      message: "Bạn không thuộc danh sách được đánh giá điểm",
    });
  }

  const detail = await buildStudentScoreDetail(req.user.id);
  res.json(detail);
};

// ─── Áp dụng điểm cho 1 học viên (admin) ─────────────────────────────────
// POST /api/scores/apply { userId, reasonId, points, note? }
export const applyScore = async (req: Request, res: Response) => {
  const { userId, reasonId, points, note } = req.body as {
    userId?: number;
    reasonId?: number;
    points?: number;
    note?: string;
  };

  const uId = Number(userId);
  const rId = Number(reasonId);
  const p = Number(points);

  if (!Number.isInteger(uId)) {
    return res
      .status(400)
      .json({ success: false, message: "Học viên không hợp lệ" });
  }
  if (!Number.isInteger(rId)) {
    return res
      .status(400)
      .json({ success: false, message: "Lý do không hợp lệ" });
  }
  if (!Number.isInteger(p) || p === 0) {
    return res.status(400).json({
      success: false,
      message: "Điểm phải là số nguyên khác 0 (dương để cộng, âm để trừ)",
    });
  }
  if (!req.user?.id) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const access = await prisma.scheduleAccess.findUnique({
    where: { userId: uId },
  });
  if (!access) {
    return res.status(400).json({
      success: false,
      message: "Học viên này không có quyền xem lịch, không thể chấm điểm",
    });
  }

  const reason = await prisma.scoreReason.findUnique({ where: { id: rId } });
  if (!reason) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy lý do" });
  }

  await prisma.studentScoreLog.create({
    data: {
      userId: uId,
      reasonId: rId,
      points: p,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      createdById: req.user.id,
    },
  });

  const summary = await getSummaryForUser(uId);
  await syncWarningLevel(uId, summary.warningLevel);

  res.json({ success: true, summary });
};

// Học viên tự xem điểm của MÌNH trong 1 khoảng ngày tuỳ chọn (dùng cho biểu
// đồ tuần/tháng ở trang Profile) — khác với getStudentScorePeriod (admin xem
// người khác), route này chỉ cần đăng nhập, không cần quyền admin.
// GET /api/scores/me/period?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getMyScorePeriod = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const access = await prisma.scheduleAccess.findUnique({
    where: { userId: req.user.id },
  });
  if (!access) {
    return res.status(403).json({
      success: false,
      message: "Bạn không thuộc danh sách được đánh giá điểm",
    });
  }

  const { from, to } = req.query as { from?: string; to?: string };
  if (!from || !to) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu khoảng ngày (from/to)" });
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res
      .status(400)
      .json({ success: false, message: "Ngày không hợp lệ" });
  }

  const logs = await prisma.studentScoreLog.findMany({
    where: { userId: req.user.id, createdAt: { gte: fromDate, lte: toDate } },
    select: { points: true },
  });

  let totalPositive = 0;
  let totalNegative = 0;
  for (const l of logs) {
    if (l.points > 0) totalPositive += l.points;
    else if (l.points < 0) totalNegative += Math.abs(l.points);
  }

  res.json({
    totalPositive,
    totalNegative,
    netChange: totalPositive - totalNegative,
    logCount: logs.length,
  });
};

// Chi tiết đầy đủ (kèm từng log) trong 1 khoảng ngày — dùng để xuất báo cáo
// PDF/ảnh theo tuần/tháng, khác với getStudentScorePeriod (chỉ trả tổng số).
// GET /api/scores/students/:userId/period/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getStudentScorePeriodLogs = async (
  req: Request,
  res: Response,
) => {
  const userId = Number(req.params.userId);
  const { from, to } = req.query as { from?: string; to?: string };

  if (!userId) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }
  if (!from || !to) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu khoảng ngày (from/to)" });
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res
      .status(400)
      .json({ success: false, message: "Ngày không hợp lệ" });
  }

  const student = await prisma.scheduleAccess.findUnique({
    where: { userId },
    include: { user: { select: { id: true, email: true, fullName: true } } },
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Học viên này không có quyền xem lịch / không có điểm đánh giá",
    });
  }

  const logs = await prisma.studentScoreLog.findMany({
    where: { userId, createdAt: { gte: fromDate, lte: toDate } },
    include: {
      reason: { select: { label: true } },
      createdBy: { select: { fullName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let totalPositive = 0;
  let totalNegative = 0;
  for (const l of logs) {
    if (l.points > 0) totalPositive += l.points;
    else if (l.points < 0) totalNegative += Math.abs(l.points);
  }

  res.json({
    userId,
    email: student.user.email,
    fullName: student.user.fullName,
    totalPositive,
    totalNegative,
    netChange: totalPositive - totalNegative,
    logs: logs.map((l) => ({
      id: l.id,
      reasonLabel: l.reason.label,
      points: l.points,
      note: l.note,
      createdAt: l.createdAt,
      createdByName: l.createdBy.fullName || l.createdBy.email,
    })),
  });
};

// ─── Điểm theo khoảng ngày tuỳ chọn (dùng cho biểu đồ tuần/tháng) ─────────
// GET /api/scores/students/:userId/period?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getStudentScorePeriod = async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const { from, to } = req.query as { from?: string; to?: string };

  if (!userId) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }
  if (!from || !to) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu khoảng ngày (from/to)" });
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res
      .status(400)
      .json({ success: false, message: "Ngày không hợp lệ" });
  }

  const logs = await prisma.studentScoreLog.findMany({
    where: { userId, createdAt: { gte: fromDate, lte: toDate } },
    select: { points: true },
  });

  let totalPositive = 0;
  let totalNegative = 0;
  for (const l of logs) {
    if (l.points > 0) totalPositive += l.points;
    else if (l.points < 0) totalNegative += Math.abs(l.points);
  }

  res.json({
    totalPositive,
    totalNegative,
    netChange: totalPositive - totalNegative,
    logCount: logs.length,
  });
};

// ─── Xóa 1 lượt chấm điểm (sửa sai) ───────────────────────────────────────
export const deleteScoreLog = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }

  const log = await prisma.studentScoreLog.findUnique({ where: { id } });
  if (!log) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy lượt chấm điểm này" });
  }

  await prisma.studentScoreLog.delete({ where: { id } });

  const summary = await getSummaryForUser(log.userId);
  // Xóa log chỉ nên làm điểm TỐT LÊN hoặc giữ nguyên (do xóa 1 lượt trừ) hay
  // XẤU ĐI (do xóa 1 lượt cộng) — cả 2 trường hợp đều chỉ cần đồng bộ lại
  // trạng thái, không cần gửi push (đây là thao tác sửa sai của admin, không
  // phải diễn biến thực tế của học viên).
  const access = await prisma.scheduleAccess.findUnique({
    where: { userId: log.userId },
  });
  if (access && access.scoreWarningLevel !== summary.warningLevel) {
    await prisma.scheduleAccess.update({
      where: { userId: log.userId },
      data: { scoreWarningLevel: summary.warningLevel },
    });
  }

  res.json({ success: true, summary });
};
