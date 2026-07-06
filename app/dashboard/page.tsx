import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { compactNumber, formatDateTime } from "@/lib/format";
import { getDashboardStats, getRecentBatches, getRecentOrders } from "@/lib/data";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const [stats, orders, batches, latestListingImport, latestOrderImport] = await Promise.all([
    getDashboardStats(account.id),
    getRecentOrders(account.id),
    getRecentBatches(account.id),
    prisma.importJob.findFirst({
      where: {
        accountId: account.id,
        marketplace: account.marketplace,
        importType: "FLIPKART_LISTING_MASTER"
      },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.uploadBatch.findFirst({
      where: { accountId: account.id },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  const accountName = account.accountDisplayName ?? account.name;
  const accountCode = account.accountCode ?? account.code;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Dashboard"
        title="Warehouse overview"
        description="Monitor today's pick-and-pack work, import Flipkart files, and review problem orders."
        action={{ href: "/owner/uploads/new", label: "Import files" }}
      />

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected company / seller account</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{account.companyName} / {accountName}</h2>
            <p className="mt-1 text-sm text-slate-600">
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{account.marketplace}</span>{" "}
              <span className="font-medium">{accountCode}</span>
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest listing master</p>
              <p className="mt-1 font-bold text-slate-950">{formatDateTime(latestListingImport?.createdAt)}</p>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest order import</p>
              <p className="mt-1 font-bold text-slate-950">{formatDateTime(latestOrderImport?.createdAt)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Today ready" value={compactNumber(stats.readyOrders)} tone="berry" />
        <StatCard label="Packed today" value={compactNumber(stats.packedOrders)} tone="mint" />
        <StatCard label="Problems today" value={compactNumber(stats.problemOrders)} tone="clay" />
        <StatCard label="SKU images" value={compactNumber(stats.skuMappings)} />
        <StatCard label="Batches" value={compactNumber(stats.batches)} />
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction href="/owner/uploads/new" label="Import orders" />
        <QuickAction href="/owner/uploads/new" label="Import listing master" />
        <QuickAction href="/picker" label="Open picker" />
        <QuickAction href="/packing" label="Open packer" />
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

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      prefetch
      className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:border-berry hover:bg-pink-50"
    >
      {label}
    </Link>
  );
}
