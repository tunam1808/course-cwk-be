import cron from "node-cron";
import { prisma } from "../database";
import { sendPushToUsers } from "./webpush.service";

// Giờ hiện tại theo múi giờ Việt Nam (UTC+7 cố định) — đồng bộ logic với
// schedule.controller.ts để tránh lệch múi giờ giữa các nơi tính toán.
function nowInVietnam(): { dateStr: string; timeStr: string } {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  const hh = String(vn.getUTCHours()).padStart(2, "0");
  const mm = String(vn.getUTCMinutes()).padStart(2, "0");
  return { dateStr: `${y}-${m}-${d}`, timeStr: `${hh}:${mm}` };
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
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

const sessionLabelOf = (start: string): string => {
  const hour = parseInt(start.split(":")[0], 10);
  if (hour < 12) return "Sáng";
  if (hour < 17) return "Chiều";
  return "Tối";
};

const FEEDBACK_DELAY_MINUTES = 30;

// ─── Nhắc "còn 1 tiếng nữa buổi học sẽ bắt đầu" ──────────────────────────
// Quét các buổi CHƯA gửi thông báo (notified1hBefore = false) mà thời điểm
// bắt đầu rơi vào khoảng 55–65 phút kể từ bây giờ. Dùng biên độ 10 phút
// (thay vì so khớp chính xác từng phút) để không bỏ lỡ buổi nào nếu cron bị
// trễ 1 vài tick (VD server vừa khởi động lại). Sau khi gửi xong sẽ đánh dấu
// notified1hBefore = true để lần quét sau không gửi trùng.
async function checkAndNotifyUpcomingSessions(): Promise<void> {
  const nowVN = nowInVietnam();
  const lower = addMinutesToDateTime(nowVN.dateStr, nowVN.timeStr, 55);
  const upper = addMinutesToDateTime(nowVN.dateStr, nowVN.timeStr, 65);

  const candidates = await prisma.scheduleItem.findMany({
    where: {
      notified1hBefore: false,
      date: {
        gte: parseDateOnly(nowVN.dateStr),
        lte: parseDateOnly(upper.dateStr),
      },
    },
    include: {
      members: { include: { user: { select: { id: true } } } },
    },
  });

  const eligible = candidates.filter((item) => {
    const itemDateStr = item.date.toISOString().slice(0, 10);
    return (
      isAtOrAfter(itemDateStr, item.startTime, nowVN.dateStr, lower.timeStr) &&
      !isAtOrAfter(itemDateStr, item.startTime, upper.dateStr, upper.timeStr)
    );
  });

  if (eligible.length === 0) return;

  for (const item of eligible) {
    let userIds: number[];

    if (item.allTeam) {
      const access = await prisma.scheduleAccess.findMany({
        select: { userId: true },
      });
      userIds = access.map((a) => a.userId);
    } else {
      userIds = item.members.map((m) => m.user.id);
    }

    if (userIds.length > 0) {
      const typeLabel = item.type === "HOC" ? "Buổi học" : "Buổi đi chơi";
      await sendPushToUsers(userIds, {
        title: `Sắp đến giờ: ${item.title}`,
        body: `${typeLabel} · ${sessionLabelOf(item.startTime)} ${item.startTime}–${item.endTime} sẽ bắt đầu sau khoảng 1 tiếng nữa.`,
        url: "/schedule",
      });
    }

    await prisma.scheduleItem.update({
      where: { id: item.id },
      data: { notified1hBefore: true },
    });
  }
}

// ─── Nhắc "còn buổi chưa đánh giá" ────────────────────────────────────────
// Quét các buổi HÔM NAY đã kết thúc ít nhất 30 phút (đúng điều kiện được
// phép đánh giá — đồng bộ với getPendingScheduleFeedback ở schedule.controller.ts)
// mà CHƯA gửi nhắc (notifiedFeedbackReminder = false). Chỉ gửi cho những
// người trong danh sách tham gia buổi mà TẠI THỜI ĐIỂM QUÉT vẫn chưa nộp
// đánh giá. Gửi 1 lần duy nhất cho mỗi buổi — không nhắc lại nhiều lần dù
// người đó vẫn chưa nộp sau đó, để tránh làm phiền.
async function checkAndNotifyFeedbackReminders(): Promise<void> {
  const nowVN = nowInVietnam();

  const todayItems = await prisma.scheduleItem.findMany({
    where: {
      date: parseDateOnly(nowVN.dateStr),
      notifiedFeedbackReminder: false,
    },
    include: {
      members: { include: { user: { select: { id: true } } } },
    },
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

  if (eligible.length === 0) return;

  for (const item of eligible) {
    let targetUserIds: number[];

    if (item.allTeam) {
      const access = await prisma.scheduleAccess.findMany({
        select: { userId: true },
      });
      targetUserIds = access.map((a) => a.userId);
    } else {
      targetUserIds = item.members.map((m) => m.user.id);
    }

    if (targetUserIds.length > 0) {
      const submitted = await prisma.scheduleFeedback.findMany({
        where: {
          scheduleItemId: item.id,
          userId: { in: targetUserIds },
        },
        select: { userId: true },
      });
      const submittedIds = new Set(submitted.map((s) => s.userId));
      const pendingUserIds = targetUserIds.filter(
        (id) => !submittedIds.has(id),
      );

      if (pendingUserIds.length > 0) {
        await sendPushToUsers(pendingUserIds, {
          title: "Bạn có buổi chưa đánh giá",
          body: `"${item.title}" (${item.startTime}–${item.endTime}) đã kết thúc — hãy vào đánh giá nhé!`,
          url: "/schedule",
        });
      }
    }

    await prisma.scheduleItem.update({
      where: { id: item.id },
      data: { notifiedFeedbackReminder: true },
    });
  }
}

export function startScheduleNotificationCron(): void {
  // Chạy mỗi phút — cú pháp cron "* * * * *"
  cron.schedule("* * * * *", () => {
    checkAndNotifyUpcomingSessions().catch((err) =>
      console.error("[schedule-notification-cron] Lỗi (1h-before):", err),
    );
    checkAndNotifyFeedbackReminders().catch((err) =>
      console.error(
        "[schedule-notification-cron] Lỗi (feedback-reminder):",
        err,
      ),
    );
  });
  console.log("[schedule-notification-cron] Đã khởi động — quét mỗi phút.");
}
