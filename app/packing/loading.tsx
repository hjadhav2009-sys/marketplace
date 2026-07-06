function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function PackingLoading() {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-56" />
          <SkeletonBlock className="mt-3 h-5 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-32" />
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <SkeletonBlock className="h-14 w-full" />
          <SkeletonBlock className="mt-4 h-72 w-full" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-12" />
            <SkeletonBlock className="h-12" />
          </div>
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      </section>
    </main>
  );
}
