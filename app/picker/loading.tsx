function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function PickerLoading() {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-56" />
          <SkeletonBlock className="mt-3 h-5 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-36" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-4 p-4">
              <SkeletonBlock className="h-5 w-28" />
              <SkeletonBlock className="h-8 w-44" />
              <SkeletonBlock className="h-4 w-full" />
              <div className="grid grid-cols-3 gap-2">
                <SkeletonBlock className="h-12" />
                <SkeletonBlock className="h-12" />
                <SkeletonBlock className="h-12" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
