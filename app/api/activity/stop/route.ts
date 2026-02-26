import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn, getViewerRole } from "@/lib/auth";

export async function POST() {
  const role = getViewerRole();
  if (role !== "OWNER") return new Response("Forbidden", { status: 403 });

  const subjectUpn = getSubjectUpn();
  const now = new Date();

  const open = await prisma.activityEvent.findFirst({
    where: { userUpn: subjectUpn, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (open) {
    await prisma.activityEvent.update({
      where: { id: open.id },
      data: { endedAt: now },
    });
  }

  await prisma.activeActivity.deleteMany({ where: { userUpn: subjectUpn } });

  return NextResponse.json({ stopped: true });
}
