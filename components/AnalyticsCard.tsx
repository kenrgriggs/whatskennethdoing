"use client";

import { useEffect, useMemo, useState } from "react";
import { getCategoryLabel, getCategoryStyle } from "@/lib/activity-types";

type AnalyticsResponse = {
  todayTotals: Record<string, number>;
  weekTotals: Record<string, number>;
  categories: string[];
};

type AnalyticsCardProps = {
  refreshToken?: number;
};

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function AnalyticsCard({ refreshToken = 0 }: AnalyticsCardProps) {
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
  }, [refreshToken]);

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
        <h4 className="text-xs text-muted-foreground">Advanced Analytics coming soon...</h4>
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
            {data.categories.map((category) => {
              const categoryStyle = getCategoryStyle(category);

              return (
                <div
                  key={category}
                  className="flex items-center justify-between text-sm gap-2"
                >
                  <span
                    className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                    style={categoryStyle.badgeStyle}
                  >
                    <span
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                      style={categoryStyle.dotStyle}
                    />
                    {getCategoryLabel(category)}
                  </span>
                  <div className="font-medium">
                    {formatMinutes(data.todayTotals[category] ?? 0)} /{" "}
                    {formatMinutes(data.weekTotals[category] ?? 0)}
                  </div>
                </div>
              );
            })}
            <div className="text-xs text-muted-foreground">Format: today / week</div>
          </div>
        </div>
      )}
    </div>
  );
}
