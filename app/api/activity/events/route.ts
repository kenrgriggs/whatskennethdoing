import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn, getViewerRole } from "@/lib/auth";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";

const TASK_STATUSES = new Set<TaskStatus>([
  "NOT_STARTED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
]);

function redactTitle(label?: string) {
  return label ?? "Busy - perfectly legal and secret activities";
}

function normalizeStatus(value: unknown): TaskStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!TASK_STATUSES.has(normalized as TaskStatus)) return null;
  return normalized as TaskStatus;
}

function parseOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET() {
  const subjectUpn = getSubjectUpn();
  const role = getViewerRole();

  const events = await prisma.activityEvent.findMany({
    where: { userUpn: subjectUpn },
    orderBy: { startedAt: "desc" },
    take: 300,
  });

  if (role !== "OWNER") {
    return NextResponse.json({
      events: events.map((event) =>
        event.visibility === "REDACTED"
          ? {
              ...event,
              title: redactTitle(event.redactedLabel ?? undefined),
              project: null,
              notes: null,
              referenceId: null,
            }
          : event,
      ),
    });
  }

  return NextResponse.json({ events });
}

export async function PATCH(req: Request) {
  const role = getViewerRole();
  if (role !== "OWNER") return new Response("Forbidden", { status: 403 });

  const subjectUpn = getSubjectUpn();
  const body = (await req.json()) as {
    id?: string;
    title?: string;
    category?: string;
    type?: string;
    status?: string;
    project?: string;
    notes?: string;
    startTime?: string;
    endTime?: string;
  };

  const id = body.id?.trim();
  if (!id) return new Response("Missing event id", { status: 400 });

  const existing = await prisma.activityEvent.findFirst({
    where: { id, userUpn: subjectUpn },
  });

  if (!existing) return new Response("Event not found", { status: 404 });

  const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
  const hasCategory =
    Object.prototype.hasOwnProperty.call(body, "category") ||
    Object.prototype.hasOwnProperty.call(body, "type");
  const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
  const hasProject = Object.prototype.hasOwnProperty.call(body, "project");
  const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
  const hasStartTime = Object.prototype.hasOwnProperty.call(body, "startTime");
  const hasEndTime = Object.prototype.hasOwnProperty.call(body, "endTime");

  const nextTitle = hasTitle ? body.title?.trim() ?? "" : existing.title;
  const nextCategory = hasCategory
    ? (body.category ?? body.type ?? "").trim()
    : existing.type;
  const nextStatus = hasStatus
    ? normalizeStatus(body.status) ?? existing.status
    : existing.status;
  const nextProject = hasProject
    ? body.project?.trim() || null
    : existing.project ?? null;
  const nextNotes = hasNotes ? body.notes?.trim() || null : existing.notes ?? null;
  const parsedStartTime = hasStartTime ? parseOptionalDate(body.startTime) : null;
  const parsedEndTime = hasEndTime ? parseOptionalDate(body.endTime) : undefined;
  const nextStartTime = parsedStartTime ?? existing.startedAt;
  const nextEndTime =
    parsedEndTime === undefined ? existing.endedAt : parsedEndTime;

  if (!nextTitle || !nextCategory) {
    return new Response("Task and category are required", { status: 400 });
  }

  if (nextEndTime && nextEndTime.getTime() < nextStartTime.getTime()) {
    return new Response("End time must be after start time", { status: 400 });
  }

  if (existing.endedAt !== null && parsedEndTime === null) {
    return new Response("Re-opening historical events is not supported", {
      status: 400,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.activityEvent.update({
      where: { id: existing.id },
      data: {
        title: nextTitle,
        type: nextCategory,
        status: nextStatus,
        project: nextProject,
        notes: nextNotes,
        startedAt: nextStartTime,
        endedAt: nextEndTime,
      },
    });

    if (event.endedAt === null) {
      await tx.activeActivity.upsert({
        where: { id: `${subjectUpn}:active` },
        update: {
          userUpn: subjectUpn,
          title: event.title,
          type: event.type,
          status: event.status,
          project: event.project,
          notes: event.notes,
          referenceId: event.referenceId,
          startedAt: event.startedAt,
          lastHeartbeatAt: new Date(),
          visibility: event.visibility,
          redactedLabel: event.redactedLabel,
        },
        create: {
          id: `${subjectUpn}:active`,
          userUpn: subjectUpn,
          title: event.title,
          type: event.type,
          status: event.status,
          project: event.project,
          notes: event.notes,
          referenceId: event.referenceId,
          startedAt: event.startedAt,
          lastHeartbeatAt: new Date(),
          visibility: event.visibility,
          redactedLabel: event.redactedLabel,
        },
      });
    } else if (existing.endedAt === null) {
      await tx.activeActivity.deleteMany({ where: { userUpn: subjectUpn } });
    }

    return event;
  });

  return NextResponse.json({ event: updated });
}
