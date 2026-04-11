import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import courseRoutes from "./routes/course.routes";
import progressRoutes from "./routes/progress.routes";
import videoRoutes from "./routes/video.routes";
import introRoute from "./routes/intro.router";

dotenv.config();

const app = express();

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://course-cwk.vercel.app",
      "https://coursecwk.com",
      "https://www.coursecwk.com",
    ],
  }),
);

app.use(express.json({ limit: "6gb" }));
app.use(express.urlencoded({ limit: "6gb", extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/intro", introRoute);

app.get("/", (req, res) => {
  res.send("Backend API running...");
});

const PORT = process.env.PORT || 4000;

// 👈 Tăng timeout lên 30 phút
const server = app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

server.timeout = 30 * 60 * 1000;
server.keepAliveTimeout = 30 * 60 * 1000;
