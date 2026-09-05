import { Request, Response } from "express";
import { prisma } from "../database";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

// Lưu (hoặc cập nhật) thông tin đăng ký nhận push của thiết bị hiện tại,
// gắn với user đang đăng nhập. upsert theo endpoint vì mỗi thiết bị/trình
// duyệt sẽ luôn subscribe lại cùng 1 endpoint nếu chưa unsubscribe.
export const subscribePush = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const { endpoint, keys } = req.body as SubscribeBody;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res
      .status(400)
      .json({ success: false, message: "Dữ liệu đăng ký push không hợp lệ" });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: {
      userId: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  res.json({ success: true });
};

// Hủy đăng ký nhận push cho 1 thiết bị (khi user tắt thông báo trên máy đó)
export const unsubscribePush = async (req: Request, res: Response) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    return res.status(400).json({ success: false, message: "Thiếu endpoint" });
  }

  await prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {
    // Không sao nếu endpoint không tồn tại — coi như đã hủy rồi
  });

  res.json({ success: true });
};
