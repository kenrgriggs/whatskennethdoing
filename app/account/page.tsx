import Link from "next/link";

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-12 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
          <Link href="/" className="rounded-lg border px-4 py-2 text-sm">
            Back to Dashboard
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Coming Soon</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Account management is not enabled yet. This page is reserved for
            future profile, authentication, and preferences settings.
          </p>
        </section>
      </div>
    </main>
  );
}