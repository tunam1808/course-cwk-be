import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../database";

export const AuthController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(404).json({
          message: "User không tồn tại",
        });
      }

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(401).json({
          message: "Sai mật khẩu",
        });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: "1d" },
      );

      res.json({
        message: "Đăng nhập thành công",
        token,
        user: {
          id: user.id,
          email: user.email, // ✅
          role: user.role,
        },
      });
    } catch (error) {
      console.error("LOGIN ERROR:", error);
      res.status(500).json({ error: String(error) });
    }
  },
};
