"use client";

import { useState } from "react";
import { HistoryCard } from "@/components/HistoryCard";
import { NowCard } from "@/components/NowCard";

export default function Home() {
  // Bumping this token asks child cards to refetch data.
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {/* Decorative background glow layer (no interaction). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[360px] w-[980px] -translate-x-1/2 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_62%)]" />
        <div className="absolute -left-28 top-44 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
        <header className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-200/80">
                Dashboard
              </p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                What&apos;s Kenneth Doing?
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                Internal transparency tool for live work tracking, detailed
                history, and weekly analytics.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/25 bg-black/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10"
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              Refresh All
            </button>
          </div>
        </header>

        <section className="flex flex-col gap-6">
          <NowCard refreshToken={refreshToken} />
          <HistoryCard refreshToken={refreshToken} />
        </section>
      </div>
    </main>
  );
}
