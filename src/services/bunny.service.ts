import fs from "fs";
import crypto from "crypto";

const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_TOKEN_KEY = process.env.BUNNY_TOKEN_KEY;
const BUNNY_CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME;

export const bunnyService = {
  async createVideo(title: string): Promise<string> {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: BUNNY_ACCESS_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      },
    );
    const data = await response.json();
    console.log("=== BUNNY CREATE RESPONSE ===", JSON.stringify(data));
    return data.guid;
  },

  // ✅ FIX: Dùng stream thay vì readFileSync để tránh load toàn bộ file vào RAM
  async uploadVideo(videoId: string, filePath: string): Promise<void> {
    const fileStream = fs.createReadStream(filePath);
    const fileSize = fs.statSync(filePath).size;

    const response = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
      {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_ACCESS_KEY!,
          "Content-Type": "application/octet-stream",
          "Content-Length": fileSize.toString(),
        },
        body: fileStream as any,
        // @ts-ignore — Node fetch yêu cầu duplex khi body là stream
        duplex: "half",
      },
    );
    console.log("=== BUNNY UPLOAD RESPONSE ===", response.status);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upload thất bại (${response.status}): ${errText}`);
    }
  },

  async deleteVideo(videoId: string): Promise<void> {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
      {
        method: "DELETE",
        headers: {
          AccessKey: BUNNY_ACCESS_KEY!,
        },
      },
    );
    console.log("=== BUNNY DELETE RESPONSE ===", response.status);
  },

  generateSignedUrl(videoId: string): string {
    const expires = Math.floor(Date.now() / 1000) + 60 * 60;
    const hashableBase = `${BUNNY_TOKEN_KEY}${videoId}${expires}`;
    const token = crypto
      .createHash("sha256")
      .update(hashableBase)
      .digest("hex");

    const url = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}?token=${token}&expires=${expires}&autoplay=false`;
    console.log("signedUrl:", url);
    return url;
  },

  generateDownloadUrl(videoId: string): string {
    const url = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`;
    console.log("downloadUrl:", url);
    return url;
  },
};
