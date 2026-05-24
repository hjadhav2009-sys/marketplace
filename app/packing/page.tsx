import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { searchAwbAction } from "./actions";

type PackingPageProps = {
  searchParams?: Promise<{
    error?: string;
    notFound?: string;
  }>;
};

export default async function PackingAwbPage({ searchParams }: PackingPageProps) {
  const user = await requireUser(["OWNER", "PACKER"]);
  await requireAccount(user);
  const params = await searchParams;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Packer"
        title="Scan or search AWB"
        description="Use the mobile camera scanner once added, or type the AWB from the shipping label to verify the exact order."
      />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Manual AWB entry</h2>

          {params?.error ? (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Enter a valid AWB.
            </div>
          ) : null}

          {params?.notFound ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              No order matched AWB {params.notFound}.
            </div>
          ) : null}

          <form action={searchAwbAction} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">AWB</span>
              <input
                name="awb"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1490834915493571"
                className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 text-lg font-semibold outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                required
              />
            </label>
            <SubmitButton pendingText="Searching...">Find order</SubmitButton>
          </form>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex min-h-72 flex-col items-center justify-center rounded-md border border-dashed border-slate-600 bg-slate-900 p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-pink-200">Scanner placeholder</p>
            <h2 className="mt-2 text-2xl font-bold">Mobile camera scan</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
              The route is ready for a browser barcode scanner package. Keep the AWB search action as the single backend
              entry point so camera and manual scans log the same way.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
