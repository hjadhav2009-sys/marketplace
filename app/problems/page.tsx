import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { maskOperationalKey } from "@/lib/import/issues";
import { prisma } from "@/lib/prisma";
import { keepProblemOrderAction, resolveProblemOrderAction } from "./actions";

type ProblemsPageProps = {
  searchParams?: Promise<{
    tab?: string;
    accountId?: string;
    marketplace?: string;
    sku?: string;
    reason?: string;
    reporter?: string;
    from?: string;
    to?: string;
    page?: string;
    resolved?: string;
    kept?: string;
    error?: string;
  }>;
};

const PAGE_SIZE = 25;

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function tabHref(params: URLSearchParams, tab: "open" | "resolved") {
  const next = new URLSearchParams(params);
  next.set("tab", tab);
  next.delete("page");
  return `/problems?${next.toString()}`;
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/problems?${next.toString()}`;
}

export default async function ProblemOrdersPage({ searchParams }: ProblemsPageProps) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const selectedAccount = await requireAccount(user);
  const [params, accounts] = await Promise.all([searchParams, getAvailableAccounts(user)]);
  const tab = params?.tab === "resolved" ? "resolved" : "open";
  const page = parsePage(params?.page);
  const accountIds = accounts.map((account) => account.id);
  const requestedAccountId = params?.accountId;
  const selectedAccountIds =
    user.role === "OWNER" && requestedAccountId === "all"
      ? accountIds
      : requestedAccountId && accountIds.includes(requestedAccountId)
        ? [requestedAccountId]
        : [selectedAccount.id];
  const fromDate = parseDate(params?.from);
  const toDate = parseDate(params?.to, true);
  const where: Prisma.ProblemOrderWhereInput = {
    accountId: { in: selectedAccountIds },
    status: tab === "resolved" ? "RESOLVED" : "OPEN",
    reason: params?.reason?.trim() ? { contains: params.reason.trim() } : undefined,
    createdAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined,
    reportedBy: params?.reporter?.trim()
      ? {
          OR: [
            { name: { contains: params.reporter.trim() } },
            { username: { contains: params.reporter.trim() } }
          ]
        }
      : undefined,
    order: {
      marketplace: params?.marketplace || undefined,
      sku: params?.sku?.trim() ? { contains: params.sku.trim() } : undefined
    }
  };
  const currentParams = new URLSearchParams();

  for (const [key, value] of Object.entries({
    accountId: params?.accountId,
    marketplace: params?.marketplace,
    sku: params?.sku,
    reason: params?.reason,
    reporter: params?.reporter,
    from: params?.from,
    to: params?.to,
    tab
  })) {
    if (value) {
      currentParams.set(key, value);
    }
  }

  const [totalRows, problems, counts] = await Promise.all([
    prisma.problemOrder.count({ where }),
    prisma.problemOrder.findMany({
      where,
      select: {
        id: true,
        reason: true,
        details: true,
        status: true,
        resolutionNote: true,
        resolvedAt: true,
        createdAt: true,
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
        reportedBy: {
          select: {
            name: true,
            username: true
          }
        },
        order: {
          select: {
            awb: true,
            trackingId: true,
            marketplace: true,
            sku: true,
            qty: true,
            color: true,
            size: true,
            courier: true,
            pickStatus: true,
            packStatus: true,
            status: true,
            importedAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.problemOrder.groupBy({
      by: ["status"],
      where: { accountId: { in: selectedAccountIds } },
      _count: { _all: true }
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Problems"
        title="Problem order workflow"
        description="Resolve warehouse exceptions with notes, audit logs, and explicit return-to-ready control."
      />

      {params?.resolved ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Problem resolved. Order history was kept; it returns to ready only when that checkbox is selected.
        </div>
      ) : params?.kept ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Problem kept open for further review.
        </div>
      ) : params?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Could not update that problem order.
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={tabHref(currentParams, "open")} className={`rounded-md px-4 py-2 text-sm font-bold ${tab === "open" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
          Open ({countByStatus.get("OPEN") ?? 0})
        </Link>
        <Link href={tabHref(currentParams, "resolved")} className={`rounded-md px-4 py-2 text-sm font-bold ${tab === "resolved" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
          Resolved ({countByStatus.get("RESOLVED") ?? 0})
        </Link>
      </div>

      <form className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-7">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Account</span>
          <select name="accountId" defaultValue={params?.accountId ?? selectedAccount.id} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {user.role === "OWNER" ? <option value="all">All accounts</option> : null}
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
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-500">Reason</span>
          <input name="reason" defaultValue={params?.reason ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button className="mt-5 min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white xl:mt-6">Apply</button>
        <input type="hidden" name="tab" value={tab} />
        <label className="block xl:col-span-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Reporter</span>
          <input name="reporter" defaultValue={params?.reporter ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </form>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-700">Showing {totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalRows)} of {totalRows}</p>
          <div className="flex items-center gap-2">
            <Link href={pageHref(currentParams, Math.max(1, page - 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Previous</Link>
            <span className="font-semibold text-slate-600">Page {page} of {totalPages}</span>
            <Link href={pageHref(currentParams, Math.min(totalPages, page + 1))} className="rounded-md border border-slate-200 px-3 py-2 font-bold text-slate-800">Next</Link>
          </div>
        </div>

        {problems.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={tab === "open" ? "No open problem orders" : "No resolved problem orders"}
              description="When workers mark missing items, color mismatches, or other exceptions, they appear here for owner review."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {problems.map((problem) => (
              <article key={problem.id} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-950">{problem.order.sku}</h2>
                      <StatusBadge value={problem.status} />
                      <StatusBadge value={problem.order.marketplace} />
                    </div>
                    <p className="mt-2 font-semibold text-slate-800">{problem.reason}</p>
                    {problem.details ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{problem.details}</p> : null}
                    {problem.resolutionNote ? <p className="mt-1 max-w-3xl text-sm leading-6 text-teal-700">Resolution: {problem.resolutionNote}</p> : null}
                  </div>
                  <div className="text-sm text-slate-500 lg:text-right">
                    <p>{formatDateTime(problem.createdAt)}</p>
                    <p>By {problem.reportedBy?.name ?? problem.reportedBy?.username ?? "Unknown"}</p>
                    {problem.resolvedAt ? <p>Resolved {formatDateTime(problem.resolvedAt)}</p> : null}
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <dt className="font-medium text-slate-500">Account</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{problem.account.accountDisplayName ?? problem.account.name}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Qty</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{problem.order.qty}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Color / size</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{problem.order.color ?? "-"} / {problem.order.size ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Courier</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{problem.order.courier ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Tracking key</dt>
                    <dd className="mt-1 font-mono text-xs font-semibold text-slate-950">{maskOperationalKey(problem.order.trackingId ?? problem.order.awb) ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Order status</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{problem.order.packStatus}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <Link href={`/packing/${problem.order.awb}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800">
                    Open scan result
                  </Link>
                  {user.role === "OWNER" && problem.status === "OPEN" ? (
                    <>
                      <form action={resolveProblemOrderAction} className="grid min-w-[18rem] gap-2 rounded-md border border-teal-200 bg-teal-50 p-3">
                        <input type="hidden" name="problemId" value={problem.id} />
                        <textarea name="resolutionNote" placeholder="Resolution note" className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <input type="checkbox" name="returnToReady" value="1" className="h-4 w-4 rounded border-slate-300" />
                          Mark order back to ready
                        </label>
                        <SubmitButton pendingText="Resolving..." variant="primary">
                          Resolve problem
                        </SubmitButton>
                      </form>
                      <form action={keepProblemOrderAction} className="grid min-w-[14rem] gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <input type="hidden" name="problemId" value={problem.id} />
                        <input type="hidden" name="resolutionNote" value="Kept open from problem review." />
                        <SubmitButton pendingText="Saving..." variant="secondary">
                          Keep as problem
                        </SubmitButton>
                      </form>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
