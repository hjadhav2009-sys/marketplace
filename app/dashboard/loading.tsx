function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-slate-100 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-8 pt-4 sm:px-6 sm:py-6 xl:py-8" aria-label="Loading operations overview">
      <SkeletonBlock className="h-4 w-44 max-w-full" />
      <SkeletonBlock className="mt-3 h-9 w-72 max-w-full" />
      <SkeletonBlock className="mt-3 h-5 w-[38rem] max-w-full" />
      <SkeletonBlock className="mt-6 h-36 w-full" />
      <section className="mt-7 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} className="h-32 min-w-0" />)}
      </section>
      <section className="mt-8 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2" aria-hidden="true">
        <SkeletonBlock className="h-72 min-w-0" />
        <SkeletonBlock className="h-72 min-w-0" />
      </section>
      <SkeletonBlock className="mt-8 h-80 w-full" />
    </main>
  );
}
