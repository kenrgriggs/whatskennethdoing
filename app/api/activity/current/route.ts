import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn, getViewerRole } from "@/lib/auth";

type Visibility = "PUBLIC" | "REDACTED";
type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";

// Canonical status values accepted by API input and DB writes.
const TASK_STATUSES = new Set<TaskStatus>([
  "NOT_STARTED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
]);

function redactTitle(label?: string) {
  return label ?? "Busy - perfectly legal and secret activities";
}

function parseOptionalDate(value?: string) {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeStatus(value?: string): TaskStatus {
  const normalized = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (TASK_STATUSES.has(normalized as TaskStatus)) {
    return normalized as TaskStatus;
  }

  return "IN_PROGRESS";
}

// Returns currently active task for the tracked subject.
export async function GET() {
  const subjectUpn = getSubjectUpn();
  const role = getViewerRole();

  const current = await prisma.activeActivity.findFirst({
    where: { userUpn: subjectUpn },
  });

  if (!current) return NextResponse.json({ current: null });

  if (role !== "OWNER" && current.visibility === "REDACTED") {
    return NextResponse.json({
      current: {
        ...current,
        title: redactTitle(current.redactedLabel ?? undefined),
        project: null,
        notes: null,
        referenceId: null,
      },
    });
  }

  return NextResponse.json({ current });
}

// Creates a new activity event and updates activeActivity (or closes immediately if endTime is provided).
export async function POST(req: Request) {
  try {
    const role = getViewerRole();
    if (role !== "OWNER") return new Response("Forbidden", { status: 403 });

    const subjectUpn = getSubjectUpn();
    const body = (await req.json()) as {
      title?: string;
      category?: string;
      type?: string;
      status?: string;
      notes?: string;
      startTime?: string;
      endTime?: string;
      referenceId?: string;
      visibility?: Visibility;
      redactedLabel?: string;
    };

    const title = body.title?.trim() ?? "";
    const category = (body.category ?? body.type ?? "").trim();
    const status = normalizeStatus(body.status);
    const notes = body.notes?.trim();
    const startTime = parseOptionalDate(body.startTime);
    const endTime = parseOptionalDate(body.endTime);
    const referenceId = body.referenceId?.trim();
    const visibility = body.visibility;
    const redactedLabel = body.redactedLabel?.trim();
    const now = new Date();
    const startedAt = startTime ?? now;

    if (!title || !category) {
      return new Response("Both title and category are required", { status: 400 });
    }

    if (endTime && endTime.getTime() < startedAt.getTime()) {
      return new Response("End time must be after start time", { status: 400 });
    }

    const active = await prisma.$transaction(async (tx) => {
      // Close any currently open event when a new task is set.
      await tx.activityEvent.updateMany({
        where: { userUpn: subjectUpn, endedAt: null },
        data: { endedAt: startedAt },
      });

      await tx.activityEvent.create({
        data: {
          id: crypto.randomUUID(),
          userUpn: subjectUpn,
          title,
          type: category,
          status,
          project: null,
          notes: notes ?? null,
          referenceId: referenceId ?? null,
          startedAt,
          endedAt: endTime ?? null,
          visibility: visibility ?? "PUBLIC",
          redactedLabel: redactedLabel ?? null,
        },
      });

      if (endTime) {
        await tx.activeActivity.deleteMany({ where: { userUpn: subjectUpn } });
        return null;
      }

      return tx.activeActivity.upsert({
        where: { id: `${subjectUpn}:active` },
        update: {
          title,
          type: category,
          status,
          project: null,
          notes: notes ?? null,
          referenceId: referenceId ?? null,
          startedAt,
          lastHeartbeatAt: now,
          visibility: visibility ?? "PUBLIC",
          redactedLabel: redactedLabel ?? null,
        },
        create: {
          id: `${subjectUpn}:active`,
          userUpn: subjectUpn,
          title,
          type: category,
          status,
          project: null,
          notes: notes ?? null,
          referenceId: referenceId ?? null,
          startedAt,
          lastHeartbeatAt: now,
          visibility: visibility ?? "PUBLIC",
          redactedLabel: redactedLabel ?? null,
        },
      });
    });

    return NextResponse.json({ active });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (message.includes("Unknown argument `status`")) {
      return NextResponse.json(
        {
          error:
            "Server restart required after schema update. Stop dev server, clear .next, run `npx prisma generate`, then `npm run dev`.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to save task. Check server logs for details." },
      { status: 500 },
    );
  }
}
