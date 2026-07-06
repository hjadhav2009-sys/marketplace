function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function UploadLoading() {
  return (
    <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:py-8">
      <SkeletonBlock className="h-4 w-20" />
      <SkeletonBlock className="mt-3 h-9 w-72" />
      <SkeletonBlock className="mt-3 h-5 w-96 max-w-full" />
      <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-36" />
        </div>
        <div className="space-y-5">
          <SkeletonBlock className="h-64" />
          <SkeletonBlock className="h-64" />
          <SkeletonBlock className="h-20" />
        </div>
      </section>
    </main>
  );
}
