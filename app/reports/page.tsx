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
  const statusCounts = new Map(summary.ordersByStatus.map((row) => [row.status, row._count.id]));

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
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{batch.filename}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={batch.status} />
                  </td>
                  <td className="px-4 py-3">{batch._count.orders}</td>
                  <td className="px-4 py-3">{formatDateTime(batch.createdAt)}</td>
                </tr>
              ))}
              {summary.batches.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                    No batches yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Status breakdown</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {summary.ordersByStatus.map((row) => (
            <div key={row.status} className="rounded-md bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">{titleCase(row.status)}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{row._count.id}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
