import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { bunnyService } from "../services/bunny.service";
import { prisma } from "../database";

const router = Router();

// Lấy signed URL để xem video
router.get("/:videoId/signed-url", authenticate, (req, res) => {
  try {
    const videoId = req.params.videoId as string;
    const signedUrl = bunnyService.generateSignedUrl(videoId);
    res.json({ url: signedUrl });
  } catch (error) {
    res.status(500).json({ error });
  }
});

// Lấy download URL (hết hạn sau 30 phút)
router.get("/:videoId/download-url", authenticate, (req, res) => {
  try {
    const videoId = req.params.videoId as string;
    const downloadUrl = bunnyService.generateDownloadUrl(videoId);
    res.json({ url: downloadUrl });
  } catch (error) {
    res.status(500).json({ error });
  }
});

// Proxy download — tải file từ Bunny về rồi trả cho client
router.get("/:videoId/download", authenticate, async (req, res) => {
  try {
    const videoId = req.params.videoId as string;

    console.log("=== DOWNLOAD ===");
    console.log("videoId:", videoId);

    // Bước 1: Lấy thông tin video từ Bunny API
    const infoUrl = bunnyService.generateDownloadUrl(videoId);
    console.log("infoUrl:", infoUrl);

    const infoResponse = await fetch(infoUrl, {
      headers: {
        AccessKey: process.env.BUNNY_ACCESS_KEY!, // 👈 dùng API key
      },
    });
    console.log("infoResponse.status:", infoResponse.status);

    if (!infoResponse.ok) {
      return res.status(404).json({ message: "Video không tồn tại" });
    }

    const videoInfo = await infoResponse.json();
    console.log("videoInfo.directPlayUrl:", videoInfo.directPlayUrl);

    // Bước 2: Lấy direct download URL
    const directUrl =
      videoInfo.directPlayUrl ||
      `https://${process.env.BUNNY_CDN_HOSTNAME}/${videoId}/play_720p.mp4`;
    console.log("directUrl:", directUrl);

    // Bước 3: Fetch file thật với AccessKey
    const fileResponse = await fetch(directUrl, {
      headers: {
        AccessKey: process.env.BUNNY_ACCESS_KEY!, // 👈 dùng API key
      },
    });
    console.log("fileResponse.status:", fileResponse.status);

    if (!fileResponse.ok) {
      return res.status(404).json({ message: "Không thể tải file" });
    }

    // Bước 4: Lấy tên file từ DB
    const course = await prisma.course.findFirst({
      where: { videoId },
      select: { title: true },
    });

    const fileName = `${course?.title || "video"}.mp4`;
    console.log("fileName:", fileName);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    const buffer = await fileResponse.arrayBuffer();
    console.log("buffer size:", buffer.byteLength);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("=== LỖI DOWNLOAD ===", error);
    res.status(500).json({ error });
  }
});

export default router;
