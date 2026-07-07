import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { compactNumber, formatDateTime } from "@/lib/format";
import { getReportsData, maskReportTrackingKey, reportStatuses } from "@/lib/reports";

type ReportsPageProps = {
  searchParams?: Promise<{
    accountId?: string;
    marketplace?: string;
    batchId?: string;
    sku?: string;
    status?: string;
    courier?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

const statusLabels: Record<string, string> = {
  "": "All statuses",
  ready: "Ready",
  picked: "Picked",
  packed: "Packed",
  problem: "Problem",
  "old-pending": "Old pending",
  "missing-listing": "Missing listing current",
  "missing-image": "Missing image current"
};

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/reports?${next.toString()}`;
}

function exportHref(params: URLSearchParams, type: string, format: "csv" | "xlsx" | "txt") {
  const next = new URLSearchParams(params);
  next.set("type", type);
  next.set("format", format);
  return `/reports/export?${next.toString()}`;
}

function SummaryTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-800">{row.label}</span>
            <span className="font-black text-slate-950">{compactNumber(row.count)}</span>
          </div>
        ))}
        {rows.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">No rows for the current filter.</div> : null}
      </div>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const [params, accounts] = await Promise.all([searchParams, getAvailableAccounts(user)]);
  const reportParams = new URLSearchParams();

  for (const [key, value] of Object.entries({
    accountId: params?.accountId,
    marketplace: params?.marketplace,
    batchId: params?.batchId,
    sku: params?.sku,
    status: params?.status,
    courier: params?.courier,
    from: params?.from,
    to: params?.to
  })) {
    if (value) {
      reportParams.set(key, value);
    }
  }

  const report = await getReportsData({
    accounts,
    selectedAccount,
    filters: params ?? {}
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Reports"
        title="Operations reports"
        description="Filtered owner view for orders, packing, old pending, problems, and current listing/image mapping status."
      >
        <Link href="/owner/old-pending" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
          Old pending review
        </Link>
      </PageHeader>

      <form className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-7">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Account</span>
          <select name="accountId" defaultValue={params?.accountId ?? selectedAccount.id} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.marketplace} / {account.accountDisplayName ?? account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Marketplace</span>
          <select name="marketplace" defaultValue={params?.marketplace ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="FLIPKART">Flipkart</option>
            <option value="MEESHO">Meesho legacy</option>
            <option value="AMAZON">Amazon</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Status</span>
          <select name="status" defaultValue={params?.status ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {reportStatuses.map((status) => (
              <option key={status || "all"} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">From</span>
          <input type="date" name="from" defaultValue={params?.from ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">To</span>
          <input type="date" name="to" defaultValue={params?.to ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">SKU</span>
          <input name="sku" defaultValue={params?.sku ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button className="mt-5 min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white xl:mt-6">Apply</button>
        <label className="block xl:col-span-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Import batch</span>
          <input name="batchId" defaultValue={params?.batchId ?? ""} placeholder="Batch ID" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block xl:col-span-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Courier</span>
          <input name="courier" defaultValue={params?.courier ?? ""} placeholder="Courier" className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </form>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total orders" value={compactNumber(report.summary.totalOrders)} />
        <StatCard label="Today ready" value={compactNumber(report.summary.todayReady)} tone="berry" />
        <StatCard label="Today picked" value={compactNumber(report.summary.todayPicked)} />
        <StatCard label="Today packed" value={compactNumber(report.summary.todayPacked)} tone="mint" />
        <StatCard label="Problems open" value={compactNumber(report.summary.problemsOpen)} tone="clay" />
        <StatCard label="Old pending" value={compactNumber(report.summary.oldPending)} tone="clay" />
        <StatCard label="Missing listing current" value={compactNumber(report.summary.currentMissingListing)} />
        <StatCard label="Missing image current" value={compactNumber(report.summary.currentMissingImage)} />
        <StatCard label="Packed today" value={compactNumber(report.summary.packedToday)} tone="mint" />
        <StatCard label="Pending today" value={compactNumber(report.summary.pendingToday)} tone="berry" />
      </section>

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">Current now vs at import time</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Current now is recalculated from Listing Master. At import time is the warning count saved when the order/listing file was imported.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["order-summary", "packed-orders", "pending-orders", "problem-orders", "old-pending", "missing-listing", "missing-image", "sku-summary"] as const).map((type) => (
              <a key={type} href={exportHref(reportParams, type, "csv")} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800">
                {type} CSV
              </a>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Missing listing at import time</p>
            <p className="mt-1 text-xl font-black text-slate-950">{compactNumber(report.importTime.missingListingRows)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Missing listing current now</p>
            <p className="mt-1 text-xl font-black text-slate-950">{compactNumber(report.summary.currentMissingListing)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Missing image at import time</p>
            <p className="mt-1 text-xl font-black text-slate-950">{compactNumber(report.importTime.missingImageRows)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Missing image current now</p>
            <p className="mt-1 text-xl font-black text-slate-950">{compactNumber(report.summary.currentMissingImage)}</p>
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
          <h2 className="font-semibold text-slate-950">Order rows</h2>
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportHref(reportParams, "order-summary", "xlsx")} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Summary XLSX</a>
            <a href={exportHref(reportParams, "order-summary", "txt")} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Summary TXT</a>
            <Link href={pageHref(reportParams, Math.max(1, report.page - 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Previous</Link>
            <span className="font-semibold text-slate-600">Page {report.page} of {report.totalPages}</span>
            <Link href={pageHref(reportParams, Math.min(report.totalPages, report.page + 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Next</Link>
          </div>
        </div>
        {report.orders.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No report rows" description="Try a wider date range, another account, or a different status filter." />
          </div>
        ) : (
          <>
          <div className="grid gap-3 p-3 md:hidden" data-mobile-card-list>
            {report.orders.map((order) => (
              <article key={order.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm font-black text-slate-950">{order.sku}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{order.marketplace} / {order.account.accountDisplayName ?? order.account.name}</p>
                  </div>
                  <StatusBadge value={order.packStatus} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                  <span>Qty {order.qty}</span>
                  <span>{order.courier ?? "Courier -"}</span>
                  <span className="font-mono">{maskReportTrackingKey(order)}</span>
                  <span>{formatDateTime(order.importedAt)}</span>
                </div>
                <p className="mt-3 text-sm font-bold">
                  {report.currentMissingListingIds.has(order.id) ? (
                    <span className="text-rose-700">Missing listing</span>
                  ) : report.currentMissingImageIds.has(order.id) ? (
                    <span className="text-amber-700">Missing image</span>
                  ) : (
                    <span className="text-teal-700">Mapped</span>
                  )}
                </p>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Marketplace/account</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Courier</th>
                  <th className="px-3 py-3">Tracking key</th>
                  <th className="px-3 py-3">Current listing</th>
                  <th className="px-3 py-3">Imported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-950">{order.marketplace}</p>
                      <p className="text-xs text-slate-500">{order.account.accountDisplayName ?? order.account.name}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{order.sku}</td>
                    <td className="px-3 py-3 font-bold text-slate-950">{order.qty}</td>
                    <td className="px-3 py-3"><StatusBadge value={order.packStatus} /></td>
                    <td className="px-3 py-3 text-slate-700">{order.courier ?? "-"}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{maskReportTrackingKey(order)}</td>
                    <td className="px-3 py-3">
                      {report.currentMissingListingIds.has(order.id) ? (
                        <span className="font-semibold text-rose-700">Missing listing</span>
                      ) : report.currentMissingImageIds.has(order.id) ? (
                        <span className="font-semibold text-amber-700">Missing image</span>
                      ) : (
                        <span className="font-semibold text-teal-700">Mapped</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDateTime(order.importedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <SummaryTable title="Daily summary" rows={report.tables.dailySummary} />
        <SummaryTable title="SKU summary" rows={report.tables.skuSummary} />
        <SummaryTable title="Courier summary" rows={report.tables.courierSummary} />
        <SummaryTable title="Account / marketplace summary" rows={report.tables.accountSummary} />
        <SummaryTable title="Problem summary" rows={report.tables.problemSummary} />
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Recent import batches</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {report.batches.map((batch) => (
              <div key={batch.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-950">{batch.fileName}</p>
                <p className="mt-1 text-slate-600">{batch.importType} / {batch.status}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Created {batch.createdRows} / Updated {batch.updatedRows} / Duplicates {batch.duplicateRows} / Errors {batch.errorRows}
                </p>
              </div>
            ))}
            {report.batches.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">No batches for this filter.</div> : null}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
