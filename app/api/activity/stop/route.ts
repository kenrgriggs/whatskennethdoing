import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserUpn } from "@/lib/auth";

export async function POST() {
  const userUpn = getUserUpn();
  const now = new Date();

  const open = await prisma.activityEvent.findFirst({
    where: { userUpn, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (open) {
    await prisma.activityEvent.update({
      where: { id: open.id },
      data: { endedAt: now },
    });
  }

  await prisma.activeActivity.deleteMany({ where: { userUpn } });

  return NextResponse.json({ stopped: true });
}