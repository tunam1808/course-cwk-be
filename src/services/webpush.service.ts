import webpush from "web-push";
import { prisma } from "../database";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY as string;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY as string;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@coursecwk.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn(
    "[webpush] Thiếu VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY trong .env — push notification sẽ không hoạt động.",
  );
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Gửi push cho TẤT CẢ thiết bị đã đăng ký của 1 user (1 user có thể cài PWA
// trên nhiều máy). Tự động xóa các subscription đã hết hạn/không còn hợp lệ
// (HTTP 404/410 từ push service) để tránh gửi lại vô ích ở những lần sau.
export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          console.error("[webpush] Gửi thất bại:", err);
        }
      }
    }),
  );
}

export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload,
): Promise<void> {
  await Promise.all(userIds.map((id) => sendPushToUser(id, payload)));
}
