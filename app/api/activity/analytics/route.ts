import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserUpn } from "@/lib/auth";

type ActivityType = "TICKET" | "PROJECT" | "ADMIN" | "MEETING";

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekLocal() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Mon as week start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export async function GET() {
  const userUpn = getUserUpn();
  const now = new Date();
  const todayStart = startOfTodayLocal();
  const weekStart = startOfWeekLocal();

  const events = await prisma.activityEvent.findMany({
    where: {
      userUpn,
      startedAt: { gte: weekStart },
    },
    orderBy: { startedAt: "desc" },
    take: 500,
  });

  const types: ActivityType[] = ["PROJECT", "TICKET", "MEETING", "ADMIN"];

  const todayTotals: Record<ActivityType, number> = {
    PROJECT: 0,
    TICKET: 0,
    MEETING: 0,
    ADMIN: 0,
  };

  const weekTotals: Record<ActivityType, number> = {
    PROJECT: 0,
    TICKET: 0,
    MEETING: 0,
    ADMIN: 0,
  };

  for (const ev of events) {
    const start = new Date(ev.startedAt);
    const end = ev.endedAt ? new Date(ev.endedAt) : now;
    const mins = minutesBetween(start, end);

    // week totals (all in query are >= weekStart)
    weekTotals[ev.type as ActivityType] =
      (weekTotals[ev.type as ActivityType] ?? 0) + mins;

    // today totals
    if (start >= todayStart) {
      todayTotals[ev.type as ActivityType] =
        (todayTotals[ev.type as ActivityType] ?? 0) + mins;
    }
  }

  return NextResponse.json({
    todayStart,
    weekStart,
    todayTotals,
    weekTotals,
    types,
  });
}