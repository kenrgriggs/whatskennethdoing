import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn } from "@/lib/auth";

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
  const subjectUpn = getSubjectUpn();
  const now = new Date();
  const todayStart = startOfTodayLocal();
  const weekStart = startOfWeekLocal();

  const events = await prisma.activityEvent.findMany({
    where: {
      userUpn: subjectUpn,
      startedAt: { gte: weekStart },
    },
    orderBy: { startedAt: "desc" },
    take: 500,
  });

  const todayTotals: Record<string, number> = {};
  const weekTotals: Record<string, number> = {};

  for (const ev of events) {
    const start = new Date(ev.startedAt);
    const end = ev.endedAt ? new Date(ev.endedAt) : now;
    const mins = minutesBetween(start, end);
    const category = ev.type.trim() || "General";

    weekTotals[category] = (weekTotals[category] ?? 0) + mins;

    if (start >= todayStart) {
      todayTotals[category] = (todayTotals[category] ?? 0) + mins;
    }
  }

  const categories = Array.from(
    new Set([...Object.keys(todayTotals), ...Object.keys(weekTotals)]),
  ).sort((a, b) => {
    const byWeek = (weekTotals[b] ?? 0) - (weekTotals[a] ?? 0);
    if (byWeek !== 0) return byWeek;
    return a.localeCompare(b);
  });

  return NextResponse.json({
    todayStart,
    weekStart,
    todayTotals,
    weekTotals,
    categories,
  });
}
