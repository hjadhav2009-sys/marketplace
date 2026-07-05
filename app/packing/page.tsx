import { AppShell } from "@/components/AppShell";
import { AwbBarcodeScanner } from "@/components/AwbBarcodeScanner";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount, requireUser } from "@/lib/auth";
import { getLatestImportedBatch, getPackingDashboard } from "@/lib/data";
import { moveOldPendingToReviewAction, searchAwbAction } from "./actions";

type PackingPageProps = {
  searchParams?: Promise<{
    error?: string;
    notFound?: string;
    multiple?: string;
    q?: string;
    oldPendingReviewed?: string;
  }>;
};

export default async function PackingAwbPage({ searchParams }: PackingPageProps) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const [dashboard, latestBatch] = await Promise.all([
    getPackingDashboard(account.id),
    getLatestImportedBatch(account.id)
  ]);
  const params = await searchParams;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Packer"
        title="Scan or search Tracking ID / AWB"
        description="Scan the label or type the last 5 to 8 Tracking ID / AWB characters."
      />

      <AwbBarcodeScanner action={searchAwbAction} defaultAwb={params?.q} />

      <section className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          {account.name}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          {user.name}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-teal-700 ring-1 ring-teal-200">
          Packed today {dashboard.packedTodayCount}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
          Today ready {dashboard.todayReadyCount}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          Current batch {latestBatch ? latestBatch.fileName : "none"}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-berry ring-1 ring-pink-200">
          All pending {dashboard.pendingCount}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          Old pending {dashboard.oldPendingCount}
        </span>
        <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
          Problems {dashboard.problemCount}
        </span>
      </section>

      {user.role === "OWNER" && dashboard.oldPendingCount > 0 ? (
        <form action={moveOldPendingToReviewAction} className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {dashboard.oldPendingCount} old pending order{dashboard.oldPendingCount === 1 ? "" : "s"} remain in history and reports. Keep today clean by reviewing them separately.
            </p>
            <button className="min-h-11 rounded-md bg-amber-900 px-4 py-2 font-semibold text-white">
              Move old pending to review
            </button>
          </div>
        </form>
      ) : null}

      {params?.oldPendingReviewed ? (
        <div className="mt-3 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Old pending review noted for {params.oldPendingReviewed} order{params.oldPendingReviewed === "1" ? "" : "s"}. No orders were deleted or reset.
        </div>
      ) : null}

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Enter a valid Tracking ID / AWB.
        </div>
      ) : null}

      {params?.notFound ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          No order matched Tracking ID / AWB {params.notFound}.
        </div>
      ) : null}

      {params?.multiple ? (
        <div className="mb-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          Multiple orders matched {params.q}. Choose the correct Tracking ID / AWB from the live suggestions.
        </div>
      ) : null}

      {dashboard.todayReadyCount === 0 ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          No ready packing orders from today&apos;s imports. Manual AWB search still checks all READY orders for this account.
        </div>
      ) : null}

    </AppShell>
  );
}
