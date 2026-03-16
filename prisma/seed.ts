import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcryptjs from "bcryptjs";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await bcryptjs.hash("cocaiconcachahahaha", 10);

  await prisma.user.upsert({
    where: { email: "cwkphuong@gmail.com" },
    update: { password },
    create: {
      email: "cwkphuong@gmail.com",
      password,
      role: Role.ADMIN,
    },
  });

  console.log("Admin seeded!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
