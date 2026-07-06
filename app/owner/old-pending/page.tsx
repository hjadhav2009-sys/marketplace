import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { compactNumber, formatDateTime } from "@/lib/format";
import { maskOperationalKey } from "@/lib/import/issues";
import { startOfWorkDay } from "@/lib/operations/work-queue";
import { prisma } from "@/lib/prisma";
import { reviewOldPendingOrderAction } from "./actions";

type OldPendingPageProps = {
  searchParams?: Promise<{
    accountId?: string;
    marketplace?: string;
    sku?: string;
    status?: string;
    date?: string;
    page?: string;
    updated?: string;
    moved?: string;
    error?: string;
  }>;
};

const PAGE_SIZE = 50;
const reviewStatuses = [
  { value: "", label: "All review states" },
  { value: "NONE", label: "Not reviewed" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "KEEP_PENDING", label: "Keep pending" },
  { value: "CARRY_FORWARD", label: "Carry forward" },
  { value: "ARCHIVED", label: "Archived from today" }
];

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function dayBounds(value: string | undefined) {
  if (!value) {
    return null;
  }

  const start = new Date(value);

  if (!Number.isFinite(start.getTime())) {
    return null;
  }

  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { gte: start, lte: end };
}

function oldPendingHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/owner/old-pending?${next.toString()}`;
}

export default async function OldPendingReviewPage({ searchParams }: OldPendingPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const [params, accounts] = await Promise.all([searchParams, getAvailableAccounts(user)]);
  const page = parsePage(params?.page);
  const accountIds = accounts.map((account) => account.id);
  const requestedAccountId = params?.accountId;
  const selectedAccountIds =
    requestedAccountId === "all"
      ? accountIds
      : requestedAccountId && accountIds.includes(requestedAccountId)
        ? [requestedAccountId]
        : [selectedAccount.id];
  const sku = params?.sku?.trim();
  const importDay = dayBounds(params?.date);
  const where: Prisma.OrderWhereInput = {
    accountId: { in: selectedAccountIds },
    packStatus: "READY",
    importedAt: importDay ?? { lt: startOfWorkDay() },
    marketplace: params?.marketplace || undefined,
    sku: sku ? { contains: sku } : undefined,
    oldPendingReviewStatus: params?.status || undefined
  };
  const currentParams = new URLSearchParams();

  for (const [key, value] of Object.entries({
    accountId: requestedAccountId,
    marketplace: params?.marketplace,
    sku,
    status: params?.status,
    date: params?.date
  })) {
    if (value) {
      currentParams.set(key, value);
    }
  }

  const [totalRows, orders, statusCounts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      select: {
        id: true,
        accountId: true,
        marketplace: true,
        shipmentId: true,
        orderItemId: true,
        trackingId: true,
        awb: true,
        sku: true,
        qty: true,
        importedAt: true,
        oldPendingReviewStatus: true,
        oldPendingReviewedAt: true,
        oldPendingReviewNote: true,
        account: {
          select: {
            companyName: true,
            marketplace: true,
            name: true,
            accountDisplayName: true,
            accountCode: true,
            code: true
          }
        },
        uploadBatch: {
          select: {
            fileName: true,
            createdAt: true
          }
        }
      },
      orderBy: [{ accountId: "asc" }, { importedAt: "asc" }, { sku: "asc" }, { trackingId: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.order.groupBy({
      by: ["oldPendingReviewStatus"],
      where: {
        accountId: { in: selectedAccountIds },
        packStatus: "READY",
        importedAt: { lt: startOfWorkDay() }
      },
      _count: { _all: true },
      orderBy: { oldPendingReviewStatus: "asc" }
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalRows);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Owner Review"
        title="Old pending review"
        description="Old pending orders remain in history and reports. Review them separately so today's work stays clean."
      />

      {params?.updated ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
          Old pending review updated: {params.updated}.
        </div>
      ) : params?.moved ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
          Moved {params.moved} old pending order{params.moved === "1" ? "" : "s"} into review.
        </div>
      ) : params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          Could not update that old pending order.
        </div>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statusCounts.map((group) => (
          <div key={group.oldPendingReviewStatus} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">{group.oldPendingReviewStatus}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{compactNumber(group._count._all)}</p>
          </div>
        ))}
        {statusCounts.length === 0 ? (
          <div className="rounded-md border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-800">No old pending work for the current filter.</div>
        ) : null}
      </section>

      <form className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Account</span>
          <select name="accountId" defaultValue={requestedAccountId ?? selectedAccount.id} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
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
          <span className="text-xs font-semibold uppercase text-slate-500">Review state</span>
          <select name="status" defaultValue={params?.status ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {reviewStatuses.map((status) => (
              <option key={status.value || "all"} value={status.value}>{status.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Import date</span>
          <input type="date" name="date" defaultValue={params?.date ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">SKU</span>
          <input name="sku" defaultValue={params?.sku ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button className="mt-5 min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white xl:mt-6">Apply</button>
      </form>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-700">Showing {from}-{to} of {totalRows}</p>
          <div className="flex items-center gap-2">
            <Link href={oldPendingHref(currentParams, Math.max(1, page - 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Previous</Link>
            <span className="font-semibold text-slate-600">Page {page} of {totalPages}</span>
            <Link href={oldPendingHref(currentParams, Math.min(totalPages, page + 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Next</Link>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No old pending orders" description="Today work is clean for this filter. Use All pending in picker if you need to inspect every remaining order." action={{ href: "/picker", label: "Open picker" }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Account</th>
                  <th className="px-3 py-3">Marketplace</th>
                  <th className="px-3 py-3">Import / batch</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Tracking/AWB</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Review</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-950">{order.account.accountDisplayName ?? order.account.name}</p>
                      <p className="text-xs text-slate-500">{order.account.companyName} / {order.account.accountCode ?? order.account.code}</p>
                    </td>
                    <td className="px-3 py-3"><StatusBadge value={order.marketplace} /></td>
                    <td className="px-3 py-3">
                      <p>{formatDateTime(order.importedAt)}</p>
                      <p className="mt-1 max-w-[12rem] truncate text-xs text-slate-500">{order.uploadBatch?.fileName ?? "No batch"}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{order.sku}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{maskOperationalKey(order.trackingId ?? order.awb) ?? "-"}</td>
                    <td className="px-3 py-3 font-bold text-slate-950">{order.qty}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-800">{order.oldPendingReviewStatus}</p>
                      {order.oldPendingReviewedAt ? <p className="text-xs text-slate-500">{formatDateTime(order.oldPendingReviewedAt)}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <form action={reviewOldPendingOrderAction} className="grid min-w-[18rem] gap-2">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input name="note" defaultValue={order.oldPendingReviewNote ?? ""} placeholder="Optional review note" className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-xs" />
                        <div className="flex flex-wrap gap-2">
                          <button name="action" value="keep" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">Keep pending</button>
                          <button name="action" value="carry-forward" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">Carry forward</button>
                          <button name="action" value="archive" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">Archive from today</button>
                          <button name="action" value="problem" className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">Move to problem</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
