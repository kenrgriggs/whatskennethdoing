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

type AnalyticsRow = {
  category: string;
  label: string;
  todayMins: number;
  weekMins: number;
  weekShare: number;
  categoryStyle: ReturnType<typeof getCategoryStyle>;
};

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatShare(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0) return "0%";
  if (percent < 1) return "<1%";
  if (percent >= 99.5) return "100%";
  return `${Math.round(percent)}%`;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refreshToken]);

  const totals = useMemo(() => {
    if (!data) return { today: 0, week: 0 };

    return {
      today: Object.values(data.todayTotals).reduce((sum, mins) => sum + mins, 0),
      week: Object.values(data.weekTotals).reduce((sum, mins) => sum + mins, 0),
    };
  }, [data]);

  const categoryRows = useMemo<AnalyticsRow[]>(() => {
    if (!data) return [];

    return data.categories
      .map((category) => {
        const todayMins = data.todayTotals[category] ?? 0;
        const weekMins = data.weekTotals[category] ?? 0;

        return {
          category,
          label: getCategoryLabel(category),
          todayMins,
          weekMins,
          weekShare: totals.week > 0 ? (weekMins / totals.week) * 100 : 0,
          categoryStyle: getCategoryStyle(category),
        };
      })
      .sort((a, b) => {
        if (b.weekMins !== a.weekMins) return b.weekMins - a.weekMins;
        if (b.todayMins !== a.todayMins) return b.todayMins - a.todayMins;
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      });
  }, [data, totals.week]);

  const todayVsWeekPercent = useMemo(() => {
    if (totals.week <= 0) return 0;
    return Math.min(100, (totals.today / totals.week) * 100);
  }, [totals.today, totals.week]);

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Time Breakdown</h2>
          <p className="text-sm text-muted-foreground">
            Clear totals and category distribution for this week.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void refresh();
          }}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-muted-foreground">Loading analytics...</p>
      ) : error ? (
        <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="mt-3 rounded-md border border-red-300/40 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-red-500/15"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="mt-5 text-sm text-muted-foreground">No data.</p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-white/15 bg-black/25 p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Today</span>
                <span>{formatShare(todayVsWeekPercent)} of week</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                {formatMinutes(totals.today)}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-300"
                  style={{ width: `${todayVsWeekPercent}%` }}
                />
              </div>
            </article>

            <article className="rounded-xl border border-white/15 bg-black/25 p-4">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>This Week</span>
                <span>{categoryRows.length} categories</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                {formatMinutes(totals.week)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Monday to today, based on your tracked activity.
              </p>
            </article>
          </div>

          {categoryRows.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-muted-foreground">
              No category totals yet for this week.
            </p>
          ) : (
            <section className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Category</span>
                <span className="text-right">Today</span>
                <span className="text-right">Week</span>
              </div>

              <div className="divide-y divide-white/10">
                {categoryRows.map((row) => {
                  const progressWidth =
                    row.weekMins > 0
                      ? Math.max(4, Math.min(100, row.weekShare))
                      : 0;
                  const progressColor =
                    row.categoryStyle.dotStyle.backgroundColor ?? "#7dd3fc";

                  return (
                    <div
                      key={row.category}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                            style={row.categoryStyle.badgeStyle}
                          >
                            <span
                              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                              style={row.categoryStyle.dotStyle}
                            />
                            {row.label}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatShare(row.weekShare)}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${progressWidth}%`,
                              backgroundColor: progressColor,
                            }}
                          />
                        </div>
                      </div>

                      <div className="self-center text-right text-sm font-medium tabular-nums">
                        {formatMinutes(row.todayMins)}
                      </div>
                      <div className="self-center text-right text-sm font-semibold tabular-nums">
                        {formatMinutes(row.weekMins)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            Bars represent each category&apos;s share of your total week time.
          </p>
        </div>
      )}
    </section>
  );
}
