import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { compactNumber, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { importJobPageWindow, importJobProgressPercent, IMPORT_JOB_PAGE_SIZE, IMPORT_JOB_PAGE_SIZES } from "@/src/lib/import-jobs/progress";

type ImportsPageProps = {
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
    accountId?: string;
    marketplace?: string;
    importType?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
};

const importTypes = [
  { value: "", label: "All import types" },
  { value: "FLIPKART_LISTING_MASTER", label: "Flipkart Listing Master" },
  { value: "FLIPKART_ORDER", label: "Flipkart Daily Orders" }
];

const statuses = [
  { value: "", label: "All statuses" },
  { value: "QUEUED", label: "Queued" },
  { value: "RUNNING", label: "Running" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" }
];

const marketplaces = [
  { value: "", label: "All marketplaces" },
  { value: "FLIPKART", label: "Flipkart" },
  { value: "MEESHO", label: "Meesho legacy" },
  { value: "AMAZON", label: "Amazon" },
  { value: "OTHER", label: "Other" }
];

function importTypeLabel(importType: string) {
  return importType === "FLIPKART_LISTING_MASTER" ? "Flipkart Listings" : importType === "FLIPKART_ORDER" ? "Flipkart Orders" : importType;
}

function reviewHref(job: { importType: string; batchId: string | null }) {
  if (!job.batchId) {
    return null;
  }

  return job.importType === "FLIPKART_LISTING_MASTER" ? `/owner/sku-mappings/import?batchId=${job.batchId}` : `/owner/uploads/${job.batchId}/review`;
}

function safePageSize(value: string | undefined) {
  const parsed = Number.parseInt(value ?? String(IMPORT_JOB_PAGE_SIZE), 10);
  return IMPORT_JOB_PAGE_SIZES.includes(parsed as (typeof IMPORT_JOB_PAGE_SIZES)[number]) ? parsed : IMPORT_JOB_PAGE_SIZE;
}

function dateBoundary(value: string | undefined, endOfDay = false) {
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

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/owner/imports?${next.toString()}`;
}

function exportHref(jobId: string, format: "csv" | "xlsx" | "txt", type: "summary" | "issues" = "summary") {
  return `/owner/imports/export?jobId=${encodeURIComponent(jobId)}&format=${format}&type=${type}`;
}

export default async function OwnerImportsPage({ searchParams }: ImportsPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const [params, accounts] = await Promise.all([searchParams, getAvailableAccounts(user)]);
  const pageSize = safePageSize(params?.pageSize);
  const accountIds = accounts.map((account) => account.id);
  const requestedAccountId = params?.accountId;
  const selectedAccountFilter =
    requestedAccountId === "all"
      ? accountIds
      : requestedAccountId && accountIds.includes(requestedAccountId)
        ? [requestedAccountId]
        : [selectedAccount.id];
  const fromDate = dateBoundary(params?.from);
  const toDate = dateBoundary(params?.to, true);
  const search = params?.q?.trim();
  const where: Prisma.ImportJobWhereInput = {
    accountId: { in: selectedAccountFilter },
    marketplace: params?.marketplace || undefined,
    importType: params?.importType || undefined,
    status: params?.status || undefined,
    createdAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined,
    OR: search
      ? [
          { id: { contains: search } },
          { fileName: { contains: search } }
        ]
      : undefined
  };
  const totalRows = await prisma.importJob.count({ where });
  const window = importJobPageWindow(totalRows, params?.page, pageSize);
  const jobs = await prisma.importJob.findMany({
    where,
    include: {
      account: {
        select: {
          companyName: true,
          marketplace: true,
          name: true,
          accountDisplayName: true,
          code: true,
          accountCode: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    skip: window.skip,
    take: window.take
  });
  const currentParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      currentParams.set(key, value);
    }
  }
  currentParams.set("pageSize", String(window.pageSize));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Owner"
        title="Import Progress"
        description="Track large marketplace imports without freezing the browser. Filter by account, marketplace, status, or file, then open progress or download a safe summary."
        action={{ href: "/owner/uploads/new", label: "Upload file" }}
      />

      <form className="mb-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm" action="/owner/imports">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Account</span>
            <select name="accountId" defaultValue={requestedAccountId ?? selectedAccount.id} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="all">All active accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.marketplace} / {account.accountDisplayName ?? account.name}
                </option>
              ))}
            </select>
          </label>
          <SelectField name="marketplace" label="Marketplace" value={params?.marketplace} options={marketplaces} />
          <SelectField name="importType" label="Import type" value={params?.importType} options={importTypes} />
          <SelectField name="status" label="Status" value={params?.status} options={statuses} />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <input
              name="q"
              defaultValue={params?.q ?? ""}
              placeholder="File name or job ID"
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Rows</span>
            <select name="pageSize" defaultValue={String(window.pageSize)} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
              {IMPORT_JOB_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">From</span>
            <input name="from" type="date" defaultValue={params?.from ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">To</span>
            <input name="to" type="date" defaultValue={params?.to ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white">Apply filters</button>
          <Link href="/owner/imports" className="inline-flex min-h-11 items-center rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800">
            Reset
          </Link>
        </div>
      </form>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-700">
            Showing {compactNumber(window.from)}-{compactNumber(window.to)} of {compactNumber(totalRows)} jobs
          </p>
          <p className="text-xs font-medium text-slate-500">Default page size is 10. Summary exports do not include customer/order row data.</p>
        </div>

        {jobs.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No import jobs found" description="Change the filters or upload Flipkart Listings / Daily Orders to see job progress here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Import type</th>
                  <th className="px-3 py-3">Marketplace</th>
                  <th className="px-3 py-3">Account</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Progress</th>
                  <th className="px-3 py-3">Rows</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="px-3 py-3">Unchanged</th>
                  <th className="px-3 py-3">Duplicates</th>
                  <th className="px-3 py-3">Warnings</th>
                  <th className="px-3 py-3">Errors</th>
                  <th className="px-3 py-3">Missing listing</th>
                  <th className="px-3 py-3">Missing image</th>
                  <th className="px-3 py-3">Started</th>
                  <th className="px-3 py-3">Finished</th>
                  <th className="px-3 py-3">Updated at</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const progress = importJobProgressPercent(job);
                  const review = reviewHref(job);
                  const issueCount = job.errorRows + job.warningRows + job.missingImageRows + job.missingListingRows;

                  return (
                    <tr key={job.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-bold text-slate-950">{importTypeLabel(job.importType)}</p>
                        <p className="mt-1 max-w-[15rem] truncate text-xs text-slate-500">{job.fileName}</p>
                        <p className="mt-1 font-mono text-xs text-slate-400">{job.id.slice(0, 12)}</p>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800">{job.marketplace}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-950">{job.account.accountDisplayName ?? job.account.name}</p>
                        <p className="text-xs text-slate-500">{job.account.companyName} / {job.account.accountCode ?? job.account.code}</p>
                      </td>
                      <td className="px-3 py-3"><StatusBadge value={job.status} /></td>
                      <td className="px-3 py-3">
                        <div className="w-24">
                          <div className="flex justify-between text-xs font-bold text-slate-700">
                            <span>{progress}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-berry" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">{compactNumber(job.processedRows)} / {compactNumber(job.totalRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.createdRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.updatedRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.unchangedRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.duplicateRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.warningRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.errorRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.missingListingRows)}</td>
                      <td className="px-3 py-3">{compactNumber(job.missingImageRows)}</td>
                      <td className="px-3 py-3">{formatDateTime(job.startedAt)}</td>
                      <td className="px-3 py-3">{formatDateTime(job.finishedAt)}</td>
                      <td className="px-3 py-3">{formatDateTime(job.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-[12rem] flex-wrap gap-2">
                          <Link href={`/owner/imports/${job.id}`} prefetch className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">
                            Open progress
                          </Link>
                          {job.status === "COMPLETED" && review ? (
                            <Link href={review} prefetch className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">
                              Open review
                            </Link>
                          ) : null}
                          {issueCount > 0 && job.batchId ? (
                            <Link href={`/owner/imports/${job.id}/issues`} prefetch className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                              View issues
                            </Link>
                          ) : null}
                          <Link href={exportHref(job.id, "csv")} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">
                            CSV
                          </Link>
                          <Link href={exportHref(job.id, "xlsx")} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">
                            XLSX
                          </Link>
                          <Link href={exportHref(job.id, "txt")} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800">
                            TXT
                          </Link>
                          {issueCount > 0 && job.batchId ? (
                            <Link href={exportHref(job.id, "csv", "issues")} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                              Issues CSV
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-600">
            Page {window.page} of {window.totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <PaginationLink href={pageHref(currentParams, Math.max(1, window.page - 1))} disabled={window.page <= 1}>
              Previous
            </PaginationLink>
            {Array.from({ length: Math.min(window.totalPages, 7) }, (_, index) => {
              const page = Math.max(1, Math.min(window.totalPages - 6, window.page - 3)) + index;
              return (
                <PaginationLink key={page} href={pageHref(currentParams, page)} active={page === window.page}>
                  {String(page)}
                </PaginationLink>
              );
            })}
            <PaginationLink href={pageHref(currentParams, Math.min(window.totalPages, window.page + 1))} disabled={window.page >= window.totalPages}>
              Next
            </PaginationLink>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function SelectField({
  name,
  label,
  value,
  options
}: {
  name: string;
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2">
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PaginationLink({
  href,
  children,
  active = false,
  disabled = false
}: {
  href: string;
  children: string;
  active?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex min-h-10 items-center rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      prefetch
      className={`inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-semibold ${
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      {children}
    </Link>
  );
}
