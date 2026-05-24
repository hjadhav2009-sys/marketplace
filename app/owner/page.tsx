import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { compactNumber, formatDateTime } from "@/lib/format";
import { getDashboardStats, getRecentBatches, getRecentOrders } from "@/lib/data";
import { requireAccount, requireUser } from "@/lib/auth";

export default async function OwnerDashboardPage() {
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
        eyebrow="Owner"
        title="Daily warehouse dashboard"
        description="Upload label PDFs, maintain SKU image mappings, and monitor the pick-and-pack queue."
        action={{ href: "/owner/uploads/new", label: "Upload labels" }}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Ready orders" value={compactNumber(stats.readyOrders)} tone="berry" />
        <StatCard label="Packed" value={compactNumber(stats.packedOrders)} tone="mint" />
        <StatCard label="Problems" value={compactNumber(stats.problemOrders)} tone="clay" />
        <StatCard label="SKU images" value={compactNumber(stats.skuMappings)} />
        <StatCard label="Batches" value={compactNumber(stats.batches)} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Recent orders</h2>
            <Link href="/picker" className="text-sm font-semibold text-berry hover:text-pink-800">
              View pick list
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <div key={order.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold text-slate-950">{order.sku}</p>
                  <p className="text-sm text-slate-600">
                    AWB {order.awb} · Qty {order.quantity} · {order.courier ?? "Courier pending"}
                  </p>
                </div>
                <StatusBadge value={order.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Upload batches</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {batches.map((batch) => (
              <Link
                key={batch.id}
                href={`/owner/uploads/${batch.id}/review`}
                className="block px-4 py-4 transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{batch.filename}</p>
                    <p className="text-sm text-slate-600">
                      {batch._count.orders} orders · {formatDateTime(batch.createdAt)}
                    </p>
                  </div>
                  <StatusBadge value={batch.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
