import { Request, Response } from "express";
import { prisma } from "../database";
import { bunnyService } from "../services/bunny.service";
import fs from "fs";
import crypto from "crypto";

const getFileHash = (filePath: string): string => {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

export const CourseController = {
  async getCourses(req: Request, res: Response) {
    try {
      const courses = await prisma.course.findMany({
        orderBy: { uploadedAt: "asc" },
      });
      res.json(courses);
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  async createCourse(req: Request, res: Response) {
    const file = req.file;

    // 👈 Khi FE hủy request → xóa file tạm
    req.on("close", () => {
      if (!res.writableEnded) {
        if (file && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log("Request bị hủy — đã xóa file tạm");
        }
      }
    });

    try {
      const { title, category, duration, fileSize } = req.body;

      let videoId = null;
      let fileHash = null;

      if (file) {
        // Kiểm tra request đã bị hủy chưa
        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return;
        }

        fileHash = getFileHash(file.path);

        const existing = await prisma.course.findFirst({
          where: { fileHash },
        });
        if (existing) {
          fs.unlinkSync(file.path);
          return res.status(400).json({
            message: `Video này đã được upload trước đó (${existing.title})`,
          });
        }

        // Kiểm tra lại trước khi upload Bunny
        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return;
        }

        videoId = await bunnyService.createVideo(title);

        // Kiểm tra lại sau khi tạo video slot
        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (videoId) await bunnyService.deleteVideo(videoId); // xóa slot vừa tạo
          return;
        }

        await bunnyService.uploadVideo(videoId, file.path);
        fs.unlinkSync(file.path);
      }

      const course = await prisma.course.create({
        data: {
          title,
          category,
          duration: duration ? Number(duration) : null,
          fileSize: fileSize ? Number(fileSize) : null,
          videoId,
          fileHash,
        },
      });

      res.json({ message: "Tạo khóa học thành công", course });
    } catch (error) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      res.status(500).json({ error });
    }
  },

  async updateCourse(req: Request, res: Response) {
    const file = req.file;

    // 👈 Khi FE hủy request → xóa file tạm
    req.on("close", () => {
      if (!res.writableEnded) {
        if (file && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log("Request bị hủy — đã xóa file tạm");
        }
      }
    });

    try {
      const { id } = req.params;
      const { title, category, duration, fileSize } = req.body;

      const exist = await prisma.course.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "Khóa học không tồn tại" });
      }

      let videoId = exist.videoId;
      let fileHash = exist.fileHash;

      if (file) {
        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return;
        }

        fileHash = getFileHash(file.path);

        const existing = await prisma.course.findFirst({
          where: { fileHash, NOT: { id: Number(id) } },
        });
        if (existing) {
          fs.unlinkSync(file.path);
          return res.status(400).json({
            message: `Video này đã được upload trước đó (${existing.title})`,
          });
        }

        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return;
        }

        if (exist.videoId) {
          await bunnyService.deleteVideo(exist.videoId);
        }

        videoId = await bunnyService.createVideo(title);

        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (videoId) await bunnyService.deleteVideo(videoId);
          return;
        }

        await bunnyService.uploadVideo(videoId, file.path);
        fs.unlinkSync(file.path);
      }

      const course = await prisma.course.update({
        where: { id: Number(id) },
        data: {
          title,
          category,
          duration: duration ? Number(duration) : null,
          fileSize: fileSize ? Number(fileSize) : null,
          videoId,
          fileHash,
        },
      });

      res.json({ message: "Cập nhật khóa học thành công", course });
    } catch (error) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      res.status(500).json({ error });
    }
  },

  async deleteCourse(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const exist = await prisma.course.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "Khóa học không tồn tại" });
      }

      if (exist.videoId) {
        await bunnyService.deleteVideo(exist.videoId);
      }

      await prisma.course.delete({ where: { id: Number(id) } });

      res.json({ message: "Xóa khóa học thành công" });
    } catch (error) {
      res.status(500).json({ error });
    }
  },
};
