import { Request, Response } from "express";
import { prisma } from "../database";

export const getCountdown = async (req: Request, res: Response) => {
  const setting = await prisma.countdownSetting.findUnique({
    where: { id: 1 },
  });

  if (!setting) return res.json({ active: false, visible: false });

  res.json({
    ...setting,
    durationMs: setting.durationMs ? Number(setting.durationMs) : null,
  });
};

export const updateCountdown = async (req: Request, res: Response) => {
  const { active, visible, durationMs, resetTimer } = req.body;

  const setting = await prisma.countdownSetting.upsert({
    where: { id: 1 },
    update: {
      active,
      visible,
      durationMs: durationMs ? BigInt(durationMs) : null,
      ...(resetTimer && { startTime: active ? new Date() : null }),
    },
    create: {
      id: 1,
      active,
      visible,
      durationMs: durationMs ? BigInt(durationMs) : null,
      startTime: active ? new Date() : null,
    },
  });

  res.json({
    success: true,
    setting: {
      ...setting,
      durationMs: setting.durationMs ? Number(setting.durationMs) : null,
    },
  });
};

// ─── Lucky Number ─────────────────────────────────────────────────────────────
export const getLuckySetting = async (req: Request, res: Response) => {
  const setting = await prisma.luckySetting.findUnique({ where: { id: 1 } });
  res.json({ showLuckyNumber: setting?.showLuckyNumber ?? false });
};

export const updateLuckySetting = async (req: Request, res: Response) => {
  const { showLuckyNumber } = req.body;

  const setting = await prisma.luckySetting.upsert({
    where: { id: 1 },
    update: { showLuckyNumber },
    create: { id: 1, showLuckyNumber },
  });

  res.json({ success: true, showLuckyNumber: setting.showLuckyNumber });
};
