import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { capabilityHomePath, requireUser } from "@/lib/auth";

export default async function AccessDeniedPage() {
  const user = await requireUser();
  const home = capabilityHomePath(user);

  return (
    <AppShell allowNoAccount>
      <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Access denied</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">You do not have permission to open this page.</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          No protected page information was loaded. Use a permitted workspace or ask the owner to update your permissions.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href={home} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 font-bold text-white">
            Open permitted workspace
          </Link>
          <Link href="/accounts" className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 font-bold text-slate-800">
            Switch account
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
