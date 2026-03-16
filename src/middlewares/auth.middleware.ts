import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Mở rộng Request để thêm user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: string;
      };
    }
  }
}

// Kiểm tra token hợp lệ
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: "Không có token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      role: string;
    };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};

// Kiểm tra role ADMIN
export const authorizeAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Không có quyền truy cập" });
  }
  next();
};
