"use client";

import { useState } from "react";
import { HistoryCard } from "@/components/HistoryCard";
import { NowCard } from "@/components/NowCard";
import { AnalyticsCard } from "@/components/AnalyticsCard";

export default function Home() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <header className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">
                What&apos;s Kenneth Doing?
              </h1>
              <p className="text-muted-foreground">
                Internal transparency tool for current work, history, and
                analytics.
              </p>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-lg border text-sm"
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              Refresh All
            </button>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-3">
            <NowCard refreshToken={refreshToken} />
          </div>
          <div className="md:col-span-2">
            <HistoryCard refreshToken={refreshToken} />
          </div>
          <div className="md:col-span-1">
            <AnalyticsCard refreshToken={refreshToken} />
          </div>
        </section>
      </div>
    </main>
  );
}
