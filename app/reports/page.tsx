import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { getReportSummary } from "@/lib/data";
import { compactNumber, formatDateTime, titleCase } from "@/lib/format";

export default async function ReportsPage() {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const summary = await getReportSummary(account.id);
  const statusCounts = new Map(summary.ordersByStatus.map((row) => [row.packStatus, row._count.id]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Reports"
        title="Daily operations report"
        description="Simple operational counters for owners. Future exports can build on these query helpers."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ready" value={compactNumber(statusCounts.get("READY") ?? 0)} tone="berry" />
        <StatCard label="Packed" value={compactNumber(statusCounts.get("PACKED") ?? 0)} tone="mint" />
        <StatCard label="Problem" value={compactNumber(statusCounts.get("PROBLEM") ?? 0)} tone="clay" />
        <StatCard label="Scans today" value={compactNumber(summary.scansToday)} />
        <StatCard label="Duplicates skipped today" value={compactNumber(summary.duplicateIssuesToday)} tone="clay" />
        <StatCard label="Missing image SKUs" value={compactNumber(summary.missingImageMappings.length)} />
        <StatCard label="Broken image URLs" value={compactNumber(summary.brokenImageMappings.length)} />
      </section>

      <section className="mt-8 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Recent batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Missing images</th>
                <th className="px-4 py-3">Skipped</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{batch.fileName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={batch.status} />
                  </td>
                  <td className="px-4 py-3">{batch._count.orders}</td>
                  <td className="px-4 py-3">{batch.createdRows}</td>
                  <td className="px-4 py-3">{batch.updatedRows}</td>
                  <td className="px-4 py-3">{batch.missingImageRows}</td>
                  <td className="px-4 py-3">{batch.skippedRows + batch.duplicateRows}</td>
                  <td className="px-4 py-3">{batch.errorRows}</td>
                  <td className="px-4 py-3">{formatDateTime(batch.createdAt)}</td>
                </tr>
              ))}
              {summary.batches.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    No batches yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Missing image SKUs</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {summary.missingImageMappings.map((order) => (
              <div key={order.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-950">{order.sku}</p>
                <p className="text-slate-600">AWB {order.awb} · Order {order.orderNo}</p>
              </div>
            ))}
            {summary.missingImageMappings.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No missing images.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Broken image URL SKUs</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {summary.brokenImageMappings.map((mapping) => (
              <div key={mapping.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-950">{mapping.sku}</p>
                <p className="text-xs font-semibold text-rose-700">Image health: {mapping.imageHealth}</p>
                <p className="break-all text-slate-600">{mapping.imageUrl}</p>
              </div>
            ))}
            {summary.brokenImageMappings.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No broken image URLs recorded.</div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-950">Recent audit logs</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {summary.auditLogs.map((log) => (
            <div key={log.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]">
              <div>
                <p className="font-semibold text-slate-950">{titleCase(log.action)}</p>
                <p className="text-slate-600">
                  {log.user?.name ?? "System"} {log.entityType ? `· ${log.entityType}` : ""}
                </p>
              </div>
              <p className="text-slate-500">{formatDateTime(log.createdAt)}</p>
            </div>
          ))}
          {summary.auditLogs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No audit logs yet.</div>
          ) : null}
        </div>
      </section>

      <section className="mt-8 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Status breakdown</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {summary.ordersByStatus.map((row) => (
            <div key={row.packStatus} className="rounded-md bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">{titleCase(row.packStatus)}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{row._count.id}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
