function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function ImportsLoading() {
  return (
    <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="mt-3 h-9 w-56" />
      <SkeletonBlock className="mt-3 h-5 w-80 max-w-full" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock key={index} className="h-20" />
        ))}
      </div>
    </main>
  );
}
