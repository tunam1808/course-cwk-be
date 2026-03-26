// user.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../database";

export const UserController = {
  async createUser(req: Request, res: Response) {
    try {
      const { email, password, fullName, purchasedCategories } = req.body;

      const exist = await prisma.user.findUnique({
        where: { email },
      });

      if (exist) {
        return res.status(400).json({
          message: "Email đã tồn tại",
        });
      }

      const hashPassword = await bcrypt.hash(password, 10);

      // Tạo user trước
      const user = await prisma.user.create({
        data: {
          email,
          password: hashPassword,
          fullName,
          role: "USER",
        },
      });

      // 👇 Nếu có chọn khóa học thì cấp quyền
      if (purchasedCategories && purchasedCategories.length > 0) {
        // Tìm tất cả course thuộc các category được chọn
        const courses = await prisma.course.findMany({
          where: { category: { in: purchasedCategories } },
          select: { id: true },
        });

        // Tạo các bản ghi UserCourse
        await prisma.userCourse.createMany({
          data: courses.map((course) => ({
            userId: user.id,
            courseId: course.id,
          })),
        });
      }

      // Trả về user kèm khóa học đã cấp
      const result = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
          userCourses: {
            select: {
              course: {
                select: { category: true },
              },
            },
          },
        },
      });

      res.json({
        message: "Tạo user thành công",
        user: result,
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
          // 👇 Thêm khóa học đã cấp
          userCourses: {
            select: {
              course: {
                select: { category: true },
              },
            },
          },
        },
      });

      // 👇 Format lại để trả về mảng category cho dễ dùng ở frontend
      const formatted = users.map((user) => ({
        ...user,
        purchasedCategories: [
          // Lấy unique category (tránh trùng nếu có nhiều bài trong 1 khóa)
          ...new Set(user.userCourses.map((uc) => uc.course.category)),
        ],
        userCourses: undefined, // Bỏ field thô, chỉ giữ purchasedCategories
      }));

      res.json(formatted);
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { email, fullName, password, role, purchasedCategories } = req.body;

      const exist = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "User không tồn tại" });
      }

      const hashPassword = password
        ? await bcrypt.hash(password, 10)
        : undefined;

      // Cập nhật thông tin user
      await prisma.user.update({
        where: { id: Number(id) },
        data: {
          email,
          fullName,
          role,
          ...(hashPassword && { password: hashPassword }),
        },
      });

      // 👇 Đồng bộ lại quyền khóa học nếu admin có truyền lên
      if (purchasedCategories !== undefined) {
        // Xóa toàn bộ quyền cũ
        await prisma.userCourse.deleteMany({
          where: { userId: Number(id) },
        });

        // Nếu có chọn khóa học mới thì tạo lại
        if (purchasedCategories.length > 0) {
          const courses = await prisma.course.findMany({
            where: { category: { in: purchasedCategories } },
            select: { id: true },
          });

          await prisma.userCourse.createMany({
            data: courses.map((course) => ({
              userId: Number(id),
              courseId: course.id,
            })),
          });
        }
      }

      // Trả về user đã cập nhật kèm khóa học
      const result = await prisma.user.findUnique({
        where: { id: Number(id) },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
          userCourses: {
            select: {
              course: {
                select: { category: true },
              },
            },
          },
        },
      });

      const formatted = {
        ...result,
        purchasedCategories: [
          ...new Set(result!.userCourses.map((uc) => uc.course.category)),
        ],
        userCourses: undefined,
      };

      res.json({
        message: "Cập nhật user thành công",
        user: formatted,
      });
    } catch (error) {
      res.status(500).json({ error });
    }
  },

  async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const exist = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (!exist) {
        return res.status(404).json({ message: "User không tồn tại" });
      }

      // UserCourse tự xóa theo do onDelete: Cascade
      await prisma.user.delete({
        where: { id: Number(id) },
      });

      res.json({ message: "Xóa user thành công" });
    } catch (error) {
      res.status(500).json({ error });
    }
  },
};
