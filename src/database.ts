import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import "dotenv/config";

console.log("DATABASE_URL:", process.env.DATABASE_URL ? "có" : "không có");

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
export const prisma = new PrismaClient({ adapter });
