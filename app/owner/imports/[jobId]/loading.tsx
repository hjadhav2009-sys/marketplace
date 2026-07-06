function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function ImportJobDetailLoading() {
  return (
    <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
      <SkeletonBlock className="h-4 w-32" />
      <SkeletonBlock className="mt-3 h-9 w-72 max-w-full" />
      <SkeletonBlock className="mt-3 h-5 w-[32rem] max-w-full" />
      <section className="mt-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex justify-between gap-4">
          <div className="flex-1">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="mt-2 h-7 w-96 max-w-full" />
            <SkeletonBlock className="mt-2 h-4 w-64" />
          </div>
          <SkeletonBlock className="h-10 w-32" />
        </div>
        <SkeletonBlock className="mt-6 h-3 w-full rounded-full" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonBlock key={index} className="h-20" />
          ))}
        </div>
      </section>
    </main>
  );
}
