import { Request, Response } from "express";
import { prisma } from "../database";

export const ProgressController = {
  // Lấy danh sách courseId đã hoàn thành của user
  async getProgress(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const progress = await prisma.progress.findMany({
        where: { userId },
        select: { courseId: true },
      });
      res.json(progress.map((p) => p.courseId));
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  // Đánh dấu hoàn thành
  async markComplete(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const courseId = Number(req.params.courseId);

      await prisma.progress.upsert({
        where: { userId_courseId: { userId, courseId } },
        update: {},
        create: { userId, courseId },
      });

      res.json({ message: "Đánh dấu hoàn thành thành công" });
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  // Bỏ đánh dấu hoàn thành
  async markIncomplete(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const courseId = Number(req.params.courseId);

      await prisma.progress.deleteMany({
        where: { userId, courseId },
      });

      res.json({ message: "Bỏ đánh dấu thành công" });
    } catch (error) {
      res.status(500).json({ error });
    }
  },
};
