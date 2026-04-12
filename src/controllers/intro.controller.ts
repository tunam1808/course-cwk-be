// controllers/intro.controller.ts
import { Request, Response } from "express";
import { prisma } from "../database";
import { bunnyService } from "../services/bunny.service";
import crypto from "crypto";

const VALID_SLOTS = [1, 2, 3, 4, 5, 6] as const;
type Slot = (typeof VALID_SLOTS)[number];

function parseSlot(value: unknown): Slot | null {
  const n = Number(value);
  return VALID_SLOTS.includes(n as Slot) ? (n as Slot) : null;
}

export const IntroController = {
  /**
   * GET /api/intro
   * Trả về tất cả 6 slot intro
   */
  async getIntro(_req: Request, res: Response) {
    try {
      const intros = await prisma.intro.findMany({
        orderBy: { slot: "asc" },
      });

      // Đảm bảo luôn trả về đủ 6 slot (nếu thiếu thì tạo placeholder)
      const result = [1, 2, 3, 4, 5, 6].map((slot) => {
        const existing = intros.find((i) => i.slot === slot);
        return (
          existing || { slot, videoId: null, createdAt: null, updatedAt: null }
        );
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },

  /**
   * POST /api/intro/prepare
   * Tạo video slot trên Bunny (KHÔNG cần slot ở bước này)
   */
  async prepareUpload(req: Request, res: Response) {
    try {
      const videoId = await bunnyService.createVideo("intro");
      res.json({ videoId });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },

  /**
   * POST /api/intro/sign
   * Tạo signature để upload TUS
   */
  async signUpload(req: Request, res: Response) {
    try {
      const { videoId } = req.body;

      if (!videoId) {
        return res.status(400).json({ message: "Thiếu videoId" });
      }

      const expire = Math.floor(Date.now() / 1000) + 60 * 60; // 1 giờ

      const signature = crypto
        .createHash("sha256")
        .update(
          `${process.env.BUNNY_LIBRARY_ID}${process.env.BUNNY_ACCESS_KEY}${expire}${videoId}`,
        )
        .digest("hex");

      res.json({ signature, expire });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },

  /**
   * POST /api/intro/save
   * Lưu videoId vào slot cụ thể
   */
  async saveIntro(req: Request, res: Response) {
    try {
      const { videoId, slot } = req.body;
      const parsedSlot = parseSlot(slot);

      if (!videoId) {
        return res.status(400).json({ message: "Thiếu videoId" });
      }
      if (!parsedSlot) {
        return res
          .status(400)
          .json({ message: "slot phải là 1, 2, 3, 4, 5 hoặc 6" });
      }

      const existing = await prisma.intro.findUnique({
        where: { slot: parsedSlot },
      });

      // Xóa video cũ trên Bunny nếu có
      if (existing?.videoId && existing.videoId !== videoId) {
        await bunnyService.deleteVideo(existing.videoId).catch(() => {});
      }

      const intro = await prisma.intro.upsert({
        where: { slot: parsedSlot },
        update: { videoId },
        create: { slot: parsedSlot, videoId },
      });

      res.json({
        message: `Lưu video intro slot ${parsedSlot} thành công`,
        intro,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },

  /**
   * DELETE /api/intro/:slot
   */
  async deleteIntro(req: Request, res: Response) {
    try {
      const slot = parseSlot(req.params.slot);
      if (!slot) {
        return res
          .status(400)
          .json({ message: "slot phải là 1, 2, 3, 4, 5 hoặc 6" });
      }

      const intro = await prisma.intro.findUnique({ where: { slot } });
      if (!intro) {
        return res
          .status(404)
          .json({ message: `Không tìm thấy video intro slot ${slot}` });
      }

      if (intro.videoId) {
        await bunnyService.deleteVideo(intro.videoId).catch(() => {});
      }

      await prisma.intro.delete({ where: { slot } });

      res.json({ message: `Xóa video intro slot ${slot} thành công` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },
};
