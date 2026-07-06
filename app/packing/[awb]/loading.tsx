function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function PackingResultLoading() {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-72 max-w-full" />
          <SkeletonBlock className="mt-3 h-5 w-96 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-28" />
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-4 p-4">
            <SkeletonBlock className="h-6 w-full" />
            <SkeletonBlock className="h-10 w-48" />
            <SkeletonBlock className="h-28 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-36" />
          <SkeletonBlock className="h-72" />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonBlock className="h-40" />
            <SkeletonBlock className="h-40" />
          </div>
        </div>
      </section>
    </main>
  );
}
