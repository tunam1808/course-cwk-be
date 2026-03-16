// File này để admin tạo tài khoản users
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../database";

export const UserController = {
  async createUser(req: Request, res: Response) {
    try {
      const { email, password, fullName } = req.body;

      const exist = await prisma.user.findUnique({
        where: { email },
      });

      if (exist) {
        return res.status(400).json({
          message: "Email đã tồn tại",
        });
      }

      const hashPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashPassword,
          fullName,
          role: "USER",
        },
      });

      res.json({
        message: "Tạo user thành công",
        user,
      });
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  async getUsers(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      res.json(users);
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  // 👇 Thêm mới
  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { email, fullName, password, role } = req.body;

      // Kiểm tra user tồn tại không
      const exist = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "User không tồn tại" });
      }

      // Nếu có đổi password thì hash lại
      const hashPassword = password
        ? await bcrypt.hash(password, 10)
        : undefined;

      const user = await prisma.user.update({
        where: { id: Number(id) },
        data: {
          email,
          fullName,
          role,
          ...(hashPassword && { password: hashPassword }),
        },
      });

      res.json({
        message: "Cập nhật user thành công",
        user,
      });
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  // 👇 Thêm mới
  async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Kiểm tra user tồn tại không
      const exist = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "User không tồn tại" });
      }

      await prisma.user.delete({
        where: { id: Number(id) },
      });

      res.json({ message: "Xóa user thành công" });
    } catch (error) {
      res.status(500).json({ error });
    }
  },
};
