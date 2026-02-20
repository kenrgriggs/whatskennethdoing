import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserUpn } from "@/lib/auth";

export async function GET() {
  const userUpn = getUserUpn();
  const events = await prisma.activityEvent.findMany({
    where: { userUpn },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ events });
}