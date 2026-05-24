export default function NetworkBlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Network access blocked</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">This device is outside the allowed local network</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The owner has enabled local network protection. Connect to the shop Wi-Fi or ask the owner to check the
          allowed IP range settings.
        </p>
      </section>
    </main>
  );
}
