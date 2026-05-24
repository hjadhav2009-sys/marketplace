"use client";

import Link from "next/link";

export default function UploadReviewError() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <section className="mx-auto max-w-xl rounded-md border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">Review error</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Parse review could not load</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Rows were not imported from this screen. Check the batch or upload again.</p>
        <Link href="/owner/uploads/new" className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          Upload again
        </Link>
      </section>
    </main>
  );
}
