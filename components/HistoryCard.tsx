"use client";

import { useEffect, useMemo, useState } from "react";

type ActivityType = "TICKET" | "PROJECT" | "ADMIN" | "MEETING";

type ActivityEvent = {
  id: string;
  userUpn: string;
  title: string;
  type: ActivityType;
  referenceId: string | null;
  startedAt: string;
  endedAt: string | null;
};

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDayKey(d: Date) {
  // YYYY-MM-DD local
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function minutesBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 60000));
}

export function HistoryCard() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activity/events", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load events");
      const data = (await res.json()) as { events: ActivityEvent[] };
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const ev of events) {
      const dayKey = formatDayKey(new Date(ev.startedAt));
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(ev);
    }
    // Ensure each day is sorted newest-first within day
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
      map.set(k, arr);
    }
    // Sort days newest-first
    const days = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
    return days.map((dayKey) => ({
      dayKey,
      label: formatDayLabel(new Date(dayKey + "T00:00:00")),
      items: map.get(dayKey)!,
    }));
  }, [events]);

  return (
    <div className="rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <button
          className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50"
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No history yet. Set an activity to create the first event.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.dayKey} className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {group.label}
              </div>

              <div className="space-y-2">
                {group.items.map((ev) => {
                  const start = new Date(ev.startedAt);
                  const end = ev.endedAt ? new Date(ev.endedAt) : null;
                  const mins = end ? minutesBetween(start, end) : null;

                  return (
                    <div
                      key={ev.id}
                      className="rounded-lg border px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {ev.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ev.type}
                            {ev.referenceId ? ` • ${ev.referenceId}` : ""}
                          </div>
                        </div>

                        <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          <div>
                            {formatTime(start)}
                            {end ? `–${formatTime(end)}` : "–…"}
                          </div>
                          <div>{mins !== null ? `${mins}m` : "active"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}