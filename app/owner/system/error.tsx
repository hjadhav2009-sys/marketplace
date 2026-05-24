"use client";

import Link from "next/link";

export default function SystemHealthError() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <section className="mx-auto max-w-xl rounded-md border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">System health error</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">System health could not load</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Check the database connection and try again.</p>
        <Link href="/owner" className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
