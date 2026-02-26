import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn, getViewerRole } from "@/lib/auth";

type ProjectNotesPair = {
  project: string;
  notes: string;
};

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

function buildProjectNotes(
  values: Array<{ project: string | null; notes: string | null }>,
) {
  const seen = new Set<string>();
  const out: ProjectNotesPair[] = [];

  for (const value of values) {
    const project = value.project?.trim() ?? "";
    const notes = value.notes?.trim() ?? "";
    if (!project || !notes) continue;

    const key = project.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push({ project, notes });
  }

  return out.slice(0, 100);
}

export async function GET() {
  const role = getViewerRole();
  if (role !== "OWNER") return new Response("Forbidden", { status: 403 });

  const subjectUpn = getSubjectUpn();

  const [events, current] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { userUpn: subjectUpn },
      orderBy: { startedAt: "desc" },
      select: { title: true, type: true, project: true, notes: true },
      take: 300,
    }),
    prisma.activeActivity.findFirst({
      where: { userUpn: subjectUpn },
      orderBy: { startedAt: "desc" },
      select: { title: true, type: true, project: true, notes: true },
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

  const projects = dedupeNonEmpty([
    ...(current?.project ? [current.project] : []),
    ...events
      .map((event) => event.project)
      .filter((project): project is string => Boolean(project)),
  ]).slice(0, 100);

  const projectNotes = buildProjectNotes([
    ...(current ? [{ project: current.project, notes: current.notes }] : []),
    ...events.map((event) => ({ project: event.project, notes: event.notes })),
  ]);

  return NextResponse.json({ titles, categories, projects, projectNotes });
}
