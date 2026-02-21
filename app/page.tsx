import { HistoryCard } from "@/components/HistoryCard";
import { NowCard } from "@/components/NowCard";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Kenneth — Activity Dashboard
          </h1>
          <p className="text-muted-foreground">
            Internal transparency tool for current work, history, and analytics.
          </p>
        </header>

        <section className="grid md:grid-cols-3 gap-6">
          <NowCard />
          <HistoryCard />

          <div className="rounded-xl border p-6 space-y-4">
            <h2 className="text-lg font-semibold">History</h2>
            <p className="text-sm text-muted-foreground">
              Recent activity timeline will appear here.
            </p>
          </div>

          <div className="rounded-xl border p-6 space-y-4">
            <h2 className="text-lg font-semibold">Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Time breakdown and metrics coming soon.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}