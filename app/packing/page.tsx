import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AwbBarcodeScanner } from "@/components/AwbBarcodeScanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { getPackingDashboard } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { searchAwbAction } from "./actions";

type PackingPageProps = {
  searchParams?: Promise<{
    error?: string;
    notFound?: string;
    multiple?: string;
    q?: string;
  }>;
};

export default async function PackingAwbPage({ searchParams }: PackingPageProps) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const dashboard = await getPackingDashboard(account.id);
  const params = await searchParams;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Packer"
        title="Scan or search AWB"
        description="Scan the shipping label barcode or type the AWB."
      />

      <AwbBarcodeScanner action={searchAwbAction} defaultAwb={params?.q} />

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected account</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{account.name}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Packer</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{user.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Packed today</p>
            <p className="mt-1 text-2xl font-bold text-mint">{dashboard.packedTodayCount}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</p>
            <p className="mt-1 text-2xl font-bold text-berry">{dashboard.pendingCount}</p>
          </div>
        </div>
      </section>

      {params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Enter a valid AWB.
        </div>
      ) : null}

      {params?.notFound ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          No order matched AWB {params.notFound}.
        </div>
      ) : null}

      {params?.multiple ? (
        <div className="mb-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          Multiple orders matched {params.q}. Choose the correct AWB from the live suggestions.
        </div>
      ) : null}

      {dashboard.pendingCount === 0 ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          No pending packing orders for this account.
        </div>
      ) : null}

      <details className="mt-5 rounded-md border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
          Recent scans
        </summary>
        <div className="divide-y divide-slate-100">
          {dashboard.recentScans.map((scan) => (
            <div key={scan.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="break-all text-base font-bold text-slate-950">AWB {scan.awb}</p>
                <p className="text-slate-500">
                  {scan.scannedBy?.name ?? "Unknown"} / {formatDateTime(scan.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge value={scan.outcome} />
                {scan.order ? (
                  <Link href={`/packing/${encodeURIComponent(scan.order.awb)}`} className="font-semibold text-berry hover:text-pink-800">
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {dashboard.recentScans.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">No recent scans yet.</div>
          ) : null}
        </div>
      </details>
    </AppShell>
  );
}
