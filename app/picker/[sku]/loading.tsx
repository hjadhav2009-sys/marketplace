function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function PickerSkuLoading() {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="mt-3 h-9 w-64 max-w-full" />
          <SkeletonBlock className="mt-3 h-5 w-96 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-32" />
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-4 p-4">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-5 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-56" />
          <SkeletonBlock className="h-24" />
        </div>
      </section>
    </main>
  );
}
