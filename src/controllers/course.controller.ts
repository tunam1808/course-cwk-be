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

  async prepareUpload(req: Request, res: Response) {
    try {
      const { title } = req.body;
      const videoId = await bunnyService.createVideo(title);
      res.json({ videoId });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },

  // 👇 THÊM MỚI: Tạo signature cho tus upload
  async signUpload(req: Request, res: Response) {
    try {
      const { videoId } = req.body;
      const expire = Math.floor(Date.now() / 1000) + 60 * 60;
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

  async saveCourse(req: Request, res: Response) {
    try {
      const { title, category, duration, fileSize, videoId } = req.body;
      const course = await prisma.course.create({
        data: {
          title,
          category,
          duration: duration ? Number(duration) : null,
          fileSize: fileSize ? Number(fileSize) : null,
          videoId: videoId || null,
        },
      });
      res.json({ message: "Tạo khóa học thành công", course });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  },

  async createCourse(req: Request, res: Response) {
    const file = req.file;

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

        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          return;
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
      const { title, category, duration, fileSize, videoId } = req.body;

      const exist = await prisma.course.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "Khóa học không tồn tại" });
      }

      let newVideoId = exist.videoId;
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

        newVideoId = await bunnyService.createVideo(title);

        if (req.socket.destroyed) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (newVideoId) await bunnyService.deleteVideo(newVideoId);
          return;
        }

        await bunnyService.uploadVideo(newVideoId, file.path);
        fs.unlinkSync(file.path);
      }

      if (videoId && videoId !== exist.videoId) {
        if (exist.videoId) await bunnyService.deleteVideo(exist.videoId);
        newVideoId = videoId;
      }

      const course = await prisma.course.update({
        where: { id: Number(id) },
        data: {
          title,
          category,
          duration: duration ? Number(duration) : null,
          fileSize: fileSize ? Number(fileSize) : null,
          videoId: newVideoId,
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
