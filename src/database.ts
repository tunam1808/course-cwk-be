import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config(); // đọc DATABASE_URL từ .env

export const prisma = new PrismaClient();
