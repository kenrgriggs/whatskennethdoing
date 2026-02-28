import { AnalyticsCard } from "@/components/AnalyticsCard";

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Analytics</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Track where time is going today and this week. Deeper account-based
            reporting will land here as those features are added.
          </p>
        </header>

        <AnalyticsCard />
      </div>
    </main>
  );
}