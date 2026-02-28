import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn, getViewerRole } from "@/lib/auth";

type TaskNotesPair = {
  task: string;
  notes: string;
};

// Keeps suggestion lists compact, unique, and case-insensitive.
function dedupeNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

function buildTaskNotes(values: Array<{ task: string | null; notes: string | null }>) {
  const seen = new Set<string>();
  const out: TaskNotesPair[] = [];

  for (const value of values) {
    const task = value.task?.trim() ?? "";
    const notes = value.notes?.trim() ?? "";
    if (!task || !notes) continue;

    const key = task.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push({ task, notes });
  }

  return out.slice(0, 100);
}

// Supplies task/category suggestions and note templates for quick task entry.
export async function GET() {
  const role = getViewerRole();
  if (role !== "OWNER") return new Response("Forbidden", { status: 403 });

  const subjectUpn = getSubjectUpn();

  const [events, current] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { userUpn: subjectUpn },
      orderBy: { startedAt: "desc" },
      select: { title: true, type: true, notes: true },
      take: 300,
    }),
    prisma.activeActivity.findFirst({
      where: { userUpn: subjectUpn },
      orderBy: { startedAt: "desc" },
      select: { title: true, type: true, notes: true },
    }),
  ]);

  const titles = dedupeNonEmpty([
    ...(current ? [current.title] : []),
    ...events.map((event) => event.title),
  ]).slice(0, 100);

  const categories = dedupeNonEmpty([
    ...(current ? [current.type] : []),
    ...events.map((event) => event.type),
  ]).slice(0, 100);

  const taskNotes = buildTaskNotes([
    ...(current ? [{ task: current.title, notes: current.notes }] : []),
    ...events.map((event) => ({ task: event.title, notes: event.notes })),
  ]);

  return NextResponse.json({ titles, categories, taskNotes });
}
