"use client";

import { useState } from "react";
import { HistoryCard } from "@/components/HistoryCard";
import { NowCard } from "@/components/NowCard";

export default function Home() {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
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

        <section className="flex flex-col gap-6">
          <div className="shrink-0">
            <NowCard refreshToken={refreshToken} />
          </div>
          <div>
            <HistoryCard refreshToken={refreshToken} />
          </div>
        </section>
      </div>
    </main>
  );
}
