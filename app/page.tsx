import { HistoryCard } from "@/components/HistoryCard";
import { NowCard } from "@/components/NowCard";
import { AnalyticsCard } from "@/components/AnalyticsCard";

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
          <AnalyticsCard />
        </section>
      </div>
    </main>
  );
}