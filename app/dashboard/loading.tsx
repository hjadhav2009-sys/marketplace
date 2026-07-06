function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="mt-3 h-9 w-64" />
      <SkeletonBlock className="mt-3 h-5 w-96 max-w-full" />
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock key={index} className="h-28" />
        ))}
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <SkeletonBlock className="h-80" />
        <SkeletonBlock className="h-80" />
      </section>
    </main>
  );
}
