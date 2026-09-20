import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../database";
import {
  Prisma,
  ScheduleSession,
  ScheduleType,
  ScheduleAccessType,
} from "@prisma/client";
import { getSummaryForUser, syncWarningLevel } from "./score.controller";

// req.user được gắn sẵn type { id: number; role: string } từ auth.middleware.ts
// (declare global mở rộng Express.Request) — không cần ép kiểu as any nữa.

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Suy ra buổi (sáng/chiều/tối) từ giờ bắt đầu, đồng bộ với logic ở frontend
function sessionFromTime(start: string): ScheduleSession {
  const hour = parseInt(start.split(":")[0], 10);
  if (hour < 12) return ScheduleSession.SANG;
  if (hour < 17) return ScheduleSession.CHIEU;
  return ScheduleSession.TOI;
}

function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isValidType(type: string): type is ScheduleType {
  return Object.values(ScheduleType).includes(type as ScheduleType);
}

function isValidAccessType(type: string): type is ScheduleAccessType {
  return Object.values(ScheduleAccessType).includes(type as ScheduleAccessType);
}

function nowInVietnam(): { dateStr: string; timeStr: string } {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  const hh = String(vn.getUTCHours()).padStart(2, "0");
  const mm = String(vn.getUTCMinutes()).padStart(2, "0");
  return { dateStr: `${y}-${m}-${d}`, timeStr: `${hh}:${mm}` };
}

function addMinutesToDateTime(
  dateStr: string,
  timeStr: string,
  minutesToAdd: number,
): { dateStr: string; timeStr: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const shifted = new Date(
    Date.UTC(y, m - 1, d, hh, mm) + minutesToAdd * 60000,
  );
  return {
    dateStr: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`,
    timeStr: `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function isAtOrAfter(
  aDate: string,
  aTime: string,
  bDate: string,
  bTime: string,
): boolean {
  return `${aDate}T${aTime}` >= `${bDate}T${bTime}`;
}

const FEEDBACK_DELAY_MINUTES = 30;

const SCHEDULE_MEMBER_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
} as const;

// ─── Điểm cộng tự động khi điểm danh "Có mặt" ────────────────────────────
const ATTENDANCE_BONUS_LABEL = "Điểm danh có mặt";
const ATTENDANCE_BONUS_POINTS = 5;

// Lấy (hoặc tự tạo nếu chưa có) lý do hệ thống dùng riêng cho điểm cộng tự
// động khi điểm danh "Có mặt" — không lẫn với các lý do admin tự tạo thủ công.
async function getAttendanceBonusReason() {
  const existing = await prisma.scoreReason.findFirst({
    where: { label: ATTENDANCE_BONUS_LABEL },
  });
  if (existing) return existing;
  return prisma.scoreReason.create({
    data: {
      label: ATTENDANCE_BONUS_LABEL,
      defaultPoints: ATTENDANCE_BONUS_POINTS,
    },
  });
}

async function userHasScheduleAccess(
  userId?: number,
  role?: string,
): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (!userId) return false;
  const access = await prisma.scheduleAccess.findUnique({ where: { userId } });
  return !!access;
}

async function hasTimeConflict(
  date: Date,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Promise<boolean> {
  const sameDay = await prisma.scheduleItem.findMany({
    where: {
      date,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });

  return sameDay.some((it) => startTime < it.endTime && it.startTime < endTime);
}

async function resolveMemberUserIds(
  raw: unknown,
): Promise<{ ok: true; userIds: number[] } | { ok: false; message: string }> {
  if (!Array.isArray(raw)) return { ok: true, userIds: [] };

  const userIds = raw.map((v) => Number(v)).filter((v) => Number.isInteger(v));
  if (userIds.length !== raw.length) {
    return { ok: false, message: "Danh sách thành viên có ID không hợp lệ" };
  }
  if (userIds.length === 0) return { ok: true, userIds: [] };

  const validAccess = await prisma.scheduleAccess.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
  });
  const validIds = new Set(validAccess.map((a) => a.userId));
  const hasInvalid = userIds.some((id) => !validIds.has(id));
  if (hasInvalid) {
    return {
      ok: false,
      message:
        "Một số thành viên không có quyền xem lịch, không thể thêm vào buổi",
    };
  }

  return { ok: true, userIds: [...new Set(userIds)] };
}

export const checkMyScheduleAccess = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.json({ hasAccess: false });
  }
  if (req.user.role === "ADMIN") {
    return res.json({ hasAccess: true });
  }

  const access = await prisma.scheduleAccess.findUnique({
    where: { userId: req.user.id },
  });

  res.json({ hasAccess: !!access });
};

export const getSchedule = async (req: Request, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    const access = req.user?.id
      ? await prisma.scheduleAccess.findUnique({
          where: { userId: req.user.id },
        })
      : null;

    if (!access) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem thời khóa biểu",
      });
    }
  }

  const { from, to } = req.query as { from?: string; to?: string };

  let dateFilter: { gte?: Date; lte?: Date } | undefined;
  if (from || to) {
    if (from && !isValidDateString(from)) {
      return res
        .status(400)
        .json({ success: false, message: "Ngày bắt đầu (from) không hợp lệ" });
    }
    if (to && !isValidDateString(to)) {
      return res
        .status(400)
        .json({ success: false, message: "Ngày kết thúc (to) không hợp lệ" });
    }
    dateFilter = {};
    if (from) dateFilter.gte = parseDateOnly(from);
    if (to) dateFilter.lte = parseDateOnly(to);
  }

  const items = await prisma.scheduleItem.findMany({
    where: dateFilter ? { date: dateFilter } : undefined,
    include: {
      members: { include: { user: { select: SCHEDULE_MEMBER_USER_SELECT } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  res.json(items);
};

export const createScheduleItem = async (req: Request, res: Response) => {
  const { date, type, title, startTime, endTime, allTeam, members } = req.body;

  if (!date || !isValidDateString(date)) {
    return res.status(400).json({
      success: false,
      message: "Ngày không hợp lệ (định dạng YYYY-MM-DD)",
    });
  }
  if (!type || !isValidType(type)) {
    return res
      .status(400)
      .json({ success: false, message: "Loại buổi không hợp lệ" });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng nhập tên buổi" });
  }
  if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    return res
      .status(400)
      .json({ success: false, message: "Giờ không hợp lệ (định dạng HH:mm)" });
  }
  if (endTime <= startTime) {
    return res
      .status(400)
      .json({ success: false, message: "Giờ kết thúc phải sau giờ bắt đầu" });
  }
  const nowVN = nowInVietnam();
  if (date < nowVN.dateStr) {
    return res.status(400).json({
      success: false,
      message: "Không thể thêm lịch vào ngày đã qua",
    });
  }
  if (date === nowVN.dateStr && startTime <= nowVN.timeStr) {
    return res.status(400).json({
      success: false,
      message: "Giờ bắt đầu phải sau giờ hiện tại",
    });
  }
  if (await hasTimeConflict(parseDateOnly(date), startTime, endTime)) {
    return res.status(409).json({
      success: false,
      message: "Khung giờ này đã trùng với một buổi khác trong ngày",
    });
  }

  const isAllTeam = Boolean(allTeam);
  const memberResolution = isAllTeam
    ? { ok: true as const, userIds: [] as number[] }
    : await resolveMemberUserIds(members);
  if (!memberResolution.ok) {
    return res
      .status(400)
      .json({ success: false, message: memberResolution.message });
  }

  const item = await prisma.scheduleItem.create({
    data: {
      date: parseDateOnly(date),
      type,
      title: title.trim(),
      startTime,
      endTime,
      allTeam: isAllTeam,
      session: sessionFromTime(startTime),
      members: {
        create: memberResolution.userIds.map((userId) => ({ userId })),
      },
    },
    include: {
      members: { include: { user: { select: SCHEDULE_MEMBER_USER_SELECT } } },
    },
  });

  res.json({ success: true, item });
};

export const updateScheduleItem = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { date, type, title, startTime, endTime, allTeam, members } = req.body;

  if (!id)
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  if (!date || !isValidDateString(date)) {
    return res.status(400).json({
      success: false,
      message: "Ngày không hợp lệ (định dạng YYYY-MM-DD)",
    });
  }
  if (!type || !isValidType(type)) {
    return res
      .status(400)
      .json({ success: false, message: "Loại buổi không hợp lệ" });
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng nhập tên buổi" });
  }
  if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    return res
      .status(400)
      .json({ success: false, message: "Giờ không hợp lệ (định dạng HH:mm)" });
  }
  if (endTime <= startTime) {
    return res
      .status(400)
      .json({ success: false, message: "Giờ kết thúc phải sau giờ bắt đầu" });
  }

  const existing = await prisma.scheduleItem.findUnique({ where: { id } });
  if (!existing)
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy buổi học" });

  const nowVN = nowInVietnam();
  if (date < nowVN.dateStr) {
    return res.status(400).json({
      success: false,
      message: "Không thể chuyển lịch sang ngày đã qua",
    });
  }
  if (date === nowVN.dateStr && startTime <= nowVN.timeStr) {
    return res.status(400).json({
      success: false,
      message: "Giờ bắt đầu phải sau giờ hiện tại",
    });
  }
  if (await hasTimeConflict(parseDateOnly(date), startTime, endTime, id)) {
    return res.status(409).json({
      success: false,
      message: "Khung giờ này đã trùng với một buổi khác trong ngày",
    });
  }

  const isAllTeam = Boolean(allTeam);
  const memberResolution = isAllTeam
    ? { ok: true as const, userIds: [] as number[] }
    : await resolveMemberUserIds(members);
  if (!memberResolution.ok) {
    return res
      .status(400)
      .json({ success: false, message: memberResolution.message });
  }

  const item = await prisma.$transaction(async (tx) => {
    await tx.scheduleMember.deleteMany({ where: { scheduleItemId: id } });
    return tx.scheduleItem.update({
      where: { id },
      data: {
        date: parseDateOnly(date),
        type,
        title: title.trim(),
        startTime,
        endTime,
        allTeam: isAllTeam,
        session: sessionFromTime(startTime),
        notified1hBefore: false,
        notifiedFeedbackReminder: false,
        members: {
          create: memberResolution.userIds.map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: { user: { select: SCHEDULE_MEMBER_USER_SELECT } },
        },
      },
    });
  });

  res.json({ success: true, item });
};

export const deleteScheduleItem = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  const existing = await prisma.scheduleItem.findUnique({ where: { id } });
  if (!existing)
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy buổi học" });

  await prisma.scheduleItem.delete({ where: { id } });

  res.json({ success: true });
};

export const getScheduleAttendance = async (req: Request, res: Response) => {
  const scheduleItemId = Number(req.params.id);
  if (!scheduleItemId) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }

  const item = await prisma.scheduleItem.findUnique({
    where: { id: scheduleItemId },
  });
  if (!item) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy buổi học" });
  }

  const attendance = await prisma.scheduleAttendance.findMany({
    where: { scheduleItemId },
    include: { user: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json(attendance);
};

// Ai được tick "Có mặt" sẽ TỰ ĐỘNG được cộng 5 điểm đánh giá (lý do hệ thống
// "Điểm danh có mặt"). Nếu admin sửa lại điểm danh và bỏ tick "Có mặt" của
// ai đó (mà trước đây từng được tick), điểm cộng tương ứng sẽ bị thu hồi.
export const saveScheduleAttendance = async (req: Request, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    return res
      .status(403)
      .json({ success: false, message: "Bạn không có quyền điểm danh" });
  }

  const scheduleItemId = Number(req.params.id);
  if (!scheduleItemId) {
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });
  }

  const item = await prisma.scheduleItem.findUnique({
    where: { id: scheduleItemId },
  });
  if (!item) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy buổi học" });
  }

  const nowVN = nowInVietnam();
  const itemDateStr = item.date.toISOString().slice(0, 10);
  const isPastDate = itemDateStr < nowVN.dateStr;

  if (isPastDate) {
    const { adminPassword } = req.body as { adminPassword?: string };
    if (!adminPassword || typeof adminPassword !== "string") {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập mật khẩu admin để sửa điểm danh buổi đã qua",
      });
    }

    const admin = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { password: true },
    });

    const passwordMatches =
      !!admin?.password &&
      (await bcrypt.compare(adminPassword, admin.password));

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Mật khẩu không đúng",
      });
    }
  }

  const { participants } = req.body as {
    participants?: { userId: number; present: boolean | null }[];
  };

  if (!Array.isArray(participants)) {
    return res
      .status(400)
      .json({ success: false, message: "Danh sách thành viên không hợp lệ" });
  }

  const userIds = participants
    .map((p) => Number(p.userId))
    .filter((id) => Number.isInteger(id));
  if (userIds.length !== participants.length) {
    return res.status(400).json({
      success: false,
      message: "Danh sách thành viên có ID không hợp lệ",
    });
  }

  if (userIds.length > 0) {
    const validAccess = await prisma.scheduleAccess.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
    });
    const validIds = new Set(validAccess.map((a) => a.userId));
    const hasInvalid = userIds.some((id) => !validIds.has(id));
    if (hasInvalid) {
      return res.status(400).json({
        success: false,
        message:
          "Một số thành viên không có quyền xem lịch, không thể điểm danh",
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.scheduleAttendance.deleteMany({ where: { scheduleItemId } });
    if (participants.length > 0) {
      await tx.scheduleAttendance.createMany({
        data: participants.map((p) => ({
          scheduleItemId,
          userId: Number(p.userId),
          present:
            p.present === true ? true : p.present === false ? false : null,
        })),
      });
    }
  });

  // ── Tự động cộng/thu hồi điểm dựa trên điểm danh "Có mặt" ──────────────
  const bonusReason = await getAttendanceBonusReason();
  const existingBonusLogs = await prisma.studentScoreLog.findMany({
    where: { scheduleItemId, reasonId: bonusReason.id },
    select: { id: true, userId: true },
  });
  const existingBonusUserIds = new Set(existingBonusLogs.map((l) => l.userId));
  const presentUserIds = new Set(
    participants.filter((p) => p.present === true).map((p) => Number(p.userId)),
  );

  const affectedUserIds = new Set<number>();

  for (const userId of presentUserIds) {
    if (!existingBonusUserIds.has(userId)) {
      await prisma.studentScoreLog.create({
        data: {
          userId,
          reasonId: bonusReason.id,
          points: bonusReason.defaultPoints ?? ATTENDANCE_BONUS_POINTS,
          createdById: req.user!.id,
          scheduleItemId,
        },
      });
      affectedUserIds.add(userId);
    }
  }

  for (const log of existingBonusLogs) {
    if (!presentUserIds.has(log.userId)) {
      await prisma.studentScoreLog.delete({ where: { id: log.id } });
      affectedUserIds.add(log.userId);
    }
  }

  for (const userId of affectedUserIds) {
    const summary = await getSummaryForUser(userId);
    await syncWarningLevel(userId, summary.warningLevel);
  }

  const attendance = await prisma.scheduleAttendance.findMany({
    where: { scheduleItemId },
    include: { user: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json({ success: true, attendance });
};

export const getPendingScheduleFeedback = async (
  req: Request,
  res: Response,
) => {
  const hasAccess = await userHasScheduleAccess(req.user?.id, req.user?.role);
  if (!hasAccess) return res.json([]);

  const nowVN = nowInVietnam();

  const todayItems = await prisma.scheduleItem.findMany({
    where: { date: parseDateOnly(nowVN.dateStr) },
    orderBy: { startTime: "asc" },
  });

  const eligible = todayItems.filter((item) => {
    const threshold = addMinutesToDateTime(
      nowVN.dateStr,
      item.endTime,
      FEEDBACK_DELAY_MINUTES,
    );
    return isAtOrAfter(
      nowVN.dateStr,
      nowVN.timeStr,
      threshold.dateStr,
      threshold.timeStr,
    );
  });

  if (eligible.length === 0) return res.json([]);

  const existing = await prisma.scheduleFeedback.findMany({
    where: {
      userId: req.user!.id,
      scheduleItemId: { in: eligible.map((i) => i.id) },
    },
    select: { scheduleItemId: true },
  });
  const doneIds = new Set(existing.map((e) => e.scheduleItemId));

  const pending = eligible
    .filter((item) => !doneIds.has(item.id))
    .map((item) => ({
      id: item.id,
      date: item.date,
      type: item.type,
      title: item.title,
      startTime: item.startTime,
      endTime: item.endTime,
    }));

  res.json(pending);
};

export const submitScheduleFeedback = async (req: Request, res: Response) => {
  const hasAccess = await userHasScheduleAccess(req.user?.id, req.user?.role);
  if (!hasAccess) {
    return res
      .status(403)
      .json({ success: false, message: "Bạn không có quyền gửi đánh giá" });
  }

  const scheduleItemId = Number(req.body.scheduleItemId);
  const {
    moodScore,
    moodReason,
    understandScore,
    understandNote,
    energyScore,
    difficulty,
    suggestion,
  } = req.body;

  if (!scheduleItemId) {
    return res
      .status(400)
      .json({ success: false, message: "Buổi học không hợp lệ" });
  }

  const item = await prisma.scheduleItem.findUnique({
    where: { id: scheduleItemId },
  });
  if (!item) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy buổi học" });
  }

  const nowVN = nowInVietnam();
  const itemDateStr = item.date.toISOString().slice(0, 10);
  const threshold = addMinutesToDateTime(
    itemDateStr,
    item.endTime,
    FEEDBACK_DELAY_MINUTES,
  );
  if (
    !isAtOrAfter(
      nowVN.dateStr,
      nowVN.timeStr,
      threshold.dateStr,
      threshold.timeStr,
    )
  ) {
    return res.status(400).json({
      success: false,
      message: `Chỉ có thể đánh giá sau khi buổi học kết thúc ${FEEDBACK_DELAY_MINUTES} phút`,
    });
  }

  if (!Number.isInteger(moodScore) || moodScore < 1 || moodScore > 10) {
    return res
      .status(400)
      .json({ success: false, message: "Điểm vui vẻ không hợp lệ (1-10)" });
  }
  if (!Number.isInteger(energyScore) || energyScore < 1 || energyScore > 10) {
    return res
      .status(400)
      .json({ success: false, message: "Điểm năng lượng không hợp lệ (1-10)" });
  }

  const isStudySession = item.type === ScheduleType.HOC;
  let finalUnderstandScore: number | null = null;
  if (isStudySession) {
    if (
      !Number.isInteger(understandScore) ||
      understandScore < 1 ||
      understandScore > 5
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Điểm hiểu bài không hợp lệ (1-5)" });
    }
    finalUnderstandScore = understandScore;
  }

  try {
    const feedback = await prisma.scheduleFeedback.create({
      data: {
        scheduleItemId,
        userId: req.user!.id,
        moodScore,
        moodReason:
          typeof moodReason === "string" && moodReason.trim()
            ? moodReason.trim()
            : null,
        understandScore: finalUnderstandScore,
        understandNote:
          isStudySession &&
          typeof understandNote === "string" &&
          understandNote.trim()
            ? understandNote.trim()
            : null,
        energyScore,
        difficulty:
          typeof difficulty === "string" && difficulty.trim()
            ? difficulty.trim()
            : null,
        suggestion:
          typeof suggestion === "string" && suggestion.trim()
            ? suggestion.trim()
            : null,
      },
    });
    res.json({ success: true, feedback });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res
        .status(409)
        .json({ success: false, message: "Bạn đã đánh giá buổi này rồi" });
    }
    throw err;
  }
};

export const getMyScheduleFeedbackIds = async (req: Request, res: Response) => {
  if (!req.user?.id) return res.json([]);

  const list = await prisma.scheduleFeedback.findMany({
    where: { userId: req.user.id },
    select: { scheduleItemId: true },
  });

  res.json(list.map((f) => f.scheduleItemId));
};

export const getScheduleFeedbackList = async (req: Request, res: Response) => {
  const { from, to, scheduleItemId } = req.query as {
    from?: string;
    to?: string;
    scheduleItemId?: string;
  };

  let dateFilter: { gte?: Date; lte?: Date } | undefined;
  if (from || to) {
    if (from && !isValidDateString(from)) {
      return res
        .status(400)
        .json({ success: false, message: "Ngày bắt đầu (from) không hợp lệ" });
    }
    if (to && !isValidDateString(to)) {
      return res
        .status(400)
        .json({ success: false, message: "Ngày kết thúc (to) không hợp lệ" });
    }
    dateFilter = {};
    if (from) dateFilter.gte = parseDateOnly(from);
    if (to) dateFilter.lte = parseDateOnly(to);
  }

  const list = await prisma.scheduleFeedback.findMany({
    where: {
      ...(scheduleItemId ? { scheduleItemId: Number(scheduleItemId) } : {}),
      ...(dateFilter ? { scheduleItem: { date: dateFilter } } : {}),
    },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      scheduleItem: {
        select: {
          id: true,
          date: true,
          type: true,
          title: true,
          startTime: true,
          endTime: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(list);
};

export const deleteScheduleFeedback = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  const existing = await prisma.scheduleFeedback.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy đánh giá này" });
  }

  await prisma.scheduleFeedback.delete({ where: { id } });
  res.json({ success: true });
};

export const deleteAllScheduleFeedback = async (
  req: Request,
  res: Response,
) => {
  const result = await prisma.scheduleFeedback.deleteMany({});
  res.json({ success: true, count: result.count });
};

export const getScheduleAccessList = async (req: Request, res: Response) => {
  const list = await prisma.scheduleAccess.findMany({
    include: { user: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.json(list);
};

export const searchUsersForAccess = async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [{ email: { contains: q } }, { fullName: { contains: q } }],
        }
      : undefined,
    select: { id: true, email: true, fullName: true, role: true },
    orderBy: { email: "asc" },
    take: 20,
  });

  res.json(users);
};

export const grantScheduleAccess = async (req: Request, res: Response) => {
  const { email, type } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res
      .status(400)
      .json({ success: false, message: "Email không hợp lệ" });
  }
  if (type && !isValidAccessType(type)) {
    return res
      .status(400)
      .json({ success: false, message: "Loại tài khoản không hợp lệ" });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Email này chưa có tài khoản trong hệ thống",
    });
  }

  const access = await prisma.scheduleAccess.upsert({
    where: { userId: user.id },
    update: { type: type ?? ScheduleAccessType.NORMAL },
    create: { userId: user.id, type: type ?? ScheduleAccessType.NORMAL },
    include: { user: { select: { id: true, email: true, fullName: true } } },
  });

  res.json({ success: true, access });
};

export const revokeScheduleAccess = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "ID không hợp lệ" });

  const existing = await prisma.scheduleAccess.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({ success: false, message: "Không tìm thấy quyền xem này" });
  }

  await prisma.scheduleAccess.delete({ where: { id } });

  res.json({ success: true });
};
