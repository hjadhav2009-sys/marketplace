import { AppShell } from "@/components/AppShell";
import { AwbBarcodeScanner } from "@/components/AwbBarcodeScanner";
import { PageHeader } from "@/components/PageHeader";
import { UniversalScannerPanel } from "@/components/UniversalScannerPanel";
import { requireAccount, requireUser, roleHomePath } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getLatestImportedBatch, getPackingDashboard } from "@/lib/data";
import { redirect } from "next/navigation";
import { directPackFromSearchAction, moveOldPendingToReviewAction, searchAwbAction } from "./actions";

type PackingPageProps = {
  searchParams?: Promise<{
    error?: string;
    notFound?: string;
    multiple?: string;
    q?: string;
    oldPendingReviewed?: string;
    directPacked?: string;
    intent?: string;
    accountId?: string;
    scanSuccess?: string;
    scanError?: string;
  }>;
};

export default async function PackingAwbPage({ searchParams }: PackingPageProps) {
  const user = await requireUser();
  const canUseScanner = user.role === "OWNER"
    || hasWorkPermission(user, "canPick")
    || hasWorkPermission(user, "canMark")
    || hasWorkPermission(user, "canPack")
    || hasWorkPermission(user, "canViewAllWork")
    || hasWorkPermission(user, "canManageConsignments");
  if (!canUseScanner) redirect(roleHomePath(user.role));
  const account = await requireAccount(user);
  const params = await searchParams;
  const canPack = hasWorkPermission(user, "canPack");
  const packingData = canPack
    ? await Promise.all([getPackingDashboard(account.id), getLatestImportedBatch(account.id)])
    : null;
  const dashboard = packingData?.[0];
  const latestBatch = packingData?.[1];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Universal Work Scanner"
        title="Scan any authorized work code"
        description="Scanning performs lookup only. Review the exact match and choose an action."
      />
      <UniversalScannerPanel
        actorUserId={user.id}
        query={params?.q}
        intent={params?.intent === "PICK" || params?.intent === "MARK" || params?.intent === "PACK" ? params.intent : "ANY"}
        accountId={params?.accountId}
        success={params?.scanSuccess}
        error={params?.scanError}
        actionPath="/packing"
      />

      {canPack && dashboard ? (
        <section className="mt-5 space-y-4" data-customer-order-packing>
          <details className="rounded-md border bg-white p-4">
            <summary className="cursor-pointer font-black">Customer Order Packing</summary>
            <div className="mt-4"><AwbBarcodeScanner action={searchAwbAction} directPackAction={directPackFromSearchAction} defaultAwb={params?.q} /></div>
          </details>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">{account.name}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">{user.name}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-teal-700 ring-1 ring-teal-200">Packed today {dashboard.packedTodayCount}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">Today ready {dashboard.todayReadyCount}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">Current batch {latestBatch ? latestBatch.fileName : "none"}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-berry ring-1 ring-pink-200">All pending {dashboard.pendingCount}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Old pending {dashboard.oldPendingCount}</span>
            <span className="whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">Problems {dashboard.problemCount}</span>
          </div>

          {user.role === "OWNER" && dashboard.oldPendingCount > 0 ? (
            <form action={moveOldPendingToReviewAction} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>{dashboard.oldPendingCount} old pending order{dashboard.oldPendingCount === 1 ? "" : "s"} remain in history and reports. Keep today clean by reviewing them separately.</p>
                <button className="min-h-11 rounded-md bg-amber-900 px-4 py-2 font-semibold text-white">Move old pending to review</button>
              </div>
            </form>
          ) : null}
          {params?.oldPendingReviewed ? <Notice tone="success">Old pending review noted for {params.oldPendingReviewed} order{params.oldPendingReviewed === "1" ? "" : "s"}. No orders were deleted or reset.</Notice> : null}
          {params?.directPacked ? <Notice tone="success">{params.directPacked === "already" ? "No ready items were packed. The order may already be packed or marked problem." : `Packed ${params.directPacked} ready item${params.directPacked === "1" ? "" : "s"} from the search result.`}</Notice> : null}
          {params?.error ? <Notice tone="error">Enter a valid Tracking ID / AWB.</Notice> : null}
          {params?.notFound ? <Notice tone="warning">No order matched the supplied Tracking ID / AWB.</Notice> : null}
          {params?.multiple ? <Notice tone="info">Multiple orders matched. Choose the correct Tracking ID / AWB from the live suggestions.</Notice> : null}
          {dashboard.todayReadyCount === 0 ? <Notice tone="success">No ready packing orders from today&apos;s imports. Manual AWB search still checks all READY orders for this account.</Notice> : null}
        </section>
      ) : null}
    </AppShell>
  );
}

function Notice({ tone, children }: { tone: "success" | "error" | "warning" | "info"; children: React.ReactNode }) {
  const style = tone === "success" ? "border-teal-200 bg-teal-50 text-teal-700" : tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-700";
  return <div className={`rounded-md border px-4 py-3 text-sm font-medium ${style}`}>{children}</div>;
}
