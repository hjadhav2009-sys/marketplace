import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { compactNumber, formatDateTime } from "@/lib/format";
import { getDashboardStats, getRecentBatches, getRecentOrders } from "@/lib/data";
import { requireAccount, requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const [stats, orders, batches] = await Promise.all([
    getDashboardStats(account.id),
    getRecentOrders(account.id),
    getRecentBatches(account.id)
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Dashboard"
        title="Warehouse overview"
        description="Monitor today's pick-and-pack work, import Flipkart files, and review problem orders."
        action={{ href: "/owner/uploads/new", label: "Import files" }}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Ready orders" value={compactNumber(stats.readyOrders)} tone="berry" />
        <StatCard label="Packed" value={compactNumber(stats.packedOrders)} tone="mint" />
        <StatCard label="Problems" value={compactNumber(stats.problemOrders)} tone="clay" />
        <StatCard label="SKU images" value={compactNumber(stats.skuMappings)} />
        <StatCard label="Batches" value={compactNumber(stats.batches)} />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Recent work</h2>
            <Link prefetch href="/picker" className="text-sm font-semibold text-berry hover:text-pink-800">
              Open picker
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {orders.length > 0 ? (
              orders.map((order) => (
                <div key={order.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="break-words font-semibold text-slate-950">{order.sku}</p>
                    <p className="text-sm text-slate-600">
                      Qty {order.qty} / {order.courier ?? "Courier pending"}
                    </p>
                  </div>
                  <StatusBadge value={order.packStatus} />
                </div>
              ))
            ) : (
              <div className="px-4 py-5 text-sm text-slate-500">No recent orders for this account.</div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Recent imports</h2>
            <Link prefetch href="/owner/imports" className="text-sm font-semibold text-berry hover:text-pink-800">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {batches.length > 0 ? (
              batches.map((batch) => (
                <Link
                  key={batch.id}
                  prefetch
                  href={`/owner/uploads/${batch.id}/review`}
                  className="block px-4 py-4 transition hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{batch.fileName}</p>
                      <p className="text-sm text-slate-600">
                        {batch._count.orders} orders / {formatDateTime(batch.createdAt)}
                      </p>
                    </div>
                    <StatusBadge value={batch.status} />
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-5 text-sm text-slate-500">No imports yet.</div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
