import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSubjectUpn, getViewerRole } from "@/lib/auth";

function redactTitle(label?: string) {
  return label ?? "Busy - perfectly legal and secret activities";
}

export async function GET() {
  const subjectUpn = getSubjectUpn();
  const role = getViewerRole();

  const events = await prisma.activityEvent.findMany({
    where: { userUpn: subjectUpn },
    orderBy: { startedAt: "desc" },
    take: 50,
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
