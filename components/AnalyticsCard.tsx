"use client";

import { useEffect, useMemo, useState } from "react";

type ActivityType = "TICKET" | "PROJECT" | "ADMIN" | "MEETING";

type AnalyticsResponse = {
  todayTotals: Record<ActivityType, number>;
  weekTotals: Record<ActivityType, number>;
  types: ActivityType[];
};

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function AnalyticsCard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activity/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = (await res.json()) as AnalyticsResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const todayTotalAll = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.todayTotals).reduce((a, b) => a + b, 0);
  }, [data]);

  const weekTotalAll = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.weekTotals).reduce((a, b) => a + b, 0);
  }, [data]);

  return (
    <div className="rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
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
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Today</div>
              <div className="text-lg font-semibold">
                {formatMinutes(todayTotalAll)}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">This week</div>
              <div className="text-lg font-semibold">
                {formatMinutes(weekTotalAll)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {data.types.map((t) => (
              <div key={t} className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground">{t}</div>
                <div className="font-medium">
                  {formatMinutes(data.todayTotals[t] ?? 0)} /{" "}
                  {formatMinutes(data.weekTotals[t] ?? 0)}
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground">
              Format: today / week
            </div>
          </div>
        </div>
      )}
    </div>
  );
}