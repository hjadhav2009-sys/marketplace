import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { getCleanupCounts } from "@/lib/cleanup";
import { formatDateTime } from "@/lib/format";
import { cleanupDataAction } from "./actions";

type CleanupPageProps = {
  searchParams?: Promise<{
    cleaned?: string;
    count?: string;
    error?: string;
  }>;
};

export default async function OwnerCleanupPage({ searchParams }: CleanupPageProps) {
  await requireUser(["OWNER"]);
  const [params, counts] = await Promise.all([searchParams, getCleanupCounts()]);
  const hasCleanup = counts.some((count) => count.count > 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Retention"
        title="Cleanup temporary data"
        description="Remove old parser previews and operational logs without deleting orders or SKU image mappings."
      />

      {params?.cleaned ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Cleanup complete. Deleted {params.count ?? 0} rows.
        </div>
      ) : null}

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Type CLEANUP exactly before running cleanup.
        </div>
      ) : null}

      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        Cleanup never deletes orders, SKU image mappings, accounts, or users. It only removes old temporary review rows and logs.
      </div>

      {!hasCleanup ? (
        <EmptyState
          title="No cleanup required"
          description="All temporary rows and logs are within the configured retention windows."
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {counts.map((item) => (
          <article key={item.target} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{item.label}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Older than {item.retentionDays} days. Cutoff: {formatDateTime(item.cutoff)}.
                </p>
              </div>
              <div className="rounded-md bg-slate-50 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Eligible rows</p>
                <p className="mt-1 text-2xl font-bold text-slate-950">{item.count}</p>
              </div>
            </div>

            {item.count > 0 ? (
              <form action={cleanupDataAction} className="mt-5 space-y-3">
                <input type="hidden" name="target" value={item.target} />
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Confirmation</span>
                  <input
                    name="confirmation"
                    placeholder="CLEANUP"
                    className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                    required
                  />
                </label>
                <SubmitButton pendingText="Cleaning..." variant="secondary">
                  Cleanup rows
                </SubmitButton>
              </form>
            ) : (
              <p className="mt-5 rounded-md bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700">No rows eligible.</p>
            )}
          </article>
        ))}
      </section>
    </AppShell>
  );
}
