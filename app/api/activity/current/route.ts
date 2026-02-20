import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserUpn } from "@/lib/auth";

export async function GET() {
  const userUpn = getUserUpn();
  const current = await prisma.activeActivity.findFirst({ where: { userUpn } });
  return NextResponse.json({ current });
}

export async function POST(req: Request) {
  const userUpn = getUserUpn();
  const body = await req.json();
  const { title, type, referenceId } = body as {
    title: string;
    type: "TICKET" | "PROJECT" | "ADMIN" | "MEETING";
    referenceId?: string;
  };

  const now = new Date();

  const active = await prisma.activeActivity.upsert({
    where: { id: `${userUpn}:active` },
    update: { title, type, referenceId, lastHeartbeatAt: now },
    create: {
      id: `${userUpn}:active`,
      userUpn,
      title,
      type,
      referenceId,
      startedAt: now,
      lastHeartbeatAt: now,
    },
  });

  // Ensure there is an open event; if one exists, update title/type/referenceId.
  const open = await prisma.activityEvent.findFirst({
    where: { userUpn, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (open) {
    await prisma.activityEvent.update({
      where: { id: open.id },
      data: { title, type, referenceId },
    });
  } else {
    await prisma.activityEvent.create({
      data: { userUpn, title, type, referenceId, startedAt: now },
    });
  }

  return NextResponse.json({ active });
}